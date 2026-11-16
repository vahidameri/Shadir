param(
  [Parameter(Mandatory)][int]$Port,
  [Parameter(Mandatory)][int]$OtherPort
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = "http://127.0.0.1:$Port"
$other = "http://127.0.0.1:$OtherPort"

function Wait-Healthy($url) {
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      if ((Invoke-RestMethod "$url/healthz" -TimeoutSec 3).ok) { return }
    } catch {}
    Start-Sleep -Seconds 2
  }
  throw "Health check failed on $url"
}
function Send-Action($body) {
  $response = Invoke-RestMethod "$base/api" -Method Post -ContentType 'application/json; charset=utf-8' -Body ($body | ConvertTo-Json -Depth 6 -Compress)
  if (-not $response.ok) { throw "API action $($body.action) failed: $($response.error)" }
  return $response
}
function Read-Projects($token) {
  return (Invoke-RestMethod "$base/api?action=all&session=$token").data.Projects
}

Wait-Healthy $base
Wait-Healthy $other
if ((Invoke-WebRequest -UseBasicParsing $base).StatusCode -ne 200) { throw 'Frontend failed' }
if ((Invoke-RestMethod "$base/api?action=all").ok) { throw 'Unauthenticated read succeeded' }
$token = (Send-Action @{ action = 'pwLogin'; username = 'admin'; password = (Get-Content -LiteralPath '.secrets/admin-password.txt' -Raw).Trim() }).session
if ((Invoke-RestMethod "$other/api?action=all&session=$token").ok) { throw 'Session worked in the other stack' }
$id = 'docker-smoke-' + [guid]::NewGuid().ToString('N')
$row = @{ id = $id; name = 'Temporary deployment smoke test'; status = 'active' }

try {
  Send-Action @{ action = 'upsert'; session = $token; sheet = 'Projects'; row = $row } | Out-Null
  if (-not (Read-Projects $token | Where-Object { $_.id -eq $id })) { throw 'Project write failed' }
  docker compose restart
  if ($LASTEXITCODE -ne 0) { throw 'Compose restart failed' }
  Wait-Healthy $base
  if (-not (Read-Projects $token | Where-Object { $_.id -eq $id })) { throw 'Project missing after restart' }
} finally {
  Send-Action @{ action = 'delete'; session = $token; sheet = 'Projects'; id = $id } | Out-Null
  if (Read-Projects $token | Where-Object { $_.id -eq $id }) { throw 'Project delete failed' }
  Send-Action @{ action = 'otpLogout'; session = $token } | Out-Null
}
if ((Invoke-RestMethod "$base/api?action=all&session=$token").ok) { throw 'Session still active after logout' }
Write-Output "Port $Port passed HTTP, login, cross-stack isolation, PostgreSQL restart persistence, deletion, and logout."
