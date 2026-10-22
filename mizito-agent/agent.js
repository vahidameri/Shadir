// The reader. Runs on the Mizito page with the person's own session and reads, through the same
// API Mizito's web app uses: the mentions (the "Mizito assistant" chat), the open tasks of their
// inbox, and the comments of each task that changed. It only ever calls the read endpoints below;
// everything it finds goes to Madar through the background worker.
;(() => {
  const VERSION = chrome.runtime.getManifest().version
  // read-only: nothing else can be called from here
  const READ = new Set(['workspace/userId', 'workspace/getUsers', 'projects/getList', 'labels/getAll', 'chat/getDialogs', 'chat/getHistory', 'tasks/getAll', 'tasks/upcoming', 'tasks/getComments'])
  const BOT = '592d81b962bd6e0e6a6cfc00' // "دستیار میزیتو", who posts the mention notices
  const GAP = 350 // ms between calls, to stay gentle with Mizito
  const BATCH = 10 // tasks per message to Madar
  const TEHRAN = '+03:30'

  let token = ''
  let capturing = false
  let copiedLink = ''
  let currentTask = ''
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || !e.data.__madar) return
    if (e.data.type === 'token' && e.data.token) token = e.data.token
    if (e.data.type === 'ping') ping()
    if (e.data.type === 'task' && e.data.id) currentTask = String(e.data.id)
    if (e.data.type === 'link') {
      const text = String(e.data.text || '').trim()
      if (capturing) copiedLink = text
      // a link the person copied themselves is kept too (the hook knows which task was open)
      else if (e.data.task) keepLinks({ [e.data.task]: text })
    }
  })
  async function keepLinks(found) {
    const { links = {} } = await chrome.storage.local.get('links')
    await chrome.storage.local.set({ links: { ...links, ...found } })
  }
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

  // a new mention arrived on the live connection: a quick read shortly after (collapsed)
  let pingTimer = 0
  function ping() {
    clearTimeout(pingTimer)
    pingTimer = setTimeout(() => chrome.runtime.sendMessage({ type: 'request', full: false, reason: 'live' }).catch(() => {}), 20000)
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  async function api(path, body, allowed) {
    // the one exception: the call Mizito itself makes for «لینک وظیفه», learnt from the person's own click
    if (!READ.has(path) && path !== allowed) throw new Error('blocked: ' + path)
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
  // 30s, and a batch can (the sheet lock, a cold start). The key stays in the extension's storage,
  // out of the page's reach (this script runs in its own world).
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

  // Every read goes through the whole assistant chat back to the cutoff: its messages carry each task
  // as it is now, so a task someone else changed (the CPTO commenting, closing, moving the deadline)
  // is noticed even with no new mention. Only tasks that changed are read in full and sent.
  // force = re-read every task and its comments; days = only the last N days (a quick test).
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

    // key → { t: latest snapshot, mentions, first: the assistant's first message about it, assistant }
    const tasks = new Map()
    const take = (t) => {
      if (!t || !t._id || t.deleted) return null
      const cur = tasks.get(t._id)
      if (!cur) tasks.set(t._id, { t, mentions: [], first: '', assistant: false })
      else if (ms(t.modified_at) >= ms(cur.t.modified_at)) cur.t = { ...cur.t, ...t, last_comment: t.last_comment || cur.t.last_comment }
      return tasks.get(t._id)
    }

    // 1. mentions: the assistant's chat, newest first, 15 at a time
    const dialogs = (await api('chat/getDialogs', {})).dialogs || []
    const box = dialogs.find((d) => !d.is_group && (d.peer_user === BOT || /^دستیار میزیتو/.test(name(d.peer_user))))
    let pages = 0
    let mentionCount = 0
    let mentionsDone = false
    if (box) {
      for (let offset = 0; pages < 400; pages++) {
        const page = await api('chat/getHistory', { dialog: box._id, offset })
        if (!Array.isArray(page) || !page.length) {
          pages++
          break
        }
        let older = false
        for (const msg of page) {
          const at = ms(msg.date)
          if (at && at < since) older = true
          const media = msg.media
          // every task the assistant talks about comes in; a mention is also kept as a mention
          if (msg.deleted || !media || !media.task || at < since) continue
          const slot = take(media.task)
          if (slot) {
            slot.assistant = true
            if (!slot.first || ms(msg.date) < ms(slot.first)) slot.first = msg.date
          }
          if (slot && media._ === 'messageMediaMentionInTask') {
            slot.mentions.push({ id: msg._id, by: name(media.from_user), at: msg.date, comment: media.comment || '' })
            mentionCount++
          }
        }
        progress(`منشن‌ها: ${mentionCount} (صفحه ${pages + 1})`)
        if (older) break
        offset += page.length
      }
      mentionsDone = pages < 400
    }

    // 2. the open tasks of this person's inbox
    progress('تسک‌های باز…')
    // the inbox comes in pages: the first from getAll, the rest from upcoming (from = how many so far)
    const query = { inbox: true, sort_type: 'default', filter: null }
    const open = [...((await api('tasks/getAll', query)) || [])]
    let inboxDone = false
    for (let i = 0; i < 40; i++) {
      const more = await api('tasks/upcoming', { ...query, from: open.length })
      if (!Array.isArray(more) || !more.length) {
        inboxDone = true
        break
      }
      open.push(...more)
    }
    const seen = []
    for (const t of open) {
      seen.push(t._id)
      const activity = Math.max(ms(t.created_at), ms(t.modified_at), ms(t.last_mention_date))
      if (activity >= cutoff) take(t)
    }

    // what Madar holds is decided by the assistant's messages; the inbox only refreshes those tasks
    const list = [...tasks.values()].filter((x) => x.assistant)

    // 3. the links: taken from Mizito itself, like a person would, for every task that has none yet
    let { links = {} } = await chrome.storage.local.get('links')
    const missing = list.filter((x) => !links[x.t._id]).map((x) => x.t._id)
    let capture = null
    if (missing.length) {
      progress(`برداشتن لینک ${missing.length} تسک از میزیتو…`)
      capture = await chrome.runtime.sendMessage({ type: 'capture', job: { ids: missing, dialog: box ? box._id : '' } }).catch((e) => ({ links: {}, log: [String((e && e.message) || e)] }))
      if (capture && capture.links && Object.keys(capture.links).length) {
        await keepLinks(capture.links)
        links = { ...links, ...capture.links }
      }
    }

    // 4. what changed: the full snapshot and its comments; a task that did not change only adds its mentions
    const sigOf = (t) => `${t.modified_at || ''}|${t.completed ? 1 : 0}|${links[t._id] ? 'L' : '-'}|a3`
    const out = []
    let commentsRead = 0
    for (let i = 0; i < list.length; i++) {
      const { t } = list[i]
      const mentions = list[i].mentions.filter((x) => !knownMentions.has(x.id))
      const sig = sigOf(t)
      if (!force && known[t._id] === sig) {
        if (mentions.length) out.push({ key: t._id, mentions })
        continue
      }
      const item = {
        key: t._id,
        title: t.title || '',
        notes: t.notes || '',
        link: links[t._id] || '',
        first_at: list[i].first,
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
          commentsRead += live.length
        } catch (e) {
          // without the comments the task still goes; the next read tries again
          item.sig = ''
        }
      }
      out.push(item)
      progress(`تسک‌ها: ${i + 1} از ${list.length}`)
    }

    // 5. to Madar, a few tasks at a time
    for (let i = 0; i < out.length; i += BATCH) {
      progress(`ارسال به مدار: ${Math.min(i + BATCH, out.length)} از ${out.length}`)
      await madar({ action: 'mzIngest', items: out.slice(i, i + BATCH), version: VERSION })
    }
    const withLink = list.filter((x) => links[x.t._id]).length
    const stats = { tasks: list.length, sent: out.length, mentions: mentionCount, comments: commentsRead, pages: pages + 1, open: seen.length, links: withLink, test: days || 0, uid: me && me.uid }
    // a test read covers only part of the chat: it must not mark or remove anything
    const whole = !days
    await madar({
      action: 'mzIngest',
      items: [],
      final: true,
      full: whole,
      seen: whole && inboxDone && mentionsDone ? [...new Set([...seen, ...list.filter((x) => !x.t.completed).map((x) => x.t._id)])] : undefined,
      assistant: whole && mentionsDone ? list.map((x) => x.t._id) : undefined,
      link: !list.length || withLink === list.length ? 'learned' : 'failed',
      link_how: `${withLink} از ${list.length} تسک لینک دارند${capture && capture.log && capture.log.length ? ' · ' + capture.log.slice(-4).join(' · ') : ''}`.slice(0, 290),
      stats,
      version: VERSION,
    })
    return { ...stats, log: capture ? capture.log : [] }
  }

  // ---- taking the links from Mizito, the way a person would ----
  // In a window the agent opens for this, it opens the «دستیار میزیتو» chat, and for each message
  // (newest first) clicks «مشاهده وظیفه», then the task's ⋮ → «لینک وظیفه», and keeps the link
  // Mizito copies, against the task that opened. Only the tasks without a link are visited.
  const norm = (x) => String(x || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()
  const visible = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length))
  const waitFor = async (fn, ms) => {
    const end = Date.now() + ms
    for (;;) {
      const v = fn()
      if (v) return v
      if (Date.now() > end) return null
      await sleep(120)
    }
  }
  /** visible elements whose own text matches, innermost only (a wrapper repeats its child's text) */
  function byText(test, sel = 'button, a, span, div, p, li, md-menu-item, [role="menuitem"], md-list-item, h1, h2, h3, h4') {
    const all = [...document.querySelectorAll(sel)].filter((e) => visible(e) && e.textContent.length < 200 && test(norm(e.textContent)))
    return all.filter((e) => !all.some((o) => o !== e && e.contains(o)))
  }
  const pageText = () => norm(document.body ? document.body.innerText : '')
  const press = (key) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode: key === 'Escape' ? 27 : 0, bubbles: true }))
  const clickable = (e) => e.closest('button, a, [ng-click], [ui-sref], md-list-item, li, [role="button"]') || e
  // text compared without spaces and half-spaces («دستیار میزیتو» = «دستیار‌میزیتو»)
  const squash = (x) => norm(x).replace(/[\u200c\u200f\u200e\s]/g, '')
  // a real click: pointer and mouse events, the way a hand does it (some menus listen to mousedown)
  function press1(el) {
    const e = clickable(el)
    e.scrollIntoView({ block: 'center', inline: 'center' })
    const r = e.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }
    for (const type of ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup']) e.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, at))
    e.click()
  }
  // what the agent is doing, shown on top of the window it works in
  function banner(text) {
    let b = document.getElementById('__madar_banner')
    if (!b) {
      b = document.createElement('div')
      b.id = '__madar_banner'
      b.style.cssText = 'position:fixed;z-index:2147483647;top:8px;left:50%;transform:translateX(-50%);background:#0f2f34;color:#fff;font:13px Tahoma,sans-serif;padding:8px 16px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none;direction:rtl'
      document.documentElement.appendChild(b)
    }
    b.textContent = 'ایجنت مدار: ' + text
  }
  /** a short outline of what can be clicked on the page, for the report when a step fails (once per kind) */
  const outlined = new Set()
  function outline(kind = 'x') {
    if (outlined.has(kind)) return '(مثل بالا)'
    outlined.add(kind)
    const els = [...document.querySelectorAll('button, a, [ng-click], [ui-sref], md-list-item, li, [role="button"], md-tab-item')].filter(visible)
    return els
      .slice(0, 400)
      .map((e) => {
        const r = e.getBoundingClientRect()
        const t = norm(e.textContent).slice(0, 30) || e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('ui-sref') || e.getAttribute('href') || ''
        return t ? `${e.tagName.toLowerCase()}${r.left > innerWidth * 0.66 ? '→' : r.right < innerWidth * 0.34 ? '←' : ''}:${t}` : ''
      })
      .filter(Boolean)
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, 70)
      .join(' | ')
  }
  const TASK_HEAD = 'مشخصات وظیفه'
  const viewButtons = () => byText((t) => /^مشاهده/.test(t) && t.length < 25)

  // the path a person takes: the right-hand sidebar → «گفتگو» → the chat «دستیار میزیتو»
  async function openAssistant(say) {
    // opened straight on the assistant's chat (#/ws/im/<dialog>/): just wait for its messages
    if (/#\/ws\/im\//.test(location.hash)) {
      banner('باز کردن گفتگوی «دستیار میزیتو»')
      if (await waitFor(() => viewButtons().length, 20000)) {
        say(`گفتگوی «دستیار میزیتو» باز شد (${viewButtons().length} پیام با «مشاهده وظیفه»)`)
        return true
      }
      say('صفحه‌ی گفتگوی دستیار باز شد ولی دکمه‌ی «مشاهده وظیفه» دیده نشد. آنچه در صفحه بود: ' + outline('chat'))
      return false
    }
    const assistant = () => byText((t) => squash(t).startsWith('دستیارمیزیتو'))[0]
    banner('باز کردن «گفتگو» از سایدبار')
    await waitFor(() => document.querySelectorAll('button, a, [ng-click]').length > 10, 20000)
    // 1. «گفتگو» in the sidebar: by its text, or its tooltip / title (an icon-only sidebar), rightmost first
    if (!assistant()) {
      const entries = [...document.querySelectorAll('a, button, [ng-click], [ui-sref], md-list-item, li, [role="button"]')]
        .filter((e) => visible(e) && /گفتگو/.test(squash(e.textContent + ' ' + (e.getAttribute('title') || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('ui-sref') || ''))) && squash(e.textContent).length < 30)
        .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
      const inner = entries.filter((e) => !entries.some((o) => o !== e && e.contains(o)))
      if (!inner.length) {
        say('«گفتگو» در سایدبار پیدا نشد. آنچه در صفحه بود: ' + outline())
        return false
      }
      press1(inner[0])
      say('«گفتگو» از سایدبار باز شد')
    }
    // 2. the chat «دستیار میزیتو»: in the list, or through the chats' search box
    banner('انتخاب «دستیار میزیتو»')
    let item = await waitFor(assistant, 8000)
    if (!item) {
      const search = [...document.querySelectorAll('input')].find((i) => visible(i) && /جستجو|search/i.test((i.placeholder || '') + (i.getAttribute('aria-label') || '')))
      if (search) {
        search.focus()
        search.value = 'دستیار میزیتو'
        search.dispatchEvent(new Event('input', { bubbles: true }))
        search.dispatchEvent(new Event('change', { bubbles: true }))
        item = await waitFor(assistant, 5000)
      }
    }
    if (!item) {
      say('«دستیار میزیتو» در فهرست گفتگوها پیدا نشد. آنچه در صفحه بود: ' + outline())
      return false
    }
    press1(item)
    const ok = await waitFor(() => viewButtons().length, 10000)
    if (!ok) {
      say('گفتگوی دستیار باز شد ولی دکمه‌ی «مشاهده وظیفه» دیده نشد. آنچه در صفحه بود: ' + outline())
      return false
    }
    say(`گفتگوی «دستیار میزیتو» باز شد (${viewButtons().length} پیام با «مشاهده وظیفه»)`)
    return true
  }
  /** the scrollable list around the chat messages */
  function scroller(from) {
    for (let e = from; e && e !== document.body; e = e.parentElement) {
      const st = getComputedStyle(e)
      if (e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(st.overflowY)) return e
    }
    return null
  }
  async function openTask(btn) {
    const before = currentTask
    const hash = location.hash
    press1(btn)
    // the task shows (its header) and Mizito asks for its key (the hook tells which task it is)
    const shown = await waitFor(() => pageText().includes(TASK_HEAD), 6000)
    await waitFor(() => currentTask && currentTask !== before, 1500)
    return { id: shown ? currentTask : '', hash }
  }
  async function closeTask(hash) {
    if (location.hash !== hash) {
      history.back()
      await waitFor(() => location.hash === hash, 3000)
    } else {
      press('Escape')
      const close = byText((t) => t === 'close' || t === 'arrow_back' || t === 'arrow_forward' || t === 'بستن')[0]
      if (close && pageText().includes(TASK_HEAD)) press1(close)
    }
    await waitFor(() => !pageText().includes(TASK_HEAD) || viewButtons().length, 2500)
  }
  async function copyTaskLink() {
    copiedLink = ''
    const items = () => byText((t) => t === 'لینک وظیفه')
    if (!items().length) {
      // the ⋮ of the task: a menu opener next to «مشخصات وظیفه» (never the task's other buttons)
      const head = byText((t) => t === TASK_HEAD)[0]
      let openers = []
      for (let e = head; e && !openers.length && e !== document.body; e = e.parentElement) {
        openers = [...e.querySelectorAll('md-menu button, [aria-haspopup="true"], button, md-icon, i')].filter((o) => visible(o) && (o.matches('md-menu button, [aria-haspopup="true"]') || /^(more_vert|more_horiz|⋮)$/.test(norm(o.textContent))))
      }
      for (const o of openers.slice(0, 4)) {
        press1(o)
        if (await waitFor(() => items().length, 1500)) break
        press('Escape')
      }
    }
    const it = items()[0]
    if (!it) return ''
    press1(it)
    // the link is copied, or shown in a small box to copy from
    const link = await waitFor(() => {
      if (copiedLink) return copiedLink
      const box = [...document.querySelectorAll('input, textarea')].find((i) => visible(i) && /#\/ws\//.test(i.value))
      if (box) return box.value.trim()
      const shown = byText((t) => /^https?:\/\/\S+#\/ws\/\S+$/.test(t))[0]
      return shown ? norm(shown.textContent) : ''
    }, 2500)
    press('Escape')
    return link || ''
  }
  async function runCapture(job) {
    capturing = true
    const need = new Set(job.ids)
    const got = {}
    const log = []
    const say = (s) => {
      log.push(s)
      chrome.runtime.sendMessage({ type: 'progress', text: s }).catch(() => {})
    }
    const deadline = Date.now() + (job.timeout || 600000)
    const beat = setInterval(() => chrome.runtime.sendMessage({ type: 'beat' }).catch(() => {}), 8000)
    try {
      if (await openAssistant(say)) {
        const seenMsg = new Set()
        let idle = 0
        while (need.size && Date.now() < deadline) {
          // a message is known by its text (the list is redrawn when a task opens)
          // the message = the largest block around the button that holds no other «مشاهده وظیفه»
          const btns = viewButtons()
          const keyOf = (b) => {
            let e = b
            while (e.parentElement && e.parentElement !== document.body && btns.filter((x) => e.parentElement.contains(x)).length === 1) e = e.parentElement
            return norm(e.textContent).slice(0, 240)
          }
          const fresh = btns.filter((b) => !seenMsg.has(keyOf(b)))
          if (!fresh.length) {
            // older messages: scroll the list up and wait for them
            const sc = scroller(viewButtons()[0])
            if (!sc || idle >= 4) break
            sc.scrollTop = 0
            idle++
            const count = btns.length
            await waitFor(() => viewButtons().length > count, 3000)
            continue
          }
          idle = 0
          // newest first: the bottom of the list
          const b = fresh[fresh.length - 1]
          seenMsg.add(keyOf(b))
          banner(`تسک‌ها: ${Object.keys(got).length} از ${job.ids.length} لینک برداشته شد`)
          const { id, hash } = await openTask(b)
          if (id && need.has(id)) {
            const link = await copyTaskLink()
            if (link) {
              got[id] = link
              need.delete(id)
              say(`لینک ${Object.keys(got).length} از ${job.ids.length} برداشته شد`)
            } else say('تسک باز شد ولی «لینک وظیفه» در منوی ⋮ پیدا نشد. آنچه در صفحه بود: ' + outline('menu'))
          } else if (!id) say('با «مشاهده وظیفه» تسکی باز نشد. آنچه در صفحه بود: ' + outline('open'))
          await closeTask(hash)
        }
      }
    } catch (e) {
      say('خطا: ' + String((e && e.message) || e))
    }
    clearInterval(beat)
    say(`پایان: ${Object.keys(got).length} لینک از ${job.ids.length}`)
    banner(`تمام شد: ${Object.keys(got).length} لینک`)
    chrome.runtime.sendMessage({ type: 'capture-result', result: { links: got, log } }).catch(() => {})
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
  // say hello: the window the agent opened to take links gets its job back
  chrome.runtime
    .sendMessage({ type: 'hello' })
    .then((r) => r && r.capture && runCapture(r.capture))
    .catch(() => {})
})()
