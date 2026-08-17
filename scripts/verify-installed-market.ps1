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
$installDir = Join-Path $env:RUNNER_TEMP "dsh-market-$Label"
if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }

Write-Host "[market-e2e] [$Label] installing -> $installDir"
$install = Start-Process -FilePath $InstallerPath -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
if ($install.ExitCode -ne 0) { throw "[$Label] NSIS install failed with exit code $($install.ExitCode)" }

$exe = Join-Path $installDir 'DSH Desktop.exe'
if (-not (Test-Path $exe)) { throw "[$Label] installed executable missing" }

$probe = Join-Path $env:RUNNER_TEMP "dsh-market-probe-$Label.js"
$marketModule = (Join-Path $installDir 'resources\app.asar\plugin-market.js').Replace('\', '/')
$securityModule = (Join-Path $installDir 'resources\app.asar\plugin-security.js').Replace('\', '/')
$cacheFile = (Join-Path $env:RUNNER_TEMP "dsh-market-cache-$Label.json").Replace('\', '/')
$marketLiteral = ConvertTo-Json $marketModule -Compress
$securityLiteral = ConvertTo-Json $securityModule -Compress
$cacheLiteral = ConvertTo-Json $cacheFile -Compress
$probeSource = @"
const market = require($marketLiteral);
const security = require($securityLiteral);
(async () => {
  const result = await market.loadPluginCatalog($cacheLiteral);
  if (!result || result.source !== 'live') throw new Error('live registry unavailable: ' + JSON.stringify(result));
  if (!result.registry || !Array.isArray(result.registry.plugins) || result.registry.plugins.length < 100) throw new Error('live registry unexpectedly small');
  const sample = result.registry.plugins.find((p) => p && p.installable && p.packageName && !p.deprecated);
  if (!sample) throw new Error('no installable plugin found in live registry');
  const assessment = await security.assessPackageSecurity(sample.packageName);
  if (!assessment || !assessment.metadata || !assessment.metadata.latestVersion) throw new Error('live npm security metadata unavailable for ' + sample.packageName);
  if (!assessment.assessment || typeof assessment.assessment.score !== 'number') throw new Error('security assessment missing');
  console.log('[market-e2e] liveCount=' + result.registry.plugins.length + ' sample=' + sample.packageName + ' risk=' + assessment.assessment.level + ' score=' + assessment.assessment.score);
})().catch((error) => { console.error(error && error.stack ? error.stack : error); process.exitCode = 1; });
"@
Set-Content -Path $probe -Value $probeSource -Encoding UTF8

$stdout = Join-Path $env:RUNNER_TEMP "dsh-market-$Label.stdout.log"
$stderr = Join-Path $env:RUNNER_TEMP "dsh-market-$Label.stderr.log"
$old = $env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE = '1'
  $process = Start-Process -FilePath $exe -ArgumentList @("`"$probe`"") -PassThru -Wait -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  if ($process.ExitCode -ne 0) {
    if (Test-Path $stdout) { Get-Content $stdout | ForEach-Object { Write-Host $_ } }
    if (Test-Path $stderr) { Get-Content $stderr | ForEach-Object { Write-Host $_ } }
    throw "[$Label] installed market/security probe failed with exit code $($process.ExitCode)"
  }
  Get-Content $stdout | ForEach-Object { Write-Host $_ }
} finally {
  if ($null -eq $old) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE = $old }
  Remove-Item $probe -Force -ErrorAction SilentlyContinue
}

$uninstaller = Get-ChildItem -Path $installDir -Filter 'Uninstall*.exe' -File | Select-Object -First 1
if ($null -eq $uninstaller) { throw "[$Label] uninstaller missing" }
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { throw "[$Label] uninstall failed with exit code $($uninstall.ExitCode)" }
Write-Host "[market-e2e] [$Label] installed live market + security preflight passed"
