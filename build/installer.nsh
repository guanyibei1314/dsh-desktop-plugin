!include "LogicLib.nsh"
!include "WinMessages.nsh"

!define DSH_NODE_INSTALLER "node-v24.19.0-x64.msi"
!define DSH_GIT_INSTALLER "Git-2.55.0.3-64-bit.exe"

!macro customInstall
  ; The official full installers are embedded into the DSH NSIS payload at
  ; build time after source, SHA-256 and Authenticode verification.
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
    DetailPrint "Installing full Node.js LTS 24.19.0 and registering PATH..."
    ; Use the official MSI default feature selection: Node runtime, npm/core
    ; components and PATH integration. Do not force ADDLOCAL=ALL because the
    ; optional native-module build-tools flow can pull in Python/Visual Studio.
    ExecWait '"$SYSDIR\msiexec.exe" /i "$PLUGINSDIR\${DSH_NODE_INSTALLER}" /passive /norestart' $0
    ${If} "$0" != "0"
      ${If} "$0" != "3010"
        MessageBox MB_ICONSTOP|MB_OK "Node.js installation failed (exit code $0). DSH Desktop setup will stop so the machine is not left in a partially configured state."
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
    DetailPrint "Installing full Git for Windows 2.55.0(3) and registering Git on PATH..."
    ; PathOption=Cmd is Git for Windows' safe full-install PATH mode: the full
    ; Git package (Git Bash/GUI/LFS/etc.) is installed, while only Git's cmd
    ; wrappers are placed on the Windows PATH instead of Unix tools such as
    ; find/sort that could shadow Windows commands.
    ExecWait '"$PLUGINSDIR\${DSH_GIT_INSTALLER}" /SP- /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOCANCEL /o:PathOption=Cmd' $0
    ${If} "$0" != "0"
      MessageBox MB_ICONSTOP|MB_OK "Git for Windows installation failed (exit code $0). DSH Desktop setup will stop so the machine is not left in a partially configured state."
      Abort
    ${EndIf}
  ${Else}
    DetailPrint "Existing Git found on PATH; keeping the user's existing installation."
  ${EndIf}

  ; Tell already-running desktop processes that machine/user environment data
  ; changed. New terminals will pick up Node/Git without manual PATH editing.
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
