'use strict'
/**
 * Preload bridge — used by local pages (error.html / send-dialog.html, file://).
 * The remote DSH page (http://127.0.0.1:3080) runs fully sandboxed; the main
 * process validates the sender URL before answering any bridge call.
 */
const { contextBridge, ipcRenderer } = require('electron')

try {
  contextBridge.exposeInMainWorld('desktopBridge', {
    retry: () => ipcRenderer.send('desktop:retry'),
    quit: () => ipcRenderer.send('desktop:quit'),
    listSessions: () => ipcRenderer.invoke('desktop:listSessions'),
    sendPrompt: (args) => ipcRenderer.invoke('desktop:sendPrompt', args),
    closeSendDialog: () => ipcRenderer.send('desktop:closeSendDialog'),
    openTerminal: () => ipcRenderer.send('desktop:openTerminal'),
  })

  // Terminal window bridge — the renderer owns the xterm view, the main process
  // owns the PTY (node-pty). Data flows over IPC in both directions.
  contextBridge.exposeInMainWorld('terminalBridge', {
    spawn: (cols, rows) => ipcRenderer.invoke('terminal:spawn', { cols, rows }),
    input: (data) => ipcRenderer.send('terminal:input', data),
    resize: (cols, rows) => ipcRenderer.send('terminal:resize', { cols, rows }),
    close: () => ipcRenderer.send('terminal:close'),
    onData: (callback) => { ipcRenderer.on('terminal:data', (event, data) => callback(data)) },
    onExit: (callback) => { ipcRenderer.on('terminal:exit', (event, info) => callback(info)) },
    onError: (callback) => { ipcRenderer.on('terminal:error', (event, message) => callback(message)) },
  })
} catch (err) {
  // contextBridge unavailable — error page falls back to location.reload()
}
