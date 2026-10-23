// Runs inside the Mizito page itself (MAIN world). It only listens: it hands the page's own session
// key (the x-token header Mizito's app sends) to the agent, and says when a new message arrives on
// Mizito's live connection. It never changes a request.
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
  const setHeader = XMLHttpRequest.prototype.setRequestHeader
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (String(name).toLowerCase() === 'x-token') token(value)
    return setHeader.apply(this, arguments)
  }
  // The page's last Mizito answers, kept here only so «پیدا کردن لینک» can see which one carried a
  // task's link (for example after «لینک وظیفه»). Nothing leaves the page.
  const recent = []
  const keep = (url, text) => {
    if (!/\/api\//.test(String(url)) || typeof text !== 'string') return
    recent.push({ path: String(url).replace(/^.*\/api\/api\//, ''), text: text.slice(0, 300000) })
    if (recent.length > 60) recent.shift()
  }
  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    this.addEventListener('load', () => {
      try {
        if (!this.responseType || this.responseType === 'text') keep(url, this.responseText)
      } catch (e) {}
    })
    return open.apply(this, arguments)
  }
  const origFetch = window.fetch
  window.fetch = function (input, init) {
    try {
      const h = init && init.headers
      const v = h && (typeof h.get === 'function' ? h.get('x-token') : h['x-token'] || h['X-Token'])
      if (v) token(v)
    } catch (e) {}
    const p = origFetch.apply(this, arguments)
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    p.then((res) => res.clone().text().then((t) => keep(url, t))).catch(() => {})
    return p
  }
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || !e.data.__madar || e.data.type !== 'find') return
    const needle = String(e.data.needle || '')
    const hits = recent
      .filter((r) => needle && r.text.includes(needle))
      .map((r) => {
        const i = r.text.indexOf(needle)
        return { path: r.path, around: r.text.slice(Math.max(0, i - 200), i + needle.length + 60) }
      })
    tell({ type: 'found', id: e.data.id, hits })
  })
  const WS = window.WebSocket
  if (WS) {
    const Wrapped = function (url, protocols) {
      const ws = protocols === undefined ? new WS(url) : new WS(url, protocols)
      try {
        ws.addEventListener('message', (e) => {
          // a new mention or a task change: let the agent take a quick look
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
