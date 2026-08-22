param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [string]$ApplicationPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-SignedFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [bool]$Required,
    [string]$ExpectedSubject
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "signed-file target missing: $Path" }
  $sig = Get-AuthenticodeSignature -FilePath $Path
  $subject = if ($null -ne $sig.SignerCertificate) { [string]$sig.SignerCertificate.Subject } else { '' }
  $thumbprint = if ($null -ne $sig.SignerCertificate) { [string]$sig.SignerCertificate.Thumbprint } else { '' }

  Write-Host "[authenticode] path=$Path status=$($sig.Status) subject=$subject thumbprint=$thumbprint"

  if ($Required) {
    if ($sig.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
      throw "public release requires a valid trusted Authenticode signature: $Path status=$($sig.Status)"
    }
    if ([string]::IsNullOrWhiteSpace($ExpectedSubject)) {
      throw 'public release requires DSH_WINDOWS_SIGNING_SUBJECT to pin the expected publisher identity'
    }
    if ($subject -ne $ExpectedSubject) {
      throw "Authenticode publisher mismatch: expected='$ExpectedSubject' actual='$subject'"
    }
  } elseif ($sig.Status -eq [System.Management.Automation.SignatureStatus]::Valid -and -not [string]::IsNullOrWhiteSpace($ExpectedSubject)) {
    if ($subject -ne $ExpectedSubject) {
      throw "candidate is signed by unexpected publisher: expected='$ExpectedSubject' actual='$subject'"
    }
  }
}

$requireValue = ([string]$env:DSH_REQUIRE_SIGNED_INSTALLER).Trim().ToLowerInvariant()
$requireReleaseSignature = @('1', 'true', 'yes') -contains $requireValue
$expectedSubject = [string]$env:DSH_WINDOWS_SIGNING_SUBJECT

Test-SignedFile -Path (Resolve-Path -LiteralPath $InstallerPath).Path -Required $requireReleaseSignature -ExpectedSubject $expectedSubject
if (-not [string]::IsNullOrWhiteSpace($ApplicationPath)) {
  Test-SignedFile -Path (Resolve-Path -LiteralPath $ApplicationPath).Path -Required $requireReleaseSignature -ExpectedSubject $expectedSubject
}

if ($requireReleaseSignature) {
  Write-Host '[authenticode] trusted publisher gate passed for public release'
} else {
  Write-Host '[authenticode] PR/candidate build: trusted signature is optional; public release remains fail-closed'
}
