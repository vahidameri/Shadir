$ErrorActionPreference = 'Stop'
$docker = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'

if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  & $docker desktop start --detach
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop could not start' }
  return
}

$stopped = @(& $docker container ls -aq --filter 'status=exited' --filter 'status=created')
if ($LASTEXITCODE -ne 0) { throw 'Docker Engine is not ready' }
if (-not $stopped.Count) { return }

$policies = & $docker container inspect --format '{{.Id}}|{{.HostConfig.RestartPolicy.Name}}' @stopped
if ($LASTEXITCODE -ne 0) { throw 'Docker containers changed during the check' }

foreach ($entry in $policies) {
  $id, $policy = $entry -split '\|', 2
  if ($policy -in 'always', 'unless-stopped') {
    & $docker container start $id
    if ($LASTEXITCODE -ne 0) { throw "Could not start Docker container $id" }
  }
}
