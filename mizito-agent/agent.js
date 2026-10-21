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
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || !e.data.__madar) return
    if (e.data.type === 'token' && e.data.token) token = e.data.token
    if (e.data.type === 'ping') ping()
    if (e.data.type === 'link') learnLink(e.data)
  })

  // ---- the task link, exactly as Mizito's «لینک وظیفه» gives it ----
  // When the person copies a task's link from that menu, the hook hands over the link, the task that
  // was open and the calls just made. If the link carries the task id, it is a pattern (the id is
  // swapped per task); if a call returned it, that call is repeated for each task.
  async function learnLink(d) {
    const text = String(d.text || '').trim()
    const task = String(d.task || '')
    let recipe = null
    if (task && text.includes(task)) {
      recipe = { kind: 'pattern', pattern: text.split(task).join('{id}') }
    } else {
      const tail = text.replace(/^.*#/, '#')
      const call = [...(d.calls || [])].reverse().find((c) => c.text && (c.text.includes(text) || c.text.includes(tail)))
      if (call) {
        let body = call.body || '{}'
        if (task) body = body.split(task).join('{id}')
        recipe = { kind: 'call', path: call.path, body }
      }
    }
    const learned = { at: Date.now(), sample: text, task, recipe }
    await chrome.storage.local.set({ linkRecipe: learned })
    chrome.runtime.sendMessage({ type: 'progress', text: recipe ? 'لینک وظیفه یاد گرفته شد' : 'لینک کپی شد ولی الگویش پیدا نشد؛ یک بار دیگر از داخل یک تسک «لینک وظیفه» را بزنید' }).catch(() => {})
    // links go to Madar with the next read: start one now
    if (recipe) chrome.runtime.sendMessage({ type: 'request', reason: 'link', force: true }).catch(() => {})
  }
  const linkVersion = (r) => (r && r.recipe ? (r.recipe.kind === 'pattern' ? r.recipe.pattern : r.recipe.path + r.recipe.body).length + ':' + r.at : 'none')
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
  // force = re-read every task and its comments.
  async function run(_full, force) {
    const hello = await madar({ action: 'mzHello' })
    const cutoff = tehran(hello.cutoff)
    const since = cutoff
    const known = hello.known || {}
    const knownMentions = new Set(hello.mentions || [])

    progress('آماده‌سازی…')
    const me = await api('workspace/userId', { regId: null })
    // the task link: learnt from «لینک وظیفه»; until then, Mizito's shape <workspace>_sl<task>
    const { linkRecipe } = await chrome.storage.local.get('linkRecipe')
    const recipe = linkRecipe && linkRecipe.recipe
    const linkV = linkVersion(linkRecipe)
    const linkOf = async (id) => {
      try {
        if (recipe && recipe.kind === 'pattern') return recipe.pattern.split('{id}').join(id)
        if (recipe && recipe.kind === 'call') {
          const r = await api(recipe.path, JSON.parse(recipe.body.split('{id}').join(id)), recipe.path)
          const m = JSON.stringify(r).match(/(https?:\/\/[^"\\]*)?#\/ws\/[^"\\\s]+/)
          if (m) return m[0].startsWith('http') ? m[0] : location.origin + '/' + m[0]
        }
      } catch (e) {}
      return location.origin + '/#/ws/tasks/inbox/' + (me && me.wid ? me.wid + '_sl' : '') + id
    }
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

    // 3. what changed: the full snapshot and its comments; a task that did not change only adds its mentions
    // what Madar holds is decided by the assistant's messages; the inbox only refreshes those tasks
    const sigOf = (t) => `${t.modified_at || ''}|${t.completed ? 1 : 0}|${linkV}|a2`
    const out = []
    let commentsRead = 0
    const list = [...tasks.values()].filter((x) => x.assistant)
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
        link: await linkOf(t._id),
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

    // 4. to Madar, a few tasks at a time
    for (let i = 0; i < out.length; i += BATCH) {
      progress(`ارسال به مدار: ${Math.min(i + BATCH, out.length)} از ${out.length}`)
      await madar({ action: 'mzIngest', items: out.slice(i, i + BATCH), version: VERSION })
    }
    const stats = { tasks: list.length, sent: out.length, mentions: mentionCount, comments: commentsRead, pages: pages + 1, open: seen.length, uid: me && me.uid }
    await madar({ action: 'mzIngest', items: [], final: true, full: true, seen: inboxDone && mentionsDone ? [...new Set([...seen, ...list.filter((x) => !x.t.completed).map((x) => x.t._id)])] : undefined, assistant: mentionsDone ? list.map((x) => x.t._id) : undefined, link: linkRecipe ? (recipe ? 'learned' : 'failed') : 'none', stats, version: VERSION })
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
    run(!!msg.full || !!msg.force, !!msg.force).then(
      (stats) => done({ ok: true, stats }),
      (e) => done({ ok: false, error: String((e && e.message) || e) }),
    )
    return true
  })
  // tell the worker a Mizito tab is here (it may want to run a read that was due)
  chrome.runtime.sendMessage({ type: 'hello' }).catch(() => {})
})()
