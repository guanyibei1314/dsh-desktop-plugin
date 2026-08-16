'use strict'
/**
 * Least-privilege preload bridge.
 *
 * The main DSH UI is loaded from http://127.0.0.1 (or a user-supplied URL).
 * Remote/web content must never receive desktop IPC capabilities. Privileged
 * bridges are exposed only when Electron is rendering one of our exact local
 * app pages, and each page receives only the API surface it needs.
 */
const { contextBridge, ipcRenderer } = require('electron')
const { pathToFileURL } = require('url')

function appFileUrl(fileName) {
  const sep = process.platform === 'win32' ? '\\' : '/'
  return pathToFileURL(__dirname + sep + fileName).href
}

function isExactLocalPage(fileName) {
  try {
    return location.href === appFileUrl(fileName)
  } catch (err) {
    return false
  }
}

try {
  if (isExactLocalPage('error.html')) {
    contextBridge.exposeInMainWorld('desktopBridge', {
      retry: () => ipcRenderer.send('desktop:retry'),
      quit: () => ipcRenderer.send('desktop:quit'),
    })
  } else if (isExactLocalPage('send-dialog.html')) {
    contextBridge.exposeInMainWorld('desktopBridge', {
      listSessions: () => ipcRenderer.invoke('desktop:listSessions'),
      sendPrompt: (args) => ipcRenderer.invoke('desktop:sendPrompt', args),
      closeSendDialog: () => ipcRenderer.send('desktop:closeSendDialog'),
    })
  } else if (isExactLocalPage('terminal.html')) {
    contextBridge.exposeInMainWorld('terminalBridge', {
      spawn: (cols, rows) => ipcRenderer.invoke('terminal:spawn', { cols, rows }),
      input: (data) => ipcRenderer.send('terminal:input', data),
      resize: (cols, rows) => ipcRenderer.send('terminal:resize', { cols, rows }),
      close: () => ipcRenderer.send('terminal:close'),
      onData: (callback) => { ipcRenderer.on('terminal:data', (event, data) => callback(data)) },
      onExit: (callback) => { ipcRenderer.on('terminal:exit', (event, info) => callback(info)) },
      onError: (callback) => { ipcRenderer.on('terminal:error', (event, message) => callback(message)) },
    })
  }
} catch (err) {
  // Fail closed: if page identity cannot be proven, expose no privileged API.
}
