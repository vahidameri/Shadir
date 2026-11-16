$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location (Join-Path $PSScriptRoot '..')

$private = Join-Path (Get-Location) '.secrets'
if (-not (Test-Path -LiteralPath $private)) {
  New-Item -ItemType Directory -Path $private | Out-Null
}
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls.exe $private /inheritance:r /grant:r "${account}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the deployment secret directory' }

foreach ($name in @('db-password.txt', 'admin-password.txt')) {
  $file = Join-Path $private $name
  if (-not (Test-Path -LiteralPath $file)) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [IO.File]::WriteAllText($file, ([BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()))
  }
}

docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose config failed' }
docker compose build
if ($LASTEXITCODE -ne 0) { throw 'Image build failed' }
docker compose up -d --wait --wait-timeout 120 db
if ($LASTEXITCODE -ne 0) { throw 'Database failed to start' }
Get-Content -LiteralPath (Join-Path $private 'admin-password.txt') -Raw | docker compose run --rm --no-deps -T web node deploy/server.mjs bootstrap
if ($LASTEXITCODE -ne 0) { throw 'Database bootstrap failed' }
docker compose up -d --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) { throw 'Application failed to start' }
