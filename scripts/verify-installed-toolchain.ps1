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

if (-not (Test-Path -LiteralPath $InstallerPath)) { throw "installer not found: $InstallerPath" }
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$installDir = Join-Path $env:RUNNER_TEMP 'dsh-desktop-toolchain-e2e'
if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }

$nodeDir = Join-Path $env:ProgramFiles 'nodejs'
$nodeExe = Join-Path $nodeDir 'node.exe'
$gitCmdDir = Join-Path $env:ProgramFiles 'Git\cmd'
$gitExe = Join-Path $gitCmdDir 'git.exe'

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
Assert-CommandVersion -Exe $gitExe -Arguments @('--version') -Expected 'git version 2.55.0.windows.3' -Name 'Git for Windows'

$pathState = Get-PersistedPathSnapshot
$nodeInMachine = Test-PathContains -PathValue $pathState.Machine -Expected $nodeDir
$nodeInUser = Test-PathContains -PathValue $pathState.User -Expected $nodeDir
$gitInMachine = Test-PathContains -PathValue $pathState.Machine -Expected $gitCmdDir
$gitInUser = Test-PathContains -PathValue $pathState.User -Expected $gitCmdDir

if (-not ($nodeInMachine -or $nodeInUser)) {
  throw "Node.js install succeeded but persisted Windows PATH does not contain $nodeDir"
}
if (-not ($gitInMachine -or $gitInUser)) {
  throw "Git install succeeded but persisted Windows PATH does not contain $gitCmdDir"
}
Write-Host "[toolchain-e2e] PATH verified: node(machine=$nodeInMachine,user=$nodeInUser) git(machine=$gitInMachine,user=$gitInUser)"

# Verify a new shell built from persisted Machine/User PATH can resolve both commands.
$oldPath = $env:Path
try {
  $env:Path = $pathState.Combined
  $nodeResolved = (& $env:ComSpec /D /C 'where node' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeResolved)) { throw "new shell cannot resolve node from persisted PATH: $nodeResolved" }
  $gitResolved = (& $env:ComSpec /D /C 'where git' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitResolved)) { throw "new shell cannot resolve git from persisted PATH: $gitResolved" }
  Write-Host "[toolchain-e2e] new shell resolves node and git from persisted PATH"
} finally {
  $env:Path = $oldPath
}

$uninstaller = Get-ChildItem -Path $installDir -Filter 'Uninstall*.exe' -File | Select-Object -First 1
if ($null -eq $uninstaller) { throw 'DSH uninstaller missing after install' }
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { throw "DSH uninstall failed with exit code $($uninstall.ExitCode)" }

# Node/Git are official independent products. DSH uninstall must never remove them
# or strip the PATH entries owned by their installers.
Assert-CommandVersion -Exe $nodeExe -Arguments @('--version') -Expected 'v24.19.0' -Name 'Node.js after DSH uninstall'
Assert-CommandVersion -Exe $gitExe -Arguments @('--version') -Expected 'git version 2.55.0.windows.3' -Name 'Git after DSH uninstall'
$afterPath = Get-PersistedPathSnapshot
if (-not ((Test-PathContains -PathValue $afterPath.Machine -Expected $nodeDir) -or (Test-PathContains -PathValue $afterPath.User -Expected $nodeDir))) {
  throw 'DSH uninstall incorrectly removed the Node.js PATH entry'
}
if (-not ((Test-PathContains -PathValue $afterPath.Machine -Expected $gitCmdDir) -or (Test-PathContains -PathValue $afterPath.User -Expected $gitCmdDir))) {
  throw 'DSH uninstall incorrectly removed the Git PATH entry'
}

Write-Host '[toolchain-e2e] full Node.js + full Git installation, persisted PATH and DSH-uninstall independence passed'
