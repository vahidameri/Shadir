const $ = (id) => document.getElementById(id)
const fa = (n) => String(n ?? 0).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])
const ago = (t) => {
  if (!t) return 'هنوز نه'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'همین الان' : m < 60 ? `${fa(m)} دقیقه پیش` : m < 1440 ? `${fa(Math.round(m / 60))} ساعت پیش` : `${fa(Math.round(m / 1440))} روز پیش`
}

async function render() {
  const { conn, status = {} } = await chrome.storage.local.get(['conn', 'status'])
  $('connect').classList.toggle('hidden', !!conn)
  $('ready').classList.toggle('hidden', !conn)
  const since = conn && conn.cutoff ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(conn.cutoff + 'T12:00')) : ''
  $('who').textContent = conn ? `${conn.n || ''}${since ? ` · از ${since}` : ''}` : 'مدار · وصل نیست'
  const busy = status.state === 'running'
  const failed = status.error && (!status.ok_at || status.error_at > status.ok_at)
  $('dot').className = 'dot' + (!conn ? '' : busy ? ' run' : failed ? ' bad' : status.ok_at ? ' ok' : '')
  if (!conn) return
  $('now').disabled = $('full').disabled = $('test').disabled = busy
  $('state-icon').textContent = busy ? '⏳' : failed ? '⚠️' : status.ok_at ? '✓' : '•'
  $('state').textContent = busy ? (status.test ? 'تست: خواندن یک هفته‌ی اخیر…' : 'در حال خواندن میزیتو…') : failed ? 'آخرین همگام‌سازی ناموفق بود' : status.ok_at ? 'همگام است' : 'هنوز همگام نشده'
  $('sub').textContent = busy ? 'می‌توانید این پنجره را ببندید' : `آخرین همگام‌سازی موفق: ${ago(status.ok_at)}`
  $('bar').classList.toggle('hidden', !busy)
  $('progress').textContent = busy ? status.progress || '' : status.note || ''
  const s = status.stats || {}
  $('t-tasks').textContent = fa(s.tasks || 0)
  $('t-mentions').textContent = fa(s.mentions || 0)
  $('t-comments').textContent = fa(s.comments || 0)
  $('error').textContent = failed ? status.error : ''
  $('error').classList.toggle('hidden', !failed)
}

$('go').onclick = async () => {
  $('cerr').textContent = ''
  $('go').disabled = true
  const r = await chrome.runtime.sendMessage({ type: 'connect', code: $('code').value })
  $('go').disabled = false
  if (!r || !r.ok) $('cerr').textContent = (r && r.error) || 'اتصال برقرار نشد'
  else chrome.runtime.sendMessage({ type: 'request', reason: 'first' })
  render()
}
$('now').onclick = () => chrome.runtime.sendMessage({ type: 'request', reason: 'manual' }).then(render)
$('test').onclick = () => chrome.runtime.sendMessage({ type: 'request', days: 7, reason: 'test' }).then(render)
$('full').onclick = () => chrome.runtime.sendMessage({ type: 'request', force: true, reason: 'manual' }).then(render)
$('out').onclick = async () => {
  if (!confirm('اتصال افزونه به مدار قطع شود؟')) return
  await chrome.storage.local.remove(['conn', 'status'])
  render()
}
chrome.storage.onChanged.addListener(render)
render()
