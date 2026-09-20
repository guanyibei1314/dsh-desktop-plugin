'use strict'

const { contextBridge, ipcRenderer } = require('electron')
const { pathToFileURL } = require('url')

function appFileUrl(fileName) {
  const sep = process.platform === 'win32' ? '\\' : '/'
  return pathToFileURL(__dirname + sep + fileName).href
}

const CREATOR_PAGE_URL = appFileUrl('creator.html')

function isExactCreatorPage() {
  try {
    return location.href === CREATOR_PAGE_URL
  } catch (_) {
    return false
  }
}

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

if (isExactCreatorPage()) {
  contextBridge.exposeInMainWorld('creatorBridge', {
    status: () => ipcRenderer.invoke('creator:status'),
    state: () => ipcRenderer.invoke('creator:state:get'),
    saveState: (state) => ipcRenderer.invoke('creator:state:save', state),
    pickLibrary: () => ipcRenderer.invoke('creator:library:pick'),
    listContents: () => ipcRenderer.invoke('creator:library:list'),
    createContent: (title, sourceIdeaId = '') => ipcRenderer.invoke('creator:library:create', { title, sourceIdeaId }),
    assessIdea: (id) => ipcRenderer.invoke('creator:idea:assess', id),
    getContent: (id) => ipcRenderer.invoke('creator:content:get', id),
    writeContent: (id, field, text) => ipcRenderer.invoke('creator:content:write', { id, field, text }),
    openContent: (id) => ipcRenderer.invoke('creator:content:open', id),
    openLibrary: () => ipcRenderer.invoke('creator:library:open'),
    exportBackup: () => ipcRenderer.invoke('creator:backup:export'),
    switchMode: (mode) => ipcRenderer.invoke('creator:switch-mode', mode),
    onHarnessUrl: (callback) => subscribe('creator:harness-url', callback),
    onCommand: (callback) => subscribe('creator:command', callback),
  })
}
