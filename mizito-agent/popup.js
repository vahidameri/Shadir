const $ = (id) => document.getElementById(id)
const ago = (t) => {
  if (!t) return '—'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'همین الان' : m < 60 ? `${m} دقیقه پیش` : m < 1440 ? `${Math.round(m / 60)} ساعت پیش` : `${Math.round(m / 1440)} روز پیش`
}
const fa = (n) => String(n ?? 0).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])

async function render() {
  const { conn, status = {} } = await chrome.storage.local.get(['conn', 'status'])
  $('connect').classList.toggle('hidden', !!conn)
  $('ready').classList.toggle('hidden', !conn)
  $('who').textContent = conn ? `${conn.n || ''} · از ${conn.cutoff || ''}` : 'به مدار وصل نیست'
  if (!conn) return
  const busy = status.state === 'running'
  $('now').disabled = $('full').disabled = busy
  $('state').innerHTML = busy
    ? `<b>در حال خواندن${status.full ? ' (کامل)' : ''}…</b>`
    : `آخرین همگام‌سازی موفق: <b class="ok">${ago(status.ok_at)}</b> · آخرین خواندن کامل: ${ago(status.full_at)}`
  $('progress').textContent = busy ? status.progress || '' : status.note || ''
  const s = status.stats
  $('stats').textContent = s && !busy ? `${fa(s.tasks)} تسک، ${fa(s.mentions)} منشن، ${fa(s.comments)} کامنت خوانده شد؛ ${fa(s.sent)} تسک به مدار رفت.` : ''
  $('error').textContent = status.error && (!status.ok_at || status.error_at > status.ok_at) ? `⚠ ${status.error}` : ''
}

$('go').onclick = async () => {
  $('cerr').textContent = ''
  $('go').disabled = true
  const r = await chrome.runtime.sendMessage({ type: 'connect', code: $('code').value })
  $('go').disabled = false
  if (!r || !r.ok) $('cerr').textContent = (r && r.error) || 'اتصال برقرار نشد'
  else chrome.runtime.sendMessage({ type: 'request', full: true, reason: 'first' })
  render()
}
$('now').onclick = () => chrome.runtime.sendMessage({ type: 'request', full: false, reason: 'manual' }).then(render)
$('full').onclick = () => chrome.runtime.sendMessage({ type: 'request', force: true, reason: 'manual' }).then(render)
$('out').onclick = async () => {
  if (!confirm('اتصال افزونه به مدار قطع شود؟')) return
  await chrome.storage.local.remove(['conn', 'status'])
  render()
}
chrome.storage.onChanged.addListener(render)
render()
