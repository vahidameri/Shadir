// Runs inside the Mizito page itself (MAIN world). It only listens: it hands the page's own session
// key (the x-token header Mizito's app sends) to the agent, and says when a new mention arrives on
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
