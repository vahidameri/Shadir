import { createHash, randomUUID, scryptSync } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve, sep, extname } from 'node:path'
import pg from 'pg'
import { Script } from 'node:vm'
import { gzipSync, gunzipSync } from 'node:zlib'

const pool = new pg.Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: readFileSync(process.env.PG_PASSWORD_FILE || '/run/secrets/db_password', 'utf8').trim(),
  connectionTimeoutMillis: 5000,
})
pool.on('error', error => console.error('PostgreSQL connection:', error.code || error.name))
await pool.query(`CREATE TABLE IF NOT EXISTS sheets (name TEXT PRIMARY KEY, rows JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS properties (name TEXT PRIMARY KEY, value TEXT NOT NULL);`)

const code = new Script(readFileSync('apps-script/Code.gs', 'utf8'), { filename: 'Code.gs' })
const cache = new Map()
const zone = 'Asia/Tehran'
const unavailable = () => { throw new Error('این قابلیت Google در استقرار ASUS پیکربندی نشده است.') }
const cacheService = {
  get(key) {
    const entry = cache.get(key)
    return entry?.expires > Date.now() ? entry.value : null
  },
  put(key, value, seconds) {
    if (cache.size >= 4000 && !cache.has(key)) {
      for (const [name, entry] of cache) if (entry.expires <= Date.now()) cache.delete(name)
      if (cache.size >= 4000) throw new Error('ظرفیت موقت درخواست‌ها پر است.')
    }
    cache.set(key, { value, expires: Date.now() + seconds * 1000 })
  },
  remove(key) { cache.delete(key) },
  getAll(keys) {
    return Object.fromEntries(keys.map(key => [key, this.get(key)]).filter(([, value]) => value !== null))
  },
  putAll(entries, seconds) {
    for (const [key, value] of Object.entries(entries)) this.put(key, value, seconds)
  },
}

function sheet(name, rows, save) {
  function write() {
    save(name, rows)
  }
  function range(row, column, height = 1, width = 1) {
    const values = () => Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => rows[row - 1 + y]?.[column - 1 + x] ?? ''))
    return {
      getValues: values,
      setValues(input) {
        for (let y = 0; y < height; y++) {
          const position = row - 1 + y
          while (rows.length <= position) rows.push([])
          const target = rows[position]
          for (let x = 0; x < width; x++) {
            const index = column - 1 + x
            const value = input[y][x]
            target[index] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value
          }
        }
        write()
        return this
      },
      setValue(value) { return this.setValues([[value]]) },
      clearContent() {
        this.setValues(values().map(cells => cells.map(() => '')))
        while (rows.length && rows.at(-1).every(value => value === '' || value == null)) rows.pop()
        write()
      },
      setFontWeight() { return this },
      setBackground() { return this },
      setNumberFormat() { return this },
      createTextFinder(text) {
        return {
          matchEntireCell() { return this },
          findNext() {
            const index = values().findIndex(cells => String(cells[0]) === text)
            return index < 0 ? null : { getRow: () => row + index }
          },
        }
      },
    }
  }
  return {
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((max, row) => Math.max(max, row.length), 0),
    getMaxRows: () => Math.max(1000, rows.length),
    getRange: range,
    getDataRange() { return range(1, 1, rows.length, this.getLastColumn()) },
    setFrozenRows() {},
    appendRow(values) { range(rows.length + 1, 1, 1, values.length).setValues([values]) },
    deleteRow(row) { rows.splice(row - 1, 1); write() },
  }
}

const blob = data => ({
  getBytes: () => Array.from(Buffer.from(data)),
  getDataAsString: () => Buffer.from(data).toString('utf8'),
})

function appContext(spreadsheet, properties) {
  const context = {
    SpreadsheetApp: { getActive: () => spreadsheet, openByUrl: unavailable },
    PropertiesService: { getScriptProperties: () => properties },
    CacheService: { getScriptCache: () => cacheService },
    Session: { getScriptTimeZone: () => zone },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) },
    Utilities: {
      getUuid: randomUUID,
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, input) => createHash(algorithm).update(String(input)).digest(),
      base64EncodeWebSafe: data => Buffer.from(data).toString('base64url'),
      base64Encode: data => Buffer.from(data).toString('base64'),
      base64Decode: data => Array.from(Buffer.from(data, 'base64')),
      newBlob: blob,
      gzip: data => blob(gzipSync(Buffer.from(data.getBytes()))),
      ungzip: data => blob(gunzipSync(Buffer.from(data.getBytes()))),
      formatDate(date, timeZone, format) {
        const formatter = new Intl.DateTimeFormat('en-GB', {
          timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
          minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
        })
        const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]))
        const tokens = { yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second,
          u: String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1) }
        return format.replace(/yyyy|MM|dd|HH|mm|ss|u|'T'/g, token => tokens[token] ?? 'T')
      },
    },
    MailApp: { sendEmail: unavailable },
    UrlFetchApp: { fetch: unavailable },
    ScriptApp: { getProjectTriggers: () => [], getOAuthToken: unavailable },
    Logger: { log() {} },
  }
  code.runInNewContext(context)
  // Use a memory-hard hash for local credentials. Upstream Apps Script remains unchanged.
  context.pwHash_ = password => {
    let salt = properties.getProperty('LOCAL_PASSWORD_SALT')
    if (!salt) {
      salt = randomUUID()
      properties.setProperty('LOCAL_PASSWORD_SALT', salt)
    }
    return scryptSync(String(password), salt, 32).toString('hex')
  }
  return context
}

async function atomic(work, valid = () => true) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // The Apps Script handlers and cache expect one request at a time.
    await client.query('SELECT pg_advisory_xact_lock(773817)')
    const sheets = new Map((await client.query('SELECT name, rows FROM sheets')).rows.map(row => [row.name, row.rows]))
    const props = new Map((await client.query('SELECT name, value FROM properties')).rows.map(row => [row.name, row.value]))
    const dirtySheets = new Set()
    const dirtyProperties = new Set()
    const save = (name, rows) => {
      sheets.set(name, rows)
      dirtySheets.add(name)
    }
    const spreadsheet = {
      getSheetByName(name) { return sheets.has(name) ? sheet(name, sheets.get(name), save) : null },
      insertSheet(name) { save(name, []); return sheet(name, sheets.get(name), save) },
    }
    const properties = {
      getProperty: name => props.get(String(name)) ?? null,
      setProperty(name, value) {
        props.set(String(name), String(value))
        dirtyProperties.add(String(name))
      },
      deleteProperty(name) {
        props.delete(String(name))
        dirtyProperties.add(String(name))
      },
      getProperties: () => Object.fromEntries([...props].filter(([name]) => name.startsWith('sess.'))),
    }
    const result = work(appContext(spreadsheet, properties), properties)
    if (!valid(result)) {
      await client.query('ROLLBACK')
      for (const key of cache.keys()) if (!key.startsWith('pw.n.')) cache.delete(key)
      return result
    }
    for (const name of dirtySheets) {
      await client.query('INSERT INTO sheets VALUES ($1, $2) ON CONFLICT(name) DO UPDATE SET rows = excluded.rows', [name, JSON.stringify(sheets.get(name))])
    }
    for (const name of dirtyProperties) {
      if (!props.has(name)) await client.query('DELETE FROM properties WHERE name = $1', [name])
      else await client.query('INSERT INTO properties VALUES ($1, $2) ON CONFLICT(name) DO UPDATE SET value = excluded.value', [name, props.get(name)])
    }
    await client.query('COMMIT')
    return result
  } catch (error) {
    for (const key of cache.keys()) if (!key.startsWith('pw.n.')) cache.delete(key)
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

if (process.argv[2] === 'bootstrap') {
  const password = readFileSync(0, 'utf8').trim()
  if (password.length < 24 || password.length > 128) throw new Error('Provide a 24–128 character bootstrap password on stdin')
  await atomic((app, properties) => {
    if (properties.getProperty('TEAM_PASSWORD')) return
    for (const [name, headers] of Object.entries(app.SCHEMA)) app.ensureSheet_(name, headers)
    app.ensureSheet_(app.LOG_SHEET, ['time', 'user', 'action', 'sheet', 'id'])
    app.setTeamPassword_(password)
    app.upsert_('Team', { id: 'm1', name: 'Admin', username: 'admin', role: 'pgm', access: 'super', team: 'PMO', active: 'true', capacity: 100 }, { name: 'bootstrap' })
  })
  await pool.end()
  process.exit(0)
}

if (!(await pool.query("SELECT 1 FROM properties WHERE name = 'TEAM_PASSWORD'")).rowCount) {
  throw new Error('Initialize the database before starting the web service')
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.jpg': 'image/jpeg' }
const dist = resolve('dist')
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
const loginThrottle = new Map()
const disabledActions = new Set(['otpSend', 'otpVerify', 'otpLink', 'upload', 'syncMeeting',
  'mailTask', 'mailMinutes', 'mailCartable', 'readSheet'])

createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  try {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/healthz' && req.method === 'GET') {
      return json(res, 200, { ok: (await pool.query('SELECT 1')).rowCount === 1 })
    }
    if (url.pathname === '/api') {
      if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { ok: false })
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { ok: false })
      let params = Object.fromEntries(url.searchParams)
      if (req.method === 'POST') {
        const chunks = []
        let length = 0
        for await (const chunk of req) {
          length += chunk.length
          if (length > 8 * 1024 * 1024) {
            json(res, 413, { ok: false, error: 'درخواست بیش از حد بزرگ است.' })
            return
          }
          chunks.push(chunk)
        }
        try {
          params = JSON.parse(Buffer.concat(chunks).toString('utf8'), (key, value) => {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid property')
            return value
          })
        }
        catch { return json(res, 400, { ok: false, error: 'درخواست نامعتبر است.' }) }
      }
      if (!params || typeof params !== 'object' || Array.isArray(params) || typeof params.action !== 'string') {
        return json(res, 400, { ok: false, error: 'درخواست نامعتبر است.' })
      }
      if (Object.hasOwn(params, 'email_') || params.access_token) return json(res, 403, { ok: false, error: 'روش ورود نامعتبر است.' })
      if (disabledActions.has(params.action)) return json(res, 501, { ok: false, error: 'این قابلیت Google در استقرار ASUS پیکربندی نشده است.' })
      if (params.action === 'pwLogin') {
        if (typeof params.username !== 'string' || params.username.length > 160 ||
            typeof params.password !== 'string' || params.password.length > 128) return json(res, 400, { ok: false, error: 'نام کاربری یا رمز نامعتبر است.' })
        const bucket = req.socket.remoteAddress
        const now = Date.now()
        for (const [ip, entry] of loginThrottle) if (entry.until < now) loginThrottle.delete(ip)
        const entry = loginThrottle.get(bucket) || { count: 0, until: now + 600000 }
        if (entry.count >= 30) return json(res, 429, { ok: false, error: 'تلاش زیاد؛ ۱۰ دقیقه بعد دوباره امتحان کنید.' })
        entry.count++
        loginThrottle.set(bucket, entry)
      }
      const output = await atomic(app => {
        const text = req.method === 'GET' ? app.doGet({ parameter: params }) : app.doPost({ postData: { contents: JSON.stringify(params) } })
        return JSON.parse(text)
      }, value => value.ok)
      if (params.action === 'pwLogin' && output.ok) loginThrottle.delete(req.socket.remoteAddress)
      return json(res, 200, output)
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false })
    const pathname = decodeURIComponent(url.pathname)
    const path = resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!path.startsWith(dist + sep) || !statSync(path, { throwIfNoEntry: false })?.isFile()) {
      return json(res, 404, { ok: false })
    }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
    res.end(req.method === 'HEAD' ? undefined : readFileSync(path))
  } catch (error) {
    console.error(error.name)
    if (!res.headersSent) json(res, 500, { ok: false, error: 'خطای داخلی سرور' })
    else res.end()
  }
}).listen(8080, '0.0.0.0')
