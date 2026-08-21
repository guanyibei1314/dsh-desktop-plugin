!include "LogicLib.nsh"
!include "WinMessages.nsh"

!define DSH_NODE_INSTALLER "node-v24.19.0-x64.msi"
!define DSH_GIT_INSTALLER "Git-2.55.0.5-64-bit.exe"

!macro customInstall
  ; The official full installers are embedded into the DSH NSIS payload at
  ; build time after source, SHA-256 and Authenticode verification. Nothing is
  ; downloaded on the user's machine, so an offline installation still works.
  File /oname=$PLUGINSDIR\${DSH_NODE_INSTALLER} "${BUILD_RESOURCES_DIR}\toolchain\${DSH_NODE_INSTALLER}"
  File /oname=$PLUGINSDIR\${DSH_GIT_INSTALLER} "${BUILD_RESOURCES_DIR}\toolchain\${DSH_GIT_INSTALLER}"

  ReadEnvStr $9 "DSH_TOOLCHAIN_FORCE_INSTALL"

  ; ---------------------------------------------------------------- Node.js
  StrCpy $8 "0"
  ${If} "$9" == "1"
    StrCpy $8 "1"
  ${Else}
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /D /C "node --version >NUL 2>&1"'
    Pop $0
    Pop $1
    ${If} "$0" != "0"
      StrCpy $8 "1"
    ${EndIf}
  ${EndIf}

  ${If} "$8" == "1"
    DetailPrint "Installing full Node.js LTS 24.19.0 and registering Windows PATH..."
    ; Use the official MSI default feature selection: Node runtime, npm/core
    ; components and PATH integration. Do not force ADDLOCAL=ALL because the
    ; optional native-module build-tools flow can pull in Python/Visual Studio.
    ExecWait '"$SYSDIR\msiexec.exe" /i "$PLUGINSDIR\${DSH_NODE_INSTALLER}" /passive /norestart' $0
    ${If} "$0" != "0"
      ${If} "$0" != "3010"
        MessageBox MB_ICONSTOP|MB_OK "Node.js installation failed (exit code $0). DSH Desktop setup has stopped. Resolve the Node.js installer error and run DSH Desktop Setup again."
        Abort
      ${EndIf}
    ${EndIf}
  ${Else}
    DetailPrint "Existing Node.js found on PATH; keeping the user's existing installation."
  ${EndIf}

  ; ---------------------------------------------------------- Git for Windows
  StrCpy $8 "0"
  ${If} "$9" == "1"
    StrCpy $8 "1"
  ${Else}
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /D /C "git --version >NUL 2>&1"'
    Pop $0
    Pop $1
    ${If} "$0" != "0"
      StrCpy $8 "1"
    ${EndIf}
  ${EndIf}

  ${If} "$8" == "1"
    DetailPrint "Installing full Git for Windows 2.55.0(5) and registering Windows PATH..."
    ; PathOption=Cmd is Git for Windows' safe full-install PATH mode: the full
    ; Git package (Git Bash/GUI/LFS/OpenSSH/GCM/etc.) is installed, while only
    ; Git's cmd wrappers enter Windows PATH instead of Unix tools such as
    ; find/sort that could shadow Windows commands.
    ExecWait '"$PLUGINSDIR\${DSH_GIT_INSTALLER}" /SP- /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOCANCEL /o:PathOption=Cmd' $0
    ${If} "$0" != "0"
      MessageBox MB_ICONSTOP|MB_OK "Git for Windows installation failed (exit code $0). DSH Desktop setup has stopped. Resolve the Git installer error and run DSH Desktop Setup again."
      Abort
    ${EndIf}
  ${Else}
    DetailPrint "Existing Git found on PATH; keeping the user's existing installation."
  ${EndIf}

  ; Refresh this installer process from the persisted Machine + User PATH so a
  ; DSH Desktop process launched immediately from the final setup page inherits
  ; the newly installed Node/Git paths. Explorer/other apps are notified too.
  ; NSIS ReadRegStr can read REG_EXPAND_SZ; expand any %SystemRoot%-style
  ; references explicitly before assigning the current process environment.
  SetRegView 64
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
  ReadRegStr $1 HKCU "Environment" "Path"
  ExpandEnvStrings $0 $0
  ExpandEnvStrings $1 $1
  ${If} "$1" == ""
    StrCpy $2 "$0"
  ${ElseIf} "$0" == ""
    StrCpy $2 "$1"
  ${Else}
    StrCpy $2 "$0;$1"
  ${EndIf}
  ${If} "$2" != ""
    System::Call 'Kernel32::SetEnvironmentVariable(t "PATH", t r2)i.r3'
  ${EndIf}
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
