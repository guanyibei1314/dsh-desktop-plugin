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
  'Accept' = '*/*'
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

$nodeFile = [string]$toolchain.node.file
$expectedNodeFile = "node-v$officialNodeVersion-x64.msi"
if ($nodeFile -ne $expectedNodeFile) { throw "unexpected Node.js installer filename: manifest=$nodeFile expected=$expectedNodeFile" }
$expectedNodeUrl = "https://nodejs.org/download/release/v$officialNodeVersion/$nodeFile"
if ([string]$toolchain.node.url -ne $expectedNodeUrl) { throw "Node.js source URL mismatch: manifest=$($toolchain.node.url) expected=$expectedNodeUrl" }

$nodeSumsUrl = "https://nodejs.org/download/release/v$officialNodeVersion/SHASUMS256.txt"
$nodeSums = (Invoke-WebRequest -Uri $nodeSumsUrl -Headers $headers).Content
$nodeMatch = [regex]::Match([string]$nodeSums, "(?m)^([0-9a-fA-F]{64})\s+$([regex]::Escape($nodeFile))$")
if (-not $nodeMatch.Success) { throw "official Node.js SHASUMS does not contain $nodeFile" }
Assert-Hash -Expected ([string]$toolchain.node.sha256) -Actual $nodeMatch.Groups[1].Value -Name 'Node.js'
Write-Host "[official-toolchain] Node.js latest LTS=$officialNodeVersion sha256=$($nodeMatch.Groups[1].Value.ToLowerInvariant())"

# ---------------------------------------------------------- Git for Windows
# latest-tag.txt is maintained by Git for Windows and avoids the shared-runner
# anonymous api.github.com rate limit that previously blocked v0.9.2 releases.
$gitLatestTag = ((Invoke-WebRequest -Uri 'https://gitforwindows.org/latest-tag.txt' -Headers $headers).Content).Trim()
if ($gitLatestTag -notmatch '^v(\d+)\.(\d+)\.(\d+)\.windows\.(\d+)$') {
  throw "unexpected Git for Windows latest tag: $gitLatestTag"
}
$officialGitVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
if ($officialGitVersion -ne [string]$toolchain.git.version) {
  throw "pinned Git for Windows is not latest: pinned=$($toolchain.git.version) official=$officialGitVersion"
}

$gitFile = [string]$toolchain.git.file
$expectedGitFile = "Git-$officialGitVersion-64-bit.exe"
if ($gitFile -ne $expectedGitFile) { throw "unexpected Git for Windows installer filename: manifest=$gitFile expected=$expectedGitFile" }
$expectedGitUrl = "https://github.com/git-for-windows/git/releases/download/$gitLatestTag/$gitFile"
if ([string]$toolchain.git.url -ne $expectedGitUrl) {
  throw "Git for Windows source URL mismatch: manifest=$($toolchain.git.url) expected=$expectedGitUrl"
}
if ([string]$toolchain.git.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'Git for Windows manifest SHA-256 is invalid' }

# The following fetch-toolchain stage downloads this exact immutable release
# asset and verifies both the pinned SHA-256 and Authenticode publisher. The
# live gate here proves the pinned tag/file/URL still equals official latest;
# it intentionally does not depend on the rate-limited GitHub Releases API.
Write-Host "[official-toolchain] Git for Windows latest=$officialGitVersion source=$expectedGitUrl pinnedSha256=$(([string]$toolchain.git.sha256).ToLowerInvariant())"
Write-Host '[official-toolchain] pinned full Node.js/Git installers match current official releases; binary hash/signature verification remains in fetch-toolchain'
