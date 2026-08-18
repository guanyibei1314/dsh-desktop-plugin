'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('runtimeSettings', {
  getStatus: () => ipcRenderer.invoke('runtime-settings:status'),
  save: (patch) => ipcRenderer.invoke('runtime-settings:save', patch),
  checkNow: () => ipcRenderer.invoke('runtime-settings:check'),
  rollback: () => ipcRenderer.invoke('runtime-settings:rollback'),
  restart: () => ipcRenderer.invoke('runtime-settings:restart'),
  openFolder: () => ipcRenderer.invoke('runtime-settings:open-folder'),
})
