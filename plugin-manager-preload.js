'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('pluginBridge', {
  catalog: () => ipcRenderer.invoke('plugin:catalog'),
  installed: () => ipcRenderer.invoke('plugin:installed'),
  list: () => ipcRenderer.invoke('plugin:list'),
  run: (action, spec) => ipcRenderer.invoke('plugin:run', { action, spec }),
  cancel: () => ipcRenderer.invoke('plugin:cancel'),
  restart: () => ipcRenderer.invoke('plugin:restart'),
  status: () => ipcRenderer.invoke('plugin:status'),
  onOutput: (callback) => subscribe('plugin:output', callback),
  onState: (callback) => subscribe('plugin:state', callback),
})
