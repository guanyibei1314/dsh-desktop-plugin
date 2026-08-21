Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'toolchain-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "toolchain manifest missing: $manifestPath" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$toolchain = $manifest.windowsX64
if ($null -eq $toolchain) { throw 'windowsX64 toolchain definition missing' }

$headers = @{
  'User-Agent' = 'DSH-Desktop-CI'
  'Accept' = 'application/vnd.github+json'
}

function Assert-Hash {
  param([string]$Expected, [string]$Actual, [string]$Name)
  if ($Expected.ToLowerInvariant() -ne $Actual.ToLowerInvariant()) {
    throw "$Name official SHA-256 mismatch: manifest=$Expected official=$Actual"
  }
}

# ---------------------------------------------------------------- Node.js LTS
$nodeIndex = Invoke-RestMethod -Uri 'https://nodejs.org/download/release/index.json' -Headers $headers
$latestLts = @($nodeIndex | Where-Object { $_.lts -and $_.lts -ne $false } | Select-Object -First 1)
if ($latestLts.Count -ne 1) { throw 'unable to resolve latest official Node.js LTS release' }
$officialNodeVersion = ([string]$latestLts[0].version).TrimStart('v')
if ($officialNodeVersion -ne [string]$toolchain.node.version) {
  throw "pinned Node.js is not latest LTS: pinned=$($toolchain.node.version) official=$officialNodeVersion"
}

$nodeSumsUrl = "https://nodejs.org/download/release/v$officialNodeVersion/SHASUMS256.txt"
$nodeSums = (Invoke-WebRequest -Uri $nodeSumsUrl -Headers $headers).Content
$nodeFile = [string]$toolchain.node.file
$nodeMatch = [regex]::Match([string]$nodeSums, "(?m)^([0-9a-fA-F]{64})\s+$([regex]::Escape($nodeFile))$")
if (-not $nodeMatch.Success) { throw "official Node.js SHASUMS does not contain $nodeFile" }
Assert-Hash -Expected ([string]$toolchain.node.sha256) -Actual $nodeMatch.Groups[1].Value -Name 'Node.js'
Write-Host "[official-toolchain] Node.js latest LTS=$officialNodeVersion sha256=$($nodeMatch.Groups[1].Value.ToLowerInvariant())"

# ---------------------------------------------------------- Git for Windows
$gitLatestTag = ((Invoke-WebRequest -Uri 'https://gitforwindows.org/latest-tag.txt' -Headers $headers).Content).Trim()
if ($gitLatestTag -notmatch '^v(\d+)\.(\d+)\.(\d+)\.windows\.(\d+)$') {
  throw "unexpected Git for Windows latest tag: $gitLatestTag"
}
$officialGitVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
if ($officialGitVersion -ne [string]$toolchain.git.version) {
  throw "pinned Git for Windows is not latest: pinned=$($toolchain.git.version) official=$officialGitVersion"
}

$releaseUrl = "https://api.github.com/repos/git-for-windows/git/releases/tags/$gitLatestTag"
$release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers
if ($release.draft -or $release.prerelease) { throw "latest Git for Windows tag is not a final release: $gitLatestTag" }
$gitFile = [string]$toolchain.git.file
$asset = @($release.assets | Where-Object { $_.name -eq $gitFile } | Select-Object -First 1)
if ($asset.Count -ne 1) { throw "official Git for Windows release does not contain $gitFile" }

$officialGitHash = $null
if ($asset[0].PSObject.Properties.Name -contains 'digest' -and [string]$asset[0].digest -match '^sha256:([0-9a-fA-F]{64})$') {
  $officialGitHash = $Matches[1]
}
if (-not $officialGitHash) {
  $bodyPattern = "(?im)^\s*$([regex]::Escape($gitFile))\s*\|\s*([0-9a-fA-F]{64})\s*$"
  $bodyMatch = [regex]::Match([string]$release.body, $bodyPattern)
  if ($bodyMatch.Success) { $officialGitHash = $bodyMatch.Groups[1].Value }
}
if (-not $officialGitHash) { throw "unable to obtain official SHA-256 for $gitFile from GitHub release metadata" }
Assert-Hash -Expected ([string]$toolchain.git.sha256) -Actual $officialGitHash -Name 'Git for Windows'
Write-Host "[official-toolchain] Git for Windows latest=$officialGitVersion sha256=$($officialGitHash.ToLowerInvariant())"

Write-Host '[official-toolchain] pinned full Node.js/Git installers match current official releases'
