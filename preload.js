'use strict'
/**
 * Preload bridge — used only by the local error page (file://). The remote
 * DSH page (http://127.0.0.1:3080) runs fully sandboxed without this bridge.
 */
const { contextBridge, ipcRenderer } = require('electron')

try {
  contextBridge.exposeInMainWorld('desktopBridge', {
    retry: () => ipcRenderer.send('desktop:retry'),
    quit: () => ipcRenderer.send('desktop:quit'),
  })
} catch (err) {
  // contextBridge unavailable — error page falls back to location.reload()
}
