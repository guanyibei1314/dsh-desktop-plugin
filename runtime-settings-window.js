'use strict'

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const runtimeControl = require('./runtime-control')

const ASSETS = path.join(__dirname, 'assets')
const HTML = path.join(__dirname, 'runtime-settings.html')
const PRELOAD = path.join(__dirname, 'runtime-settings-preload.js')

let registered = false
let runtimeWindow = null

function assertSender(event) {
  if (!runtimeWindow || runtimeWindow.isDestroyed() || event.sender !== runtimeWindow.webContents) {
    throw new Error('unauthorized sender')
  }
}

function openRuntimeSettings() {
  if (!app.isReady()) return app.whenReady().then(openRuntimeSettings)
  if (runtimeWindow && !runtimeWindow.isDestroyed()) {
    runtimeWindow.show()
    runtimeWindow.focus()
    return
  }
  const localUrl = pathToFileURL(HTML).href
  runtimeWindow = new BrowserWindow({
    width: 820,
    height: 720,
    minWidth: 720,
    minHeight: 600,
    show: false,
    title: 'DSH Runtime 更新',
    backgroundColor: '#0b0f14',
    icon: path.join(ASSETS, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  runtimeWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== localUrl) event.preventDefault()
  })
  runtimeWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  runtimeWindow.once('ready-to-show', () => runtimeWindow && runtimeWindow.show())
  runtimeWindow.on('closed', () => { runtimeWindow = null })
  runtimeWindow.loadFile(HTML).catch((err) => dialog.showErrorBox('DSH Runtime 更新', err.message))
}

function patchMenus() {
  const original = Menu.buildFromTemplate.bind(Menu)
  Menu.buildFromTemplate = function patchedRuntimeMenu(template) {
    if (!Array.isArray(template)) return original(template)
    const next = template.map((item) => item && typeof item === 'object' ? Object.assign({}, item) : item)
    const isAppMenu = next.some((item) => item && item.label === '文件') && next.some((item) => item && item.label === '帮助')
    if (isAppMenu) {
      const options = next.find((item) => item && item.label === '选项' && Array.isArray(item.submenu))
      if (options) {
        options.submenu = options.submenu.slice()
        if (!options.submenu.some((item) => item && item.label === 'DSH Runtime 更新')) {
          options.submenu.push({ type: 'separator' })
          options.submenu.push({ label: 'DSH Runtime 更新', click: openRuntimeSettings })
        }
      }
    }
    const isTray = next.length > 0 && next[0] && next[0].label === 'DSH Desktop'
    if (isTray && !next.some((item) => item && item.label === 'Runtime 更新')) {
      const exitIndex = next.findIndex((item) => item && item.label === '退出')
      const insertAt = exitIndex >= 0 ? Math.max(1, exitIndex) : next.length
      next.splice(insertAt, 0, { label: 'Runtime 更新', click: openRuntimeSettings })
    }
    return original(next)
  }
}

function registerIpc() {
  ipcMain.handle('runtime-settings:status', (event) => {
    assertSender(event)
    return runtimeControl.getStatus()
  })
  ipcMain.handle('runtime-settings:save', (event, patch) => {
    assertSender(event)
    return runtimeControl.saveSettings(patch || {})
  })
  ipcMain.handle('runtime-settings:check', async (event) => {
    assertSender(event)
    const result = await runtimeControl.checkNow()
    return { result, status: runtimeControl.getStatus() }
  })
  ipcMain.handle('runtime-settings:rollback', (event) => {
    assertSender(event)
    const result = runtimeControl.requestRollback()
    return { result, status: runtimeControl.getStatus() }
  })
  ipcMain.handle('runtime-settings:restart', (event) => {
    assertSender(event)
    app.relaunch()
    app.exit(0)
    return true
  })
  ipcMain.handle('runtime-settings:open-folder', (event) => {
    assertSender(event)
    return shell.openPath(runtimeControl.getStatus().runtimeRoot)
  })
}

function registerRuntimeSettings() {
  if (registered) return
  registered = true
  patchMenus()
  registerIpc()
}

module.exports = {
  openRuntimeSettings,
  registerRuntimeSettings,
}
