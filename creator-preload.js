'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('creatorBridge', {
  status: () => ipcRenderer.invoke('creator:status'),
  state: () => ipcRenderer.invoke('creator:state:get'),
  saveState: (state) => ipcRenderer.invoke('creator:state:save', state),
  pickLibrary: () => ipcRenderer.invoke('creator:library:pick'),
  listContents: () => ipcRenderer.invoke('creator:library:list'),
  createContent: (title, sourceIdeaId = '') => ipcRenderer.invoke('creator:library:create', { title, sourceIdeaId }),
  getContent: (id) => ipcRenderer.invoke('creator:content:get', id),
  writeContent: (id, field, text) => ipcRenderer.invoke('creator:content:write', { id, field, text }),
  openContent: (id) => ipcRenderer.invoke('creator:content:open', id),
  openLibrary: () => ipcRenderer.invoke('creator:library:open'),
  exportBackup: () => ipcRenderer.invoke('creator:backup:export'),
  switchMode: (mode) => ipcRenderer.invoke('creator:switch-mode', mode),
  onHarnessUrl: (callback) => subscribe('creator:harness-url', callback),
  onCommand: (callback) => subscribe('creator:command', callback),
})
