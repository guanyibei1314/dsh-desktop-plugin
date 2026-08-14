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
  })
} catch (err) {
  // contextBridge unavailable — error page falls back to location.reload()
}
