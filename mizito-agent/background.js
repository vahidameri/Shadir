// The scheduler and the line to Madar. Every 15 minutes (and when a new mention arrives on the live
// connection) it asks an open Mizito tab to read what changed; once a day the read goes all the way
// back to the cutoff. What the tab finds is posted to Madar with this person's agent key.
const QUICK_MIN = 15
const FULL_EVERY = 20 * 3600000

const get = (k) => chrome.storage.local.get(k).then((x) => x[k])
const set = (o) => chrome.storage.local.set(o)
const status = async (patch) => set({ status: { ...((await get('status')) || {}), ...patch } })

// a worker that was stopped mid-read left "running" behind: the read is over
get('status').then((st) => st && st.state === 'running' && status({ state: 'idle', progress: '' }))

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('quick', { periodInMinutes: QUICK_MIN, delayInMinutes: 1 }))
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('quick', { periodInMinutes: QUICK_MIN, delayInMinutes: 1 }))
chrome.alarms.onAlarm.addListener((a) => a.name === 'quick' && start(null, 'schedule'))

/** Posts to Madar's data address with the agent key (text/plain: no preflight). */
async function madar(body) {
  const conn = await get('conn')
  if (!conn || !conn.u || !conn.k) return { ok: false, error: 'افزونه به مدار وصل نیست' }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 120000)
  try {
    const res = await fetch(conn.u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, agent: conn.k }), redirect: 'follow', signal: ctl.signal })
    const text = await res.text()
    if (text.trimStart().startsWith('<')) return { ok: false, error: 'آدرس مدار به‌جای داده صفحه برگرداند؛ کد اتصال را دوباره بگیرید' }
    return JSON.parse(text)
  } catch (e) {
    return { ok: false, error: ctl.signal.aborted ? 'مدار پاسخ نداد' : String((e && e.message) || e) }
  } finally {
    clearTimeout(timer)
  }
}

// ---- checking a task link in Mizito itself ----
// The reading tab asks to open a link (a task, or the assistant's chat) in a background tab; the
// agent in that tab says whether the task really shows there, and takes the link from Mizito's own
// «لینک وظیفه». The tab is closed right after.
const probes = new Map() // tabId → { job, done }
async function probe(job) {
  const tab = await chrome.tabs.create({ url: job.url, active: false })
  return new Promise((resolve) => {
    const finish = (r) => {
      if (!probes.has(tab.id)) return
      probes.delete(tab.id)
      clearTimeout(timer)
      chrome.tabs.remove(tab.id).catch(() => {})
      resolve(r)
    }
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 45000)
    probes.set(tab.id, { job, done: finish })
  })
}

let running = false
/** One read at a time, in the first open Mizito tab. full: null = decide (a full read once a day). */
async function start(full, reason, force) {
  if (running) return { ok: false, error: 'در حال خواندن است' }
  const conn = await get('conn')
  if (!conn) return { ok: false, error: 'افزونه به مدار وصل نیست' }
  const st = (await get('status')) || {}
  if (full === null) full = !st.full_at || Date.now() - st.full_at > FULL_EVERY
  const tabs = (await chrome.tabs.query({ url: 'https://mizito.noyanet.com/*' })).filter((t) => !probes.has(t.id))
  if (!tabs.length) {
    await status({ state: 'idle', note: 'تب میزیتو باز نیست؛ با باز کردن میزیتو، خواندن ادامه پیدا می‌کند', due: true })
    return { ok: false, error: 'یک تب میزیتو باز کنید' }
  }
  running = true
  if (force) full = true
  await status({ state: 'running', full, reason, started: Date.now(), note: '', due: false, progress: '' })
  try {
    let res
    for (const tab of tabs) {
      try {
        res = await chrome.tabs.sendMessage(tab.id, { type: 'run', full, force: !!force })
        if (res) break
      } catch (e) {
        res = { ok: false, error: 'صفحه‌ی میزیتو را یک بار رفرش کنید' }
      }
    }
    if (res && res.ok) {
      await status({ state: 'idle', ok_at: Date.now(), error: '', stats: res.stats, ...(full ? { full_at: Date.now() } : {}), progress: '' })
    } else {
      const error = (res && res.error) || 'خطای ناشناخته'
      await status({ state: 'idle', error, error_at: Date.now(), progress: '' })
      // Madar shows the agent's last error next to its name
      await madar({ action: 'mzIngest', items: [], error, version: chrome.runtime.getManifest().version })
    }
    return res
  } finally {
    running = false
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return
  if (msg.type === 'madar') {
    madar(msg.body).then(reply)
    return true
  }
  if (msg.type === 'beat') return
  if (msg.type === 'progress') {
    status({ progress: msg.text })
    return
  }
  if (msg.type === 'request') {
    // from the page (live mention) or the popup (buttons)
    start(msg.full === undefined ? null : msg.full, msg.reason || 'manual', !!msg.force).then(reply)
    return true
  }
  if (msg.type === 'hello') {
    const p = sender.tab && probes.get(sender.tab.id)
    if (p) {
      reply({ probe: p.job })
      return
    }
    // a Mizito tab opened: run a read that was due while none was open
    get('status').then((st) => st && st.due && start(null, 'tab'))
    reply({})
    return
  }
  if (msg.type === 'probe') {
    probe(msg.job).then(reply)
    return true
  }
  if (msg.type === 'probe-result') {
    const p = sender.tab && probes.get(sender.tab.id)
    if (p) p.done(msg.result)
    return
  }
  if (msg.type === 'connect') {
    connect(msg.code).then(reply)
    return true
  }
})

/** "madar:<base64 JSON {u, k, n}>" from Madar → Mizito → settings → agent. */
async function connect(code) {
  let conn
  try {
    const raw = String(code || '').trim().replace(/^madar:/, '')
    conn = JSON.parse(decodeURIComponent(escape(atob(raw))))
  } catch (e) {
    return { ok: false, error: 'کد اتصال درست نیست' }
  }
  if (!conn.u || !conn.k) return { ok: false, error: 'کد اتصال کامل نیست' }
  await set({ conn })
  const r = await madar({ action: 'mzHello' })
  if (!r.ok) {
    await chrome.storage.local.remove('conn')
    return r
  }
  await set({ conn: { ...conn, n: r.row.account, cutoff: r.row.cutoff }, status: { state: 'idle' } })
  chrome.alarms.create('quick', { periodInMinutes: QUICK_MIN, delayInMinutes: 1 })
  return { ok: true, account: r.row.account, cutoff: r.row.cutoff }
}
