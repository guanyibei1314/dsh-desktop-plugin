Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'toolchain-manifest.json'
if (-not (Test-Path $manifestPath)) { throw "toolchain manifest missing: $manifestPath" }

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 1) { throw "unsupported toolchain manifest schema: $($manifest.schema)" }
$toolchain = $manifest.windowsX64
if ($null -eq $toolchain) { throw 'windowsX64 toolchain definition missing' }

$outDir = Join-Path $root 'build\toolchain'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Assert-HexSha256 {
  param([string]$Value, [string]$Name)
  if ($Value -notmatch '^[0-9a-fA-F]{64}$') { throw "$Name sha256 must be exactly 64 hex characters" }
}

function Get-GitReleaseTag {
  param([string]$Version)
  $parts = $Version.Split('.')
  if ($parts.Count -ne 4) { throw "Git for Windows version must be core.patchlevel form, got $Version" }
  return "v$($parts[0]).$($parts[1]).$($parts[2]).windows.$($parts[3])"
}

function Assert-Source {
  param([string]$Name, $Spec)
  if ([string]::IsNullOrWhiteSpace([string]$Spec.version)) { throw "$Name version missing" }
  if ([string]::IsNullOrWhiteSpace([string]$Spec.file)) { throw "$Name file missing" }
  Assert-HexSha256 -Value ([string]$Spec.sha256) -Name $Name

  $uri = [Uri]([string]$Spec.url)
  if ($uri.Scheme -ne 'https' -or -not [string]::IsNullOrEmpty($uri.UserInfo)) {
    throw "$Name URL must be credential-free HTTPS"
  }

  if ($Name -eq 'node') {
    if ($uri.Host -ne 'nodejs.org') { throw "Node installer must come from nodejs.org, got $($uri.Host)" }
    $expected = "/download/release/v$($Spec.version)/$($Spec.file)"
    if ($uri.AbsolutePath -ne $expected) { throw "unexpected Node installer path: $($uri.AbsolutePath)" }
  } elseif ($Name -eq 'git') {
    if ($uri.Host -ne 'github.com') { throw "Git installer must come from github.com, got $($uri.Host)" }
    $tag = Get-GitReleaseTag -Version ([string]$Spec.version)
    $expected = "/git-for-windows/git/releases/download/$tag/$($Spec.file)"
    if ($uri.AbsolutePath -ne $expected) { throw "unexpected Git installer path: $($uri.AbsolutePath)" }
  } else {
    throw "unsupported toolchain component: $Name"
  }
}

function Get-Sha256 {
  param([string]$Path)
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Ensure-Installer {
  param([string]$Name, $Spec)
  Assert-Source -Name $Name -Spec $Spec
  $dest = Join-Path $outDir ([string]$Spec.file)
  $expectedHash = ([string]$Spec.sha256).ToLowerInvariant()

  $reuse = $false
  if (Test-Path $dest) {
    $actual = Get-Sha256 -Path $dest
    if ($actual -eq $expectedHash) {
      $reuse = $true
      Write-Host "[toolchain] reuse $Name $($Spec.version): $dest"
    } else {
      Write-Host "[toolchain] cached $Name hash mismatch; deleting $dest"
      Remove-Item -LiteralPath $dest -Force
    }
  }

  if (-not $reuse) {
    $tmp = "$dest.download"
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    Write-Host "[toolchain] downloading $Name $($Spec.version) from pinned official URL"
    Invoke-WebRequest -Uri ([string]$Spec.url) -OutFile $tmp -MaximumRedirection 5
    Move-Item -LiteralPath $tmp -Destination $dest -Force
  }

  $hash = Get-Sha256 -Path $dest
  if ($hash -ne $expectedHash) {
    Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
    throw "$Name SHA-256 mismatch: expected=$expectedHash actual=$hash"
  }

  $size = (Get-Item -LiteralPath $dest).Length
  if ($size -lt 10MB -or $size -gt 120MB) {
    throw "$Name installer size outside expected safety range: $size bytes"
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $dest
  if ($signature.Status -ne 'Valid') {
    throw "$Name Authenticode signature is not valid: $($signature.Status)"
  }

  Write-Host "[toolchain] verified $Name $($Spec.version) bytes=$size sha256=$hash signer=$($signature.SignerCertificate.Subject)"
}

Ensure-Installer -Name 'node' -Spec $toolchain.node
Ensure-Installer -Name 'git' -Spec $toolchain.git

Write-Host "[toolchain] full Windows installers ready in $outDir"
