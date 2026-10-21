// Runs inside the Mizito page itself (MAIN world). It only listens: it hands the page's own session
// key (the x-token header Mizito's app sends) to the agent, says when a new mention arrives on
// Mizito's live connection, and when someone copies a task's link with Mizito's own «لینک وظیفه»
// it tells the agent the link and the calls just made, so the agent learns how Mizito builds it.
// It never changes a request.
(() => {
  if (window.__madarHook) return
  window.__madarHook = true
  let last = ''
  const tell = (msg) => window.postMessage({ __madar: true, ...msg }, location.origin)
  const token = (v) => {
    if (v && v !== last) {
      last = String(v)
      tell({ type: 'token', token: last })
    }
  }
  // the last calls the page made (path, body, answer), and the last task it opened
  const recent = []
  let lastTask = ''
  const taskOf = (body) => {
    try {
      const b = typeof body === 'string' ? JSON.parse(body) : body || {}
      if (b.tid) return String(b.tid)
      const jwt = String(b.token || '')
      if (jwt.split('.').length === 3) {
        const p = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (p && p.task) return String(p.task)
      }
    } catch (e) {}
    return ''
  }
  const remember = (url, body, text) => {
    const path = String(url || '').replace(/^.*\/api\/api\//, '')
    if (!/^[\w/]+$/.test(path)) return
    const t = taskOf(body)
    if (t) lastTask = t
    recent.push({ path, body: typeof body === 'string' ? body : '', text: String(text || '').slice(0, 4000), at: Date.now() })
    if (recent.length > 40) recent.shift()
  }
  const xOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__madarUrl = url
    return xOpen.apply(this, arguments)
  }
  const xSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__madarUrl
    if (url && String(url).indexOf('/api/api/') !== -1) {
      this.addEventListener('load', () => {
        try {
          remember(url, body, typeof this.response === 'string' ? this.response : this.responseText)
        } catch (e) {
          remember(url, body, '')
        }
      })
    }
    return xSend.apply(this, arguments)
  }
  // a copied task link: from navigator.clipboard or from a copy command over a selection
  const copied = (text) => {
    text = String(text || '').trim()
    if (/\/#\/ws\//.test(text)) tell({ type: 'link', text, task: lastTask, calls: recent.filter((c) => Date.now() - c.at < 20000) })
  }
  try {
    const cb = navigator.clipboard
    if (cb && cb.writeText) {
      const w = cb.writeText.bind(cb)
      cb.writeText = (t) => (copied(t), w(t))
    }
  } catch (e) {}
  document.addEventListener(
    'copy',
    () => {
      const a = document.activeElement
      const sel = String(window.getSelection ? window.getSelection() : '')
      copied(sel || (a && 'value' in a ? String(a.value).slice(a.selectionStart || 0, a.selectionEnd || undefined) : ''))
    },
    true,
  )

  const setHeader = XMLHttpRequest.prototype.setRequestHeader
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (String(name).toLowerCase() === 'x-token') token(value)
    return setHeader.apply(this, arguments)
  }
  const origFetch = window.fetch
  window.fetch = function (input, init) {
    try {
      const h = init && init.headers
      const v = h && (typeof h.get === 'function' ? h.get('x-token') : h['x-token'] || h['X-Token'])
      if (v) token(v)
    } catch (e) {}
    return origFetch.apply(this, arguments)
  }
  const WS = window.WebSocket
  if (WS) {
    const Wrapped = function (url, protocols) {
      const ws = protocols === undefined ? new WS(url) : new WS(url, protocols)
      try {
        ws.addEventListener('message', (e) => {
          // a new mention ("messageMediaMentionInTask") or a task change: let the agent take a quick look
          if (typeof e.data === 'string' && /MentionInTask|task_updated|task_comment/i.test(e.data)) tell({ type: 'ping' })
        })
      } catch (e) {}
      return ws
    }
    Wrapped.prototype = WS.prototype
    Object.assign(Wrapped, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
    window.WebSocket = Wrapped
  }
})()
