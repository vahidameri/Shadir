async function madarMizitoReader(cfg) {
  // Madar's Mizito reader. Run in a Mizito tab (signed in). Reads, with the person's own session and
  // the same read-only calls Mizito's own app makes, every message of the «دستیار میزیتو» chat since
  // cfg.since, and every task those messages are about: its facts, its mentions and its comments,
  // each with Mizito's own id. Writes nothing to Mizito. The result is a file to drop into Madar;
  // because every task, mention and comment carries Mizito's id, importing it again adds nothing twice.
  const BOT = '592d81b962bd6e0e6a6cfc00'
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  if (!/mizito/i.test(location.host)) {
    alert('این کد را در تب میزیتو اجرا کنید')
    return 'not on Mizito'
  }
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;z-index:2147483647;top:16px;left:16px;max-width:420px;background:#0f1a2e;color:#fff;font:13px/1.9 Tahoma,sans-serif;padding:14px 18px;border-radius:14px;direction:rtl;box-shadow:0 10px 30px rgba(0,0,0,.35)'
  document.body.appendChild(box)
  const say = (t) => (box.textContent = 'مدار · ' + t)
  say('شروع…')
  let token = ''
  try {
    for (let i = 0; i < localStorage.length && !token; i++) {
      const v = String(localStorage.getItem(localStorage.key(i)) || '').replace(/^"|"$/g, '')
      if (!/^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+$/.test(v)) continue
      const b = JSON.parse(atob(v.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (b && b.jti) token = v
    }
  } catch (e) {}
  if (!token) {
    say('نشست میزیتو پیدا نشد؛ اول وارد میزیتو شوید و صفحه را یک بار رفرش کنید')
    return 'no session'
  }
  const api = async (path, body) => {
    for (let attempt = 0; ; attempt++) {
      await sleep(cfg.gap || 200)
      const res = await fetch('/api/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json;charset=UTF-8', accept: 'application/json, text/plain, */*', 'x-token': token }, body: JSON.stringify(body || {}), credentials: 'same-origin' })
      if (res.status === 401 || res.status === 403) throw new Error('نشست میزیتو منقضی شده؛ دوباره وارد شوید')
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(2500 * (attempt + 1))
        continue
      }
      if (!res.ok) throw new Error('میزیتو پاسخ نداد (' + res.status + ' · ' + path + ')')
      return res.json()
    }
  }
  const ms = (iso) => {
    const t = Date.parse(iso || '')
    return isFinite(t) ? t : 0
  }
  const since = ms(String(cfg.since).slice(0, 10) + 'T00:00:00+03:30')
  try {
    const me = await api('workspace/userId', { regId: null })
    const clean = (s) => String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()
    const users = {}
    ;((await api('workspace/getUsers', {})).users || []).forEach((u) => (users[u._id] = clean([u.first_name, u.last_name].filter(Boolean).join(' '))))
    const name = (id) => (id && users[id]) || ''
    const projects = {}
    ;((await api('projects/getList', {})).projects || []).forEach((p) => (projects[p._id] = p.title))
    const labels = {}
    try {
      const l = await api('labels/getAll', { type: 'task' })
      ;(l.labels || l || []).forEach((x) => x && x._id && (labels[x._id] = x.title))
    } catch (e) {}

    // 1. the assistant's chat, newest first, page by page, back to the start date
    const dialogs = (await api('chat/getDialogs', {})).dialogs || []
    const dlg = dialogs.find((d) => !d.is_group && (d.peer_user === BOT || /^دستیار ?میزیتو/.test(name(d.peer_user))))
    if (!dlg) throw new Error('گفتگوی «دستیار میزیتو» پیدا نشد')
    const tasks = new Map()
    let messages = 0
    let pages = 0
    for (let offset = 0; pages < 1000; pages++) {
      const page = await api('chat/getHistory', { dialog: dlg._id, offset })
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
        if (msg.deleted || !t || !t._id) continue
        messages++
        let s = tasks.get(t._id)
        if (!s) tasks.set(t._id, (s = { t, first: msg.date, mentions: [] }))
        else if (ms(t.modified_at) > ms(s.t.modified_at)) s.t = t
        if (at < ms(s.first)) s.first = msg.date
        s.mentions.push({ id: msg._id, by: name(media.from_user) || name(msg.from_user) || '', at: msg.date, comment: media.comment || '', kind: media._ || '' })
      }
      say('پیام‌های دستیار: ' + messages + ' پیام، ' + tasks.size + ' تسک (صفحه ' + (pages + 1) + ')')
      if (older) break
      offset += page.length
    }

    // 2. every task, oldest first, with its comments
    const list = [...tasks.values()].filter((s) => !s.t.deleted).sort((a, b) => ms(a.first) - ms(b.first))
    const items = []
    let comments = 0
    for (let i = 0; i < list.length; i++) {
      const { t, first } = list[i]
      say('تسک ' + (i + 1) + ' از ' + list.length + ': ' + String(t.title || '').slice(0, 50))
      const item = {
        key: t._id,
        title: t.title || '',
        notes: t.notes || '',
        link: '',
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
        // a mention is a message saying this person was mentioned; the other messages (assigned,
        // done, deadline…) only bring the task
        mentions: list[i].mentions.filter((x) => /Mention/i.test(x.kind)).map((x) => ({ id: x.id, by: x.by, at: x.at, comment: x.comment })),
        sig: '',
      }
      if (t.last_comment && t.last_comment.comment_owner) {
        item.last_by = name(t.last_comment.comment_owner)
        item.last_at = t.last_comment.comment_at
      }
      if (t.access_token) {
        try {
          const cs = await api('tasks/getComments', { token: t.access_token })
          const live = (Array.isArray(cs) ? cs : []).filter((c) => !c.deleted)
          item.comments = live.map((c) => ({ id: c._id, by: name(c.comment_owner), at: c.comment_at, body: c.comment || '', mentions: (c.mention || []).map(name).filter(Boolean), reply_to: c.replied_comment_id || '', files: (c.attachments || []).map((a) => a && a.media && a.media.document && a.media.document.name).filter(Boolean) }))
          const newest = live.reduce((a, c) => (!a || ms(c.comment_at) > ms(a.comment_at) ? c : a), null)
          if (newest) {
            item.last_by = name(newest.comment_owner)
            item.last_at = newest.comment_at
          }
          comments += live.length
        } catch (e) {}
      }
      items.push(item)
    }

    const doc = { source: 'madar-reader', v: 1, account: name(me && me.uid), since: cfg.since, read_at: new Date().toISOString(), messages, items }
    const text = JSON.stringify(doc)
    const file = 'mizito-' + new Date().toISOString().slice(0, 10) + '.json'
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      a.download = file
      document.body.appendChild(a)
      a.click()
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 4000)
    } catch (e) {}
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) {}
    say('تمام شد: ' + items.length + ' تسک، ' + messages + ' پیام، ' + comments + ' کامنت. فایل ' + file + ' دانلود شد؛ آن را در مدار ← میزیتو ← ایمپورت بکشید.')
    setTimeout(() => box.remove(), 60000)
    return 'done: ' + items.length + ' tasks, ' + messages + ' messages, ' + comments + ' comments, file ' + file
  } catch (e) {
    say('خطا: ' + (e && e.message ? e.message : e))
    return 'error: ' + (e && e.message ? e.message : e)
  }
}
