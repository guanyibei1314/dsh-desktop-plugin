param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9_-]+$')]
  [string]$Label
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InstallerPath)) { throw "[$Label] installer not found: $InstallerPath" }
$InstallerPath = (Resolve-Path $InstallerPath).Path
$installDir = Join-Path $env:RUNNER_TEMP "dsh-runtime-update-$Label"
$runtimeRoot = Join-Path $env:RUNNER_TEMP "dsh-runtime-root-$Label"
$dshHome = Join-Path $env:RUNNER_TEMP "dsh-runtime-home-$Label"
foreach ($dir in @($installDir, $runtimeRoot, $dshHome)) {
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
}

function Show-RuntimeDiagnostics {
  param([string]$Root)
  $statePath = Join-Path $Root 'state.json'
  $runtimeLog = Join-Path $Root 'runtime-update.log'
  if (Test-Path $statePath) {
    Write-Host '[runtime-e2e] ----- state.json -----'
    Get-Content $statePath | ForEach-Object { Write-Host $_ }
  }
  if (Test-Path $runtimeLog) {
    Write-Host '[runtime-e2e] ----- runtime-update.log -----'
    Get-Content $runtimeLog | ForEach-Object { Write-Host $_ }
  }
}

Write-Host "[runtime-e2e] [$Label] installing -> $installDir"
$install = Start-Process -FilePath $InstallerPath -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
if ($install.ExitCode -ne 0) { throw "[$Label] NSIS install failed with exit code $($install.ExitCode)" }

$exe = Join-Path $installDir 'DSH Desktop.exe'
if (-not (Test-Path $exe)) { throw "[$Label] installed executable missing" }

$stdout = Join-Path $env:RUNNER_TEMP "dsh-runtime-$Label.stdout.log"
$stderr = Join-Path $env:RUNNER_TEMP "dsh-runtime-$Label.stderr.log"
$oldRuntimeRoot = $env:DSH_DESKTOP_RUNTIME_ROOT
$oldDshHome = $env:DSH_DESKTOP_DSH_HOME
$oldAuto = $env:DSH_RUNTIME_AUTO_UPDATE
try {
  $env:DSH_DESKTOP_RUNTIME_ROOT = $runtimeRoot
  $env:DSH_DESKTOP_DSH_HOME = $dshHome
  $env:DSH_RUNTIME_AUTO_UPDATE = '0'
  $process = Start-Process -FilePath $exe -ArgumentList '--runtime-update-smoke' -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  try {
    Wait-Process -Id $process.Id -Timeout 300 -ErrorAction Stop
  } catch {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Show-RuntimeDiagnostics -Root $runtimeRoot
    throw "[$Label] runtime updater smoke timed out"
  }
  $process.Refresh()
  if (Test-Path $stdout) { Get-Content $stdout | ForEach-Object { Write-Host $_ } }
  if ($process.ExitCode -ne 0) {
    if (Test-Path $stderr) { Get-Content $stderr | ForEach-Object { Write-Host $_ } }
    Show-RuntimeDiagnostics -Root $runtimeRoot
    throw "[$Label] runtime updater smoke failed with exit code $($process.ExitCode)"
  }

  $stateFile = Join-Path $runtimeRoot 'state.json'
  if (-not (Test-Path $stateFile)) { throw "[$Label] runtime state missing" }
  $state = Get-Content $stateFile -Raw | ConvertFrom-Json
  if (-not $state.activeVersion) { throw "[$Label] runtime activeVersion missing" }
  if ($state.pendingVersion) { throw "[$Label] runtime pendingVersion should be empty after activation" }
  if ($state.latestVersion -ne $state.activeVersion) { throw "[$Label] active/latest mismatch: $($state.activeVersion) vs $($state.latestVersion)" }

  $pkgFile = Join-Path $runtimeRoot "versions\$($state.activeVersion)\node_modules\@deepseek-ai\dsh\package.json"
  if (-not (Test-Path $pkgFile)) { throw "[$Label] managed DSH package missing" }
  $pkg = Get-Content $pkgFile -Raw | ConvertFrom-Json
  if ($pkg.name -ne '@deepseek-ai/dsh' -or $pkg.version -ne $state.activeVersion) {
    throw "[$Label] managed DSH package identity/version mismatch"
  }
  Write-Host "[runtime-e2e] official runtime downloaded, integrity-checked, web-probed and activated: $($state.activeVersion)"
} finally {
  if ($null -eq $oldRuntimeRoot) { Remove-Item Env:DSH_DESKTOP_RUNTIME_ROOT -ErrorAction SilentlyContinue } else { $env:DSH_DESKTOP_RUNTIME_ROOT = $oldRuntimeRoot }
  if ($null -eq $oldDshHome) { Remove-Item Env:DSH_DESKTOP_DSH_HOME -ErrorAction SilentlyContinue } else { $env:DSH_DESKTOP_DSH_HOME = $oldDshHome }
  if ($null -eq $oldAuto) { Remove-Item Env:DSH_RUNTIME_AUTO_UPDATE -ErrorAction SilentlyContinue } else { $env:DSH_RUNTIME_AUTO_UPDATE = $oldAuto }
}

$uninstaller = Get-ChildItem -Path $installDir -Filter 'Uninstall*.exe' -File | Select-Object -First 1
if ($null -eq $uninstaller) { throw "[$Label] uninstaller missing" }
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { throw "[$Label] uninstall failed with exit code $($uninstall.ExitCode)" }

foreach ($dir in @($runtimeRoot, $dshHome)) {
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Host "[runtime-e2e] [$Label] runtime updater full chain passed"
