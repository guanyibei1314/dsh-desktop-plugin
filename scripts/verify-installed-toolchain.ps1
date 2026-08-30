param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'toolchain-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "toolchain manifest missing: $manifestPath" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$toolchain = $manifest.windowsX64
if ($null -eq $toolchain) { throw 'windowsX64 toolchain definition missing' }
$expectedNodeVersion = "v$([string]$toolchain.node.version)"
$gitVersionParts = ([string]$toolchain.git.version).Split('.')
if ($gitVersionParts.Count -ne 4) { throw "unexpected Git manifest version: $($toolchain.git.version)" }
$expectedGitVersion = "git version $($gitVersionParts[0]).$($gitVersionParts[1]).$($gitVersionParts[2]).windows.$($gitVersionParts[3])"
Write-Host "[toolchain-e2e] expected manifest versions: node=$expectedNodeVersion git=$expectedGitVersion"

function Normalize-PathEntry {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  return $Value.Trim().Trim('"').TrimEnd('\').ToLowerInvariant()
}

function Test-PathContains {
  param(
    [string]$PathValue,
    [string]$Expected
  )
  $needle = Normalize-PathEntry $Expected
  foreach ($entry in @([string]$PathValue -split ';')) {
    if ((Normalize-PathEntry $entry) -eq $needle) { return $true }
  }
  return $false
}

function Get-PersistedPathSnapshot {
  $machine = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::Machine)
  $user = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
  return [PSCustomObject]@{
    Machine = [string]$machine
    User = [string]$user
    Combined = ((@([string]$machine, [string]$user) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join ';')
  }
}

function Assert-CommandVersion {
  param(
    [string]$Exe,
    [string[]]$Arguments,
    [string]$Expected,
    [string]$Name
  )
  if (-not (Test-Path -LiteralPath $Exe)) { throw "$Name executable missing: $Exe" }
  $output = (& $Exe @Arguments 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "$Name version command failed with exit code ${LASTEXITCODE}: $output" }
  if ($output -ne $Expected) { throw "$Name version mismatch: expected='$Expected' actual='$output'" }
  Write-Host "[toolchain-e2e] $Name version verified: $output"
}

function Assert-FilePresent {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Name missing: $Path" }
  Write-Host "[toolchain-e2e] $Name present: $Path"
}

function Uninstall-Dsh {
  param([string]$InstallDir)
  $uninstaller = Get-ChildItem -Path $InstallDir -Filter 'Uninstall*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $uninstaller) { throw "DSH uninstaller missing after install: $InstallDir" }
  $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
  if ($uninstall.ExitCode -ne 0) { throw "DSH uninstall failed with exit code $($uninstall.ExitCode): $InstallDir" }
}

if (-not (Test-Path -LiteralPath $InstallerPath)) { throw "installer not found: $InstallerPath" }
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$installDir = Join-Path $env:RUNNER_TEMP 'dsh-desktop-toolchain-e2e'
$hijackInstallDir = Join-Path $env:RUNNER_TEMP 'dsh-desktop-toolchain-hijack-e2e'
foreach ($dir in @($installDir, $hijackInstallDir)) {
  if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
}

$nodeDir = Join-Path $env:ProgramFiles 'nodejs'
$nodeExe = Join-Path $nodeDir 'node.exe'
$npmCmd = Join-Path $nodeDir 'npm.cmd'
$gitRoot = Join-Path $env:ProgramFiles 'Git'
$gitCmdDir = Join-Path $gitRoot 'cmd'
$gitExe = Join-Path $gitCmdDir 'git.exe'
$gitBash = Join-Path $gitRoot 'git-bash.exe'
$gitGui = Join-Path $gitCmdDir 'git-gui.exe'

$oldForce = $env:DSH_TOOLCHAIN_FORCE_INSTALL
try {
  $env:DSH_TOOLCHAIN_FORCE_INSTALL = '1'
  Write-Host "[toolchain-e2e] installing DSH with forced full Node/Git toolchain -> $installDir"
  $install = Start-Process -FilePath $InstallerPath -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
  if ($install.ExitCode -ne 0) { throw "DSH installer/toolchain chain failed with exit code $($install.ExitCode)" }
} finally {
  if ($null -eq $oldForce) {
    Remove-Item Env:DSH_TOOLCHAIN_FORCE_INSTALL -ErrorAction SilentlyContinue
  } else {
    $env:DSH_TOOLCHAIN_FORCE_INSTALL = $oldForce
  }
}

$desktopExe = Join-Path $installDir 'DSH Desktop.exe'
if (-not (Test-Path -LiteralPath $desktopExe)) { throw "DSH Desktop executable missing after install: $desktopExe" }

Assert-CommandVersion -Exe $nodeExe -Arguments @('--version') -Expected $expectedNodeVersion -Name 'Node.js'
Assert-FilePresent -Path $npmCmd -Name 'npm command'
$expectedNpmVersion = (& $npmCmd --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $expectedNpmVersion -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
  throw "npm bundled by the verified Node.js MSI is not working or returned an invalid version: $expectedNpmVersion"
}
Write-Host "[toolchain-e2e] npm from verified Node.js MSI: $expectedNpmVersion"
Assert-CommandVersion -Exe $gitExe -Arguments @('--version') -Expected $expectedGitVersion -Name 'Git for Windows'
Assert-FilePresent -Path $gitBash -Name 'Git Bash'
Assert-FilePresent -Path $gitGui -Name 'Git GUI'
$gitLfs = (& $gitExe lfs version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $gitLfs -notmatch '^git-lfs/\d+\.\d+\.\d+') {
  throw "full Git for Windows install is missing working Git LFS: $gitLfs"
}
Write-Host "[toolchain-e2e] Git LFS verified: $gitLfs"

$pathState = Get-PersistedPathSnapshot
$nodeInMachine = Test-PathContains -PathValue $pathState.Machine -Expected $nodeDir
$gitInMachine = Test-PathContains -PathValue $pathState.Machine -Expected $gitCmdDir
if (-not $nodeInMachine) { throw "Node.js install succeeded but Machine PATH does not contain $nodeDir" }
if (-not $gitInMachine) { throw "Git install succeeded but Machine PATH does not contain $gitCmdDir" }
Write-Host '[toolchain-e2e] Machine PATH contains full Node.js and Git for Windows'

$oldPath = $env:Path
try {
  $env:Path = $pathState.Combined
  $nodeResolved = (& $env:ComSpec /D /C 'where node' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeResolved)) { throw "fresh shell cannot resolve node from persisted PATH: $nodeResolved" }
  $gitResolved = (& $env:ComSpec /D /C 'where git' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitResolved)) { throw "fresh shell cannot resolve git from persisted PATH: $gitResolved" }
  $nodeVersion = (& $env:ComSpec /D /C 'node --version' 2>&1 | Out-String).Trim()
  if ($nodeVersion -ne $expectedNodeVersion) { throw "fresh shell resolved wrong node: expected='$expectedNodeVersion' actual='$nodeVersion'" }
  $npmVersion = (& $env:ComSpec /D /C 'npm --version' 2>&1 | Out-String).Trim()
  if ($npmVersion -ne $expectedNpmVersion) { throw "fresh shell resolved wrong npm: expected='$expectedNpmVersion' actual='$npmVersion'" }
  $gitVersion = (& $env:ComSpec /D /C 'git --version' 2>&1 | Out-String).Trim()
  if ($gitVersion -ne $expectedGitVersion) { throw "fresh shell resolved wrong git: expected='$expectedGitVersion' actual='$gitVersion'" }
  Write-Host '[toolchain-e2e] fresh shell resolves the same node/npm/git delivered by the verified installers'
} finally {
  $env:Path = $oldPath
}

# A per-machine Electron/NSIS application has one uninstall registration. Do not
# keep two simultaneous DSH installs with the same AppID just to exercise the
# PATH-hijack case: a second install can legitimately reuse/replace the first
# uninstall registration. Uninstall the first DSH instance now and prove that
# the independently installed system toolchain survives before reinstalling DSH.
Uninstall-Dsh -InstallDir $installDir
Assert-CommandVersion -Exe $nodeExe -Arguments @('--version') -Expected $expectedNodeVersion -Name 'Node.js after first DSH uninstall'
Assert-CommandVersion -Exe $npmCmd -Arguments @('--version') -Expected $expectedNpmVersion -Name 'npm after first DSH uninstall'
Assert-CommandVersion -Exe $gitExe -Arguments @('--version') -Expected $expectedGitVersion -Name 'Git after first DSH uninstall'
Assert-FilePresent -Path $gitBash -Name 'Git Bash after first DSH uninstall'
$pathAfterFirstUninstall = Get-PersistedPathSnapshot
if (-not (Test-PathContains -PathValue $pathAfterFirstUninstall.Machine -Expected $nodeDir)) { throw 'first DSH uninstall incorrectly removed the Node.js Machine PATH entry' }
if (-not (Test-PathContains -PathValue $pathAfterFirstUninstall.Machine -Expected $gitCmdDir)) { throw 'first DSH uninstall incorrectly removed the Git Machine PATH entry' }
Write-Host '[toolchain-e2e] first DSH uninstall preserved independent full Node/Git toolchain'

# Red-team the normal (non-force) detection path. A standard user can prepend
# writable PATH entries before approving UAC; elevated setup must never execute
# or trust those entries. Existing trusted Program Files tools should be found
# through fixed machine-owned paths instead.
$fakeDir = Join-Path $env:RUNNER_TEMP 'dsh-path-hijack-fixture'
$marker = Join-Path $fakeDir 'EXECUTED.txt'
if (Test-Path -LiteralPath $fakeDir) { Remove-Item -LiteralPath $fakeDir -Recurse -Force }
New-Item -ItemType Directory -Path $fakeDir | Out-Null
Set-Content -LiteralPath (Join-Path $fakeDir 'node.cmd') -Encoding ascii -Value "@echo off`r`necho node>>`"$marker`"`r`nexit /b 0`r`n"
Set-Content -LiteralPath (Join-Path $fakeDir 'git.cmd') -Encoding ascii -Value "@echo off`r`necho git>>`"$marker`"`r`nexit /b 0`r`n"
$oldPath = $env:Path
$oldForce = $env:DSH_TOOLCHAIN_FORCE_INSTALL
try {
  Remove-Item Env:DSH_TOOLCHAIN_FORCE_INSTALL -ErrorAction SilentlyContinue
  $env:Path = "$fakeDir;$oldPath"
  Write-Host '[toolchain-e2e] red-team reinstall with fake node/git at front of inherited PATH'
  $hijackInstall = Start-Process -FilePath $InstallerPath -ArgumentList @('/S', "/D=$hijackInstallDir") -PassThru -Wait
  if ($hijackInstall.ExitCode -ne 0) { throw "PATH-hijack regression install failed with exit code $($hijackInstall.ExitCode)" }
  $hijackDesktopExe = Join-Path $hijackInstallDir 'DSH Desktop.exe'
  if (-not (Test-Path -LiteralPath $hijackDesktopExe)) { throw "PATH-hijack DSH executable missing after install: $hijackDesktopExe" }
  if (Test-Path -LiteralPath $marker) {
    throw "elevated installer executed user-controlled PATH command: $(Get-Content -LiteralPath $marker -Raw)"
  }
  Write-Host '[toolchain-e2e] fake user PATH node/git were not executed by elevated setup'
} finally {
  $env:Path = $oldPath
  if ($null -eq $oldForce) {
    Remove-Item Env:DSH_TOOLCHAIN_FORCE_INSTALL -ErrorAction SilentlyContinue
  } else {
    $env:DSH_TOOLCHAIN_FORCE_INSTALL = $oldForce
  }
}

Uninstall-Dsh -InstallDir $hijackInstallDir

Assert-CommandVersion -Exe $nodeExe -Arguments @('--version') -Expected $expectedNodeVersion -Name 'Node.js after DSH uninstall'
Assert-CommandVersion -Exe $npmCmd -Arguments @('--version') -Expected $expectedNpmVersion -Name 'npm after DSH uninstall'
Assert-CommandVersion -Exe $gitExe -Arguments @('--version') -Expected $expectedGitVersion -Name 'Git after DSH uninstall'
Assert-FilePresent -Path $gitBash -Name 'Git Bash after DSH uninstall'
$afterPath = Get-PersistedPathSnapshot
if (-not (Test-PathContains -PathValue $afterPath.Machine -Expected $nodeDir)) { throw 'DSH uninstall incorrectly removed the Node.js Machine PATH entry' }
if (-not (Test-PathContains -PathValue $afterPath.Machine -Expected $gitCmdDir)) { throw 'DSH uninstall incorrectly removed the Git Machine PATH entry' }

Write-Host '[toolchain-e2e] full Node.js + npm + full Git system installation, Machine PATH, serialized PATH-hijack resistance and DSH-uninstall independence passed'
