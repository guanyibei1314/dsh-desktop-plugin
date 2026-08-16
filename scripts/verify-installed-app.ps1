param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9_-]+$')]
  [string]$Label
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DshWindowProbe {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
'@

function Get-ProcessTreeSnapshot {
  param([int]$RootProcessId)

  $all = @(Get-CimInstance Win32_Process)
  $ids = @($RootProcessId)
  do {
    $before = $ids.Count
    foreach ($proc in $all) {
      $procId = [int]$proc.ProcessId
      $parentId = [int]$proc.ParentProcessId
      if (($ids -contains $parentId) -and ($ids -notcontains $procId)) {
        $ids += $procId
      }
    }
  } while ($ids.Count -gt $before)

  return [PSCustomObject]@{
    Ids = @($ids)
    Processes = @($all | Where-Object { $ids -contains [int]$_.ProcessId })
    AllProcesses = $all
  }
}

function Test-LargeDesktopWindow {
  param([int]$ProcessId)

  try {
    $proc = Get-Process -Id $ProcessId -ErrorAction Stop
    if ($proc.MainWindowHandle -eq 0) { return $false }
    $rect = [DshWindowProbe+RECT]::new()
    if (-not [DshWindowProbe]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)) { return $false }
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    # Splash is 420x320. The real desktop has minWidth 960 / minHeight 600.
    return ($width -ge 900 -and $height -ge 550)
  } catch {
    return $false
  }
}

function Get-DshUserDataRoots {
  $roots = @()
  foreach ($root in @(Get-ChildItem -Path $env:APPDATA -Directory -ErrorAction SilentlyContinue)) {
    if (Test-Path (Join-Path $root.FullName 'dsh-home')) {
      $roots += $root.FullName
    }
  }
  return @($roots | Sort-Object -Unique)
}

function Clear-DshUserData {
  foreach ($root in @(Get-DshUserDataRoots)) {
    Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
  }
  foreach ($candidate in @(
    (Join-Path $env:APPDATA 'dsh-desktop'),
    (Join-Path $env:APPDATA 'DSH Desktop')
  )) {
    if (Test-Path $candidate) {
      Remove-Item $candidate -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Show-AppDiagnostics {
  param(
    [int]$RootProcessId,
    [string]$StdoutFile,
    [string]$StderrFile
  )

  Write-Host "[install-e2e] diagnostics for root PID $RootProcessId"
  try {
    $snapshot = Get-ProcessTreeSnapshot -RootProcessId $RootProcessId
    foreach ($proc in $snapshot.Processes) {
      Write-Host ("[process] pid={0} ppid={1} name={2} cmd={3}" -f $proc.ProcessId, $proc.ParentProcessId, $proc.Name, $proc.CommandLine)
    }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
      $snapshot.Ids -contains [int]$_.OwningProcess
    })
    foreach ($listener in $listeners) {
      Write-Host ("[listener] pid={0} {1}:{2}" -f $listener.OwningProcess, $listener.LocalAddress, $listener.LocalPort)
    }
  } catch {
    Write-Host "[diagnostics] process/listener dump failed: $($_.Exception.Message)"
  }

  foreach ($root in @(Get-DshUserDataRoots)) {
    $log = Join-Path $root 'bundled-web-ui.log'
    if (Test-Path $log) {
      Write-Host "[bundled-web-ui.log] $log"
      Get-Content $log -Tail 80 | ForEach-Object { Write-Host $_ }
    }
  }

  if (Test-Path $StdoutFile) {
    Write-Host '[stdout]'
    Get-Content $StdoutFile -Tail 100 | ForEach-Object { Write-Host $_ }
  }
  if (Test-Path $StderrFile) {
    Write-Host '[stderr]'
    Get-Content $StderrFile -Tail 100 | ForEach-Object { Write-Host $_ }
  }
}

function Assert-BundledSkinProfile {
  param([string]$InstallDir)

  $verified = $false
  $normalizedInstall = $InstallDir.Replace('\', '/')
  foreach ($root in @(Get-DshUserDataRoots)) {
    $profilePackage = Join-Path $root 'dsh-home\profiles\web\package.json'
    if (-not (Test-Path $profilePackage)) { continue }

    $profile = Get-Content $profilePackage -Raw | ConvertFrom-Json
    $dependency = $null
    foreach ($section in @('dependencies', 'optionalDependencies', 'devDependencies')) {
      $obj = $profile.$section
      if ($null -ne $obj -and $obj.PSObject.Properties.Name -contains '@linxin666/dsh-skins') {
        $dependency = [string]$obj.'@linxin666/dsh-skins'
        break
      }
    }

    $bundles = @()
    if ($null -ne $profile.dsh -and $null -ne $profile.dsh.profile) {
      $bundles = @($profile.dsh.profile.bundles)
    }

    if (
      $null -ne $dependency -and
      $dependency -like 'link:*' -and
      $dependency.Replace('\', '/') -like "link:$normalizedInstall/*" -and
      $bundles -contains '@linxin666/dsh-skins'
    ) {
      Write-Host "[install-e2e] bundled skin active from installed local path: $profilePackage"
      $verified = $true
      break
    }
  }

  if (-not $verified) {
    throw 'bundled skin is not active from the installed local path in the web profile'
  }
}

function Test-InstalledPty {
  param(
    [string]$InstalledExe,
    [string]$InstallDir,
    [string]$RunLabel
  )

  $ptyModule = Join-Path $InstallDir 'resources\app.asar.unpacked\node_modules\node-pty'
  if (-not (Test-Path (Join-Path $ptyModule 'package.json'))) {
    throw "[$RunLabel] installed node-pty package missing: $ptyModule"
  }

  $probeFile = Join-Path $env:RUNNER_TEMP "dsh-pty-probe-$RunLabel.js"
  $moduleLiteral = ConvertTo-Json $ptyModule -Compress
  $probeLines = @(
    "const pty = require($moduleLiteral);",
    "const shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';",
    "let output = '';",
    "let done = false;",
    "const child = pty.spawn(shell, ['/d', '/s', '/c', 'echo DSH_PTY_OK'], { name: 'xterm-color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env });",
    "child.onData((data) => { output += data; });",
    "child.onExit(() => { if (done) return; done = true; process.stdout.write(output); process.exit(output.includes('DSH_PTY_OK') ? 0 : 2); });",
    "setTimeout(() => { if (done) return; done = true; process.stderr.write('PTY_TIMEOUT\\n' + output); try { child.kill(); } catch {} process.exit(3); }, 10000);"
  )
  Set-Content -Path $probeFile -Value $probeLines -Encoding UTF8

  $oldElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE
  $exitCode = $null
  try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    # DSH Desktop.exe is a GUI-subsystem executable. Direct invocation from
    # PowerShell may return before its Node-mode child has consumed probeFile,
    # so explicitly wait for the process before deleting the probe.
    $probeProcess = Start-Process -FilePath $InstalledExe -ArgumentList @("`"$probeFile`"") -PassThru -Wait
    $exitCode = $probeProcess.ExitCode
  } finally {
    if ($null -eq $oldElectronRunAsNode) {
      Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    } else {
      $env:ELECTRON_RUN_AS_NODE = $oldElectronRunAsNode
    }
    Remove-Item $probeFile -Force -ErrorAction SilentlyContinue
  }

  if ($exitCode -ne 0) {
    throw "[$RunLabel] installed node-pty probe failed with exit code $exitCode"
  }
  Write-Host "[install-e2e] [$RunLabel] installed node-pty spawned cmd.exe successfully"
}

function Wait-NormalAppReady {
  param(
    [string]$InstalledExe,
    [string]$InstallDir,
    [string]$RunLabel,
    [int]$Attempt
  )

  $stdout = Join-Path $env:RUNNER_TEMP "dsh-$RunLabel-$Attempt.stdout.log"
  $stderr = Join-Path $env:RUNNER_TEMP "dsh-$RunLabel-$Attempt.stderr.log"
  Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue

  $desktop = Start-Process -FilePath $InstalledExe -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $deadline = (Get-Date).AddSeconds(120)
  $windowReady = $false
  $dshReady = $false
  $dshSeen = $false
  $dshPort = $null

  try {
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 2
      $desktop.Refresh()
      if ($desktop.HasExited) {
        throw "[$RunLabel run $Attempt] installed DSH Desktop exited during normal startup with code $($desktop.ExitCode)"
      }

      $snapshot = Get-ProcessTreeSnapshot -RootProcessId $desktop.Id
      $installRegex = [regex]::Escape($InstallDir)
      $dshProcesses = @($snapshot.AllProcesses | Where-Object {
        $null -ne $_.CommandLine -and
        $_.CommandLine -match $installRegex -and
        $_.CommandLine -match '@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js'
      })
      if ($dshProcesses.Count -gt 0) { $dshSeen = $true }

      $candidatePorts = @()
      foreach ($dshProcess in $dshProcesses) {
        if ($dshProcess.CommandLine -match '--port(?:=|\s+)["'']?(\d+)') {
          $candidatePorts += [int]$Matches[1]
        }
      }

      $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
        $snapshot.Ids -contains [int]$_.OwningProcess
      })
      foreach ($listener in $listeners) {
        $candidatePorts += [int]$listener.LocalPort
      }
      $candidatePorts = @($candidatePorts | Sort-Object -Unique)

      foreach ($port in $candidatePorts) {
        try {
          $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 3
          if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
            $dshReady = $true
            $dshPort = $port
            break
          }
        } catch {
          # Non-HTTP listener or DSH still warming up.
        }
      }

      if ($dshReady) {
        # Reject the 420x320 splash. Only a 960x600-class desktop counts.
        $windowReady = Test-LargeDesktopWindow -ProcessId $desktop.Id
      }

      if ($dshSeen -and $dshReady -and $windowReady) { break }
    }

    if (-not ($dshSeen -and $dshReady -and $windowReady)) {
      Show-AppDiagnostics -RootProcessId $desktop.Id -StdoutFile $stdout -StderrFile $stderr
      throw "[$RunLabel run $Attempt] readiness failed: dshSeen=$dshSeen dshReady=$dshReady windowReady=$windowReady port=$dshPort"
    }

    Write-Host "[install-e2e] [$RunLabel run $Attempt] bundled DSH reachable on 127.0.0.1:$dshPort"
    Write-Host "[install-e2e] [$RunLabel run $Attempt] real 960x600-class desktop window detected"
    return $desktop
  } catch {
    if ($null -ne $desktop -and -not $desktop.HasExited) {
      & taskkill /PID $desktop.Id /T /F | Out-Host
    }
    throw
  }
}

function Stop-AppTree {
  param($DesktopProcess)

  if ($null -ne $DesktopProcess) {
    try { $DesktopProcess.Refresh() } catch { }
    if (-not $DesktopProcess.HasExited) {
      & taskkill /PID $DesktopProcess.Id /T /F | Out-Host
    }
  }
  Start-Sleep -Seconds 2
}

if (-not (Test-Path $InstallerPath)) {
  throw "[$Label] installer not found: $InstallerPath"
}
$InstallerPath = (Resolve-Path $InstallerPath).Path
$installDir = Join-Path $env:RUNNER_TEMP "dsh-desktop-$Label"
if (Test-Path $installDir) {
  Remove-Item $installDir -Recurse -Force
}
Clear-DshUserData

Write-Host "[install-e2e] [$Label] installing $InstallerPath -> $installDir"
$install = Start-Process -FilePath $InstallerPath -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
if ($install.ExitCode -ne 0) {
  throw "[$Label] NSIS silent install failed with exit code $($install.ExitCode)"
}

$installedExe = Join-Path $installDir 'DSH Desktop.exe'
if (-not (Test-Path $installedExe)) {
  throw "[$Label] installed executable not found: $installedExe"
}
Write-Host "[install-e2e] [$Label] installed executable exists"

Test-InstalledPty -InstalledExe $installedExe -InstallDir $installDir -RunLabel $Label

$first = $null
$second = $null
try {
  # Cold first-run: no userData, bundled skin reconciliation + bundled DSH boot.
  $first = Wait-NormalAppReady -InstalledExe $installedExe -InstallDir $installDir -RunLabel $Label -Attempt 1
  Assert-BundledSkinProfile -InstallDir $installDir
  Stop-AppTree -DesktopProcess $first
  $first = $null

  # Warm restart: persisted profile must remain valid and app must reopen.
  $second = Wait-NormalAppReady -InstalledExe $installedExe -InstallDir $installDir -RunLabel $Label -Attempt 2
  Assert-BundledSkinProfile -InstallDir $installDir
  Stop-AppTree -DesktopProcess $second
  $second = $null
} finally {
  Stop-AppTree -DesktopProcess $first
  Stop-AppTree -DesktopProcess $second
}

$uninstaller = Get-ChildItem -Path $installDir -Filter 'Uninstall*.exe' -File | Select-Object -First 1
if ($null -eq $uninstaller) {
  throw "[$Label] NSIS uninstaller not found after installation"
}
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
if ($uninstall.ExitCode -ne 0) {
  throw "[$Label] NSIS silent uninstall failed with exit code $($uninstall.ExitCode)"
}
Start-Sleep -Seconds 2
if (Test-Path $installedExe) {
  throw "[$Label] installed executable still exists after silent uninstall"
}
Write-Host "[install-e2e] [$Label] silent uninstall succeeded"
