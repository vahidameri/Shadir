$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location (Join-Path $PSScriptRoot '..')

function Invoke-Docker {
  & docker.exe @args
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($args[0]) $($args[1]) ($LASTEXITCODE)" }
}

function Update-Web {
  Invoke-Docker compose up -d --no-deps --no-build --pull never --wait --wait-timeout 90 web
  if (-not (Invoke-RestMethod 'http://127.0.0.1:4181/healthz' -TimeoutSec 10).ok) { throw 'Madar health check failed' }
}

$mutex = [Threading.Mutex]::new($false, 'Global\VahidMadarDeploy')
$locked = $false
try {
  try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { return }

  $repo = 'vahidameri/Shadir'
  $branch = 'codex/asus-postgres'
  $queryBranch = [uri]::EscapeDataString($branch)
  $headers = @{ Accept = 'application/vnd.github+json' }
  $api = "https://api.github.com/repos/$repo"
  $runs = Invoke-RestMethod "$api/actions/workflows/madar-ci.yml/runs?branch=$queryBranch&event=push&per_page=1" -Headers $headers -TimeoutSec 25
  $run = $runs.workflow_runs | Select-Object -First 1
  if (-not $run -or $run.conclusion -ne 'success') { return }
  $revision = [string]$run.head_sha
  if ($run.head_branch -ne $branch -or $run.event -ne 'push' -or $run.head_repository.full_name -ne $repo -or $revision -cnotmatch '^[a-f0-9]{40}$') {
    throw 'CI run does not identify a Madar production branch commit'
  }

  $container = Invoke-Docker compose ps -q web
  if (-not $container) { throw 'The existing Madar web container is required for rollback' }
  $previous = Invoke-Docker inspect --format '{{.Image}}' $container
  $metadata = Invoke-Docker image inspect $previous | Out-String | ConvertFrom-Json
  if ($metadata[0].Config.Labels.'org.opencontainers.image.revision' -eq $revision) { return }

  $failedPath = Join-Path (Get-Location) '.secrets/madar-ci-failed-sha'
  if ((Test-Path -LiteralPath $failedPath) -and ((Get-Content -LiteralPath $failedPath -Raw).Trim() -eq $revision)) { return }
  $scratchRoot = [IO.Path]::GetFullPath($env:TEMP)
  $scratch = Join-Path $scratchRoot ('madar-release-' + [guid]::NewGuid().ToString('N'))
  $archive = Join-Path $scratch 'source.tar.gz'
  $candidate = "vahid-madar-web:ci-$revision"
  $image = 'vahid-madar-web:latest'
  New-Item -ItemType Directory -Path $scratch | Out-Null

  try {
    Invoke-WebRequest "$api/tarball/$revision" -UseBasicParsing -Headers $headers -OutFile $archive -TimeoutSec 120
    tar.exe -xzf $archive -C $scratch --strip-components 1
    if ($LASTEXITCODE -ne 0) { throw 'Could not extract the Madar source archive' }
    Remove-Item -LiteralPath $archive
    Invoke-Docker build --label "org.opencontainers.image.revision=$revision" -t $candidate $scratch
    Invoke-Docker image tag $previous 'vahid-madar-web:rollback'
    Invoke-Docker image tag $candidate $image

    try {
      Update-Web
      Write-Output "Deployed Madar $revision"
    } catch {
      $deploymentError = $_
      Set-Content -LiteralPath $failedPath -Value $revision -Encoding ascii
      Invoke-Docker image tag $previous $image
      Update-Web
      throw "Madar $revision rolled back: $deploymentError"
    } finally {
      Invoke-Docker image rm $candidate | Out-Null
    }
  } finally {
    $resolvedScratch = (Resolve-Path -LiteralPath $scratch).Path
    if ((Split-Path -Parent $resolvedScratch) -eq $scratchRoot -and (Split-Path -Leaf $resolvedScratch) -match '^madar-release-[a-f0-9]{32}$') {
      Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
    }
  }
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
