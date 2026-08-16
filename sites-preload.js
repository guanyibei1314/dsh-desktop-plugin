'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sitesBridge', {
  list: () => ipcRenderer.invoke('sites:list'),
  add: (name, url) => ipcRenderer.invoke('sites:add', { name, url }),
  remove: (id) => ipcRenderer.invoke('sites:remove', id),
  open: (id) => ipcRenderer.invoke('sites:open', id),
  openInBrowser: (id) => ipcRenderer.invoke('sites:browser', id),
})
