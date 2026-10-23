// The reader. Runs on the Mizito page with the person's own session and does one simple thing:
// opens the «دستیار میزیتو» chat, goes through its messages back to the start date, and sends every
// task those messages are about to Madar (oldest first), with its comments. It only ever calls the
// read endpoints below; it never writes in Mizito, never opens windows and never clicks anything.
;(() => {
  const VERSION = chrome.runtime.getManifest().version
  // read-only: nothing else can be called from here
  const READ = new Set(['workspace/userId', 'workspace/getUsers', 'projects/getList', 'labels/getAll', 'chat/getDialogs', 'chat/getHistory', 'tasks/getComments'])
  const BOT = '592d81b962bd6e0e6a6cfc00' // «دستیار میزیتو»
  const GAP = 300 // ms between calls, to stay gentle with Mizito
  const BATCH = 10 // tasks per message to Madar
  const TEHRAN = '+03:30'

  let token = ''
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || !e.data.__madar) return
    if (e.data.type === 'token' && e.data.token) token = e.data.token
    if (e.data.type === 'ping') ping()
  })
  // until the page makes its first call: Mizito keeps its session key in local storage
  function storedToken() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const v = String(localStorage.getItem(localStorage.key(i)) || '').replace(/^"|"$/g, '')
        if (!/^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+$/.test(v)) continue
        const body = JSON.parse(atob(v.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (body && body.jti) return v
      }
    } catch (e) {}
    return ''
  }

  // a new message from the assistant on the live connection: a quick read shortly after
  let pingTimer = 0
  function ping() {
    clearTimeout(pingTimer)
    pingTimer = setTimeout(() => chrome.runtime.sendMessage({ type: 'request', reason: 'live' }).catch(() => {}), 20000)
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  async function api(path, body) {
    if (!READ.has(path)) throw new Error('blocked: ' + path)
    const key = token || storedToken()
    if (!key) throw new Error('نشست میزیتو پیدا نشد؛ صفحه‌ی میزیتو را یک بار رفرش کنید')
    for (let attempt = 0; ; attempt++) {
      await sleep(GAP)
      const res = await fetch('/api/api/' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json;charset=UTF-8', accept: 'application/json, text/plain, */*', 'x-token': key },
        body: JSON.stringify(body || {}),
        credentials: 'same-origin',
      })
      if (res.status === 401 || res.status === 403) throw new Error('نشست میزیتو منقضی شده؛ دوباره وارد میزیتو شوید')
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await sleep(3000 * (attempt + 1))
        continue
      }
      if (!res.ok) throw new Error('میزیتو پاسخ نداد (' + res.status + ' · ' + path + ')')
      return res.json()
    }
  }
  // Posted from here, not from the worker: Chrome stops an extension worker whose request takes over
  // 30s, and a batch can. The key stays in the extension's storage, out of the page's reach.
  async function madar(body) {
    const { conn } = await chrome.storage.local.get('conn')
    if (!conn || !conn.u || !conn.k) throw new Error('افزونه به مدار وصل نیست')
    let lastErr
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 150000)
      try {
        const res = await fetch(conn.u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, agent: conn.k }), redirect: 'follow', credentials: 'omit', signal: ctl.signal })
        const text = await res.text()
        if (text.trimStart().startsWith('<')) throw new Error('آدرس مدار به‌جای داده صفحه برگرداند؛ کد اتصال را دوباره بگیرید')
        const r = JSON.parse(text)
        if (!r.ok) throw new Error(r.error || 'مدار پاسخ نداد')
        return r.row
      } catch (e) {
        lastErr = ctl.signal.aborted ? new Error('مدار پاسخ نداد') : e
        // a refused key or a bad address will not get better on a retry
        if (/کلید|کد اتصال|وصل نیست/.test(String(lastErr.message))) break
        await sleep(5000)
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastErr
  }
  const progress = (text) => chrome.runtime.sendMessage({ type: 'progress', text }).catch(() => {})
  const ms = (iso) => {
    const t = Date.parse(iso || '')
    return Number.isFinite(t) ? t : 0
  }
  const tehran = (s) => ms(String(s).replace(' ', 'T') + (String(s).length <= 10 ? 'T00:00' : '') + ':00' + TEHRAN)

  // force = send every task again (not only the ones that changed); days = only the last N days (a test)
  async function run(force, days) {
    const hello = await madar({ action: 'mzHello' })
    const cutoff = tehran(hello.cutoff)
    const since = days ? Math.max(cutoff, Date.now() - days * 86400000) : cutoff
    const known = hello.known || {}
    const knownMentions = new Set(hello.mentions || [])

    progress('آماده‌سازی…')
    const me = await api('workspace/userId', { regId: null })
    const users = {}
    // Arabic ي/ك typed in some profiles become Persian, so names match Madar's people
    const clean = (s) => String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()
    ;((await api('workspace/getUsers', {})).users || []).forEach((u) => (users[u._id] = clean([u.first_name, u.last_name].filter(Boolean).join(' '))))
    const name = (id) => (id && users[id]) || ''
    const projects = {}
    ;((await api('projects/getList', {})).projects || []).forEach((p) => (projects[p._id] = p.title))
    const labels = {}
    try {
      const l = await api('labels/getAll', { type: 'task' })
      ;(l.labels || l || []).forEach((x) => x && x._id && (labels[x._id] = x.title))
    } catch (e) {}

    // 1. the «دستیار میزیتو» chat, newest first, 15 messages a page, back to the start date
    progress('باز کردن گفتگوی دستیار میزیتو…')
    const dialogs = (await api('chat/getDialogs', {})).dialogs || []
    const box = dialogs.find((d) => !d.is_group && (d.peer_user === BOT || /^دستیار ?میزیتو/.test(name(d.peer_user))))
    if (!box) throw new Error('گفتگوی «دستیار میزیتو» پیدا نشد')
    const tasks = new Map() // task id → { t, first, mentions }
    let pages = 0
    let messages = 0
    for (let offset = 0; pages < 400; pages++) {
      const page = await api('chat/getHistory', { dialog: box._id, offset })
      if (!Array.isArray(page) || !page.length) break
      let older = false
      for (const msg of page) {
        const at = ms(msg.date)
        if (at && at < since) {
          older = true
          continue
        }
        const media = msg.media
        const t = media && media.task
        if (msg.deleted || !t || !t._id || t.deleted) continue
        messages++
        let slot = tasks.get(t._id)
        if (!slot) tasks.set(t._id, (slot = { t, first: msg.date, mentions: [] }))
        else if (ms(t.modified_at) > ms(slot.t.modified_at)) slot.t = t
        if (at < ms(slot.first)) slot.first = msg.date
        if (media._ === 'messageMediaMentionInTask') slot.mentions.push({ id: msg._id, by: name(media.from_user), at: msg.date, comment: media.comment || '' })
      }
      progress(`پیام‌های دستیار: ${messages} پیام، ${tasks.size} تسک`)
      if (older) break
      offset += page.length
    }

    // 2. each task, oldest first: its facts and, when it changed, its comments
    const list = [...tasks.values()].sort((a, b) => ms(a.first) - ms(b.first))
    const out = []
    let comments = 0
    for (let i = 0; i < list.length; i++) {
      const { t, first } = list[i]
      const mentions = list[i].mentions.filter((x) => !knownMentions.has(x.id))
      const sig = `${t.modified_at || ''}|${t.completed ? 1 : 0}|-|a3`
      if (!force && known[t._id] === sig) {
        if (mentions.length) out.push({ key: t._id, first_at: first, mentions })
        continue
      }
      progress(`تسک ${i + 1} از ${list.length}: ${String(t.title || '').slice(0, 40)}`)
      const item = {
        key: t._id,
        title: t.title || '',
        notes: t.notes || '',
        link: '',
        chat_link: '',
        first_at: first,
        project: projects[t.project] || '',
        owner: name(t.owner),
        assignees: (t.assignee || []).map(name).filter(Boolean),
        labels: (t.labels || []).map((l) => labels[l]).filter(Boolean),
        created_at: t.created_at,
        completed: !!t.completed,
        completed_at: t.completed_at || '',
        completed_by: name(t.completed_by_responsible || (t.completed_by || [])[0]),
        progress: t.progress,
        deadline: t.has_deadline && t.deadline ? t.deadline : '',
        checklist: (t.checklist || []).map((c) => ({ t: c.title, ok: !!c.checked })),
        mentions,
        sig,
      }
      if (t.last_comment && t.last_comment.comment_owner) {
        item.last_by = name(t.last_comment.comment_owner)
        item.last_at = t.last_comment.comment_at
      }
      if (t.access_token) {
        try {
          const cs = await api('tasks/getComments', { token: t.access_token })
          const live = (Array.isArray(cs) ? cs : []).filter((c) => !c.deleted)
          item.comments = live.map((c) => ({
            id: c._id,
            by: name(c.comment_owner),
            at: c.comment_at,
            body: c.comment || '',
            mentions: (c.mention || []).map(name).filter(Boolean),
            reply_to: c.replied_comment_id || '',
            files: (c.attachments || []).map((a) => a && a.media && a.media.document && a.media.document.name).filter(Boolean),
          }))
          const newest = live.reduce((a, c) => (!a || ms(c.comment_at) > ms(a.comment_at) ? c : a), null)
          if (newest) {
            item.last_by = name(newest.comment_owner)
            item.last_at = newest.comment_at
          }
          comments += live.length
        } catch (e) {
          // without the comments the task still goes; the next read tries again
          item.sig = ''
        }
      }
      out.push(item)
    }

    // 3. into Madar, a few at a time, oldest first
    for (let i = 0; i < out.length; i += BATCH) {
      progress(`ارسال به مدار: ${Math.min(i + BATCH, out.length)} از ${out.length}`)
      await madar({ action: 'mzIngest', items: out.slice(i, i + BATCH), version: VERSION })
    }
    const stats = { tasks: list.length, sent: out.length, mentions: messages, comments, pages: pages + 1, test: days || 0, uid: me && me.uid }
    await madar({ action: 'mzIngest', items: [], final: true, full: !days, link: 'off', stats, version: VERSION })
    return stats
  }

  let busy = false
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || msg.type !== 'run') return
    if (busy) {
      reply({ ok: false, error: 'در حال خواندن است' })
      return
    }
    busy = true
    // keeps the worker (which waits for this reply) awake through long steps
    const beat = setInterval(() => chrome.runtime.sendMessage({ type: 'beat' }).catch(() => {}), 10000)
    const done = (r) => {
      busy = false
      clearInterval(beat)
      reply(r)
    }
    run(!!msg.force, Number(msg.days) || 0).then(
      (stats) => done({ ok: true, stats }),
      (e) => done({ ok: false, error: String((e && e.message) || e) }),
    )
    return true
  })
  chrome.runtime.sendMessage({ type: 'hello' }).catch(() => {})
})()
