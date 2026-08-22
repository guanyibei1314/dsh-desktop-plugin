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

  if ($sig.Status -eq [System.Management.Automation.SignatureStatus]::Valid) {
    if (-not [string]::IsNullOrWhiteSpace($ExpectedSubject) -and $subject -ne $ExpectedSubject) {
      throw "Authenticode publisher mismatch: expected='$ExpectedSubject' actual='$subject'"
    }
    Write-Host "[authenticode] valid signature accepted: $Path"
    return
  }

  if ($sig.Status -ne [System.Management.Automation.SignatureStatus]::NotSigned) {
    throw "Authenticode signature is present or unreadable but not valid: $Path status=$($sig.Status)"
  }

  if ($Required) {
    Write-Warning "[authenticode] unsigned public release explicitly allowed: $Path"
  } else {
    Write-Host "[authenticode] unsigned candidate accepted: $Path"
  }
}

$requireValue = ([string]$env:DSH_REQUIRE_SIGNED_INSTALLER).Trim().ToLowerInvariant()
$releaseSignatureRequested = @('1', 'true', 'yes') -contains $requireValue
$expectedSubject = [string]$env:DSH_WINDOWS_SIGNING_SUBJECT

Test-SignedFile -Path (Resolve-Path -LiteralPath $InstallerPath).Path -Required $releaseSignatureRequested -ExpectedSubject $expectedSubject
if (-not [string]::IsNullOrWhiteSpace($ApplicationPath)) {
  Test-SignedFile -Path (Resolve-Path -LiteralPath $ApplicationPath).Path -Required $releaseSignatureRequested -ExpectedSubject $expectedSubject
}

if ($releaseSignatureRequested) {
  Write-Host '[authenticode] public release gate passed; Authenticode is optional, invalid signatures remain rejected'
} else {
  Write-Host '[authenticode] candidate gate passed; Authenticode is optional, invalid signatures remain rejected'
}
