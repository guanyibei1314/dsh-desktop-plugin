param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

if (-not (Test-Path -LiteralPath $InstallerPath)) { throw "installer not found: $InstallerPath" }
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$installDir = Join-Path $env:RUNNER_TEMP 'dsh-desktop-toolchain-e2e'
if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }

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

Assert-CommandVersion -Exe $nodeExe -Arguments @('--version') -Expected 'v24.19.0' -Name 'Node.js'
Assert-FilePresent -Path $npmCmd -Name 'npm command'
Assert-CommandVersion -Exe $npmCmd -Arguments @('--version') -Expected '11.17.0' -Name 'npm'
Assert-CommandVersion -Exe $gitExe -Arguments @('--version') -Expected 'git version 2.55.0.windows.5' -Name 'Git for Windows'
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
if (-not $nodeInMachine) {
  throw "Node.js install succeeded but Machine PATH does not contain $nodeDir"
}
if (-not $gitInMachine) {
  throw "Git install succeeded but Machine PATH does not contain $gitCmdDir"
}
Write-Host '[toolchain-e2e] Machine PATH contains full Node.js and Git for Windows'

# Verify a fresh shell built only from persisted Machine/User PATH can resolve
# both commands. This catches installers that wrote files but failed PATH setup.
$oldPath = $env:Path
try {
  $env:Path = $pathState.Combined
  $nodeResolved = (& $env:ComSpec /D /C 'where node' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeResolved)) { throw "fresh shell cannot resolve node from persisted PATH: $nodeResolved" }
  $gitResolved = (& $env:ComSpec /D /C 'where git' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitResolved)) { throw "fresh shell cannot resolve git from persisted PATH: $gitResolved" }
  $nodeVersion = (& $env:ComSpec /D /C 'node --version' 2>&1 | Out-String).Trim()
  if ($nodeVersion -ne 'v24.19.0') { throw "fresh shell resolved wrong node: $nodeVersion" }
  $npmVersion = (& $env:ComSpec /D /C 'npm --version' 2>&1 | Out-String).Trim()
  if ($npmVersion -ne '11.17.0') { throw "fresh shell resolved wrong npm: $npmVersion" }
  $gitVersion = (& $env:ComSpec /D /C 'git --version' 2>&1 | Out-String).Trim()
  if ($gitVersion -ne 'git version 2.55.0.windows.5') { throw "fresh shell resolved wrong git: $gitVersion" }
  Write-Host '[toolchain-e2e] fresh shell resolves expected node/npm/git versions from persisted PATH'
} finally {
  $env:Path = $oldPath
}

$uninstaller = Get-ChildItem -Path $installDir -Filter 'Uninstall*.exe' -File | Select-Object -First 1
if ($null -eq $uninstaller) { throw 'DSH uninstaller missing after install' }
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { throw "DSH uninstall failed with exit code $($uninstall.ExitCode)" }

# Node/Git are official independent products. DSH uninstall must never remove
# them or strip the PATH entries owned by their own installers.
Assert-CommandVersion -Exe $nodeExe -Arguments @('--version') -Expected 'v24.19.0' -Name 'Node.js after DSH uninstall'
Assert-CommandVersion -Exe $gitExe -Arguments @('--version') -Expected 'git version 2.55.0.windows.5' -Name 'Git after DSH uninstall'
Assert-FilePresent -Path $gitBash -Name 'Git Bash after DSH uninstall'
$afterPath = Get-PersistedPathSnapshot
if (-not (Test-PathContains -PathValue $afterPath.Machine -Expected $nodeDir)) {
  throw 'DSH uninstall incorrectly removed the Node.js Machine PATH entry'
}
if (-not (Test-PathContains -PathValue $afterPath.Machine -Expected $gitCmdDir)) {
  throw 'DSH uninstall incorrectly removed the Git Machine PATH entry'
}

Write-Host '[toolchain-e2e] full Node.js + full Git system installation, Machine PATH and DSH-uninstall independence passed'
