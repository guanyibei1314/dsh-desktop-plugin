'use strict'

const {
  app,
  BaseWindow,
  BrowserWindow,
  Menu,
  WebContentsView,
  dialog,
  ipcMain,
  shell,
} = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { pathToFileURL } = require('url')

const ASSETS = path.join(__dirname, 'assets')
const ICON = path.join(ASSETS, 'icon.png')
const PLUGIN_HTML = path.join(__dirname, 'plugin-manager.html')
const PLUGIN_PRELOAD = path.join(__dirname, 'plugin-manager-preload.js')
const BROWSER_TOOLBAR_HTML = path.join(__dirname, 'browser-toolbar.html')
const BROWSER_PRELOAD = path.join(__dirname, 'browser-preload.js')
const SITES_HTML = path.join(__dirname, 'sites.html')
const SITES_PRELOAD = path.join(__dirname, 'sites-preload.js')
const WEB_PROFILE = 'web'
const TOOLBAR_HEIGHT = 58

let registered = false
let pluginWindow = null
let pluginProcess = null
let pluginNeedsRestart = false
let browserWindow = null
let browserToolbarView = null
let browserContentView = null
let sitesWindow = null
const siteWindows = new Map()

function physicalNodeModulePath(...parts) {
  const inAsar = path.join(__dirname, 'node_modules', ...parts)
  const unpacked = inAsar.replace(/[\\/]app\.asar[\\/]/, `${path.sep}app.asar.unpacked${path.sep}`)
  if (unpacked !== inAsar && fs.existsSync(unpacked)) return unpacked
  return inAsar
}

function dshBinPath() {
  return physicalNodeModulePath('@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

function pnpmBinPath() {
  return physicalNodeModulePath('pnpm', 'bin', 'pnpm.mjs')
}

function dshHomeDir() {
  return path.join(app.getPath('userData'), 'dsh-home')
}

function runtimeBinDir() {
  return path.join(app.getPath('userData'), 'runtime-bin')
}

function inheritedPath() {
  if (process.env.PATH !== undefined) return process.env.PATH
  if (process.platform !== 'win32') return ''
  const match = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')
  return match ? (match[1] || '') : ''
}

function quoteSh(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function ensureRuntimeShims() {
  const dir = runtimeBinDir()
  fs.mkdirSync(dir, { recursive: true })
  const exe = process.execPath
  const pnpm = pnpmBinPath()
  if (!fs.existsSync(pnpm)) {
    throw new Error('内置 pnpm 运行时缺失，请重新安装 DSH Desktop。')
  }

  if (process.platform === 'win32') {
    const nodeCmd = path.join(dir, 'node.cmd')
    const pnpmCmd = path.join(dir, 'pnpm.cmd')
    fs.writeFileSync(nodeCmd, `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${exe}" %*\r\n`, 'utf8')
    fs.writeFileSync(pnpmCmd, `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${exe}" "${pnpm}" %*\r\n`, 'utf8')
  } else {
    const nodeBin = path.join(dir, 'node')
    const pnpmBin = path.join(dir, 'pnpm')
    fs.writeFileSync(nodeBin, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quoteSh(exe)} "$@"\n`, 'utf8')
    fs.writeFileSync(pnpmBin, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quoteSh(exe)} ${quoteSh(pnpm)} "$@"\n`, 'utf8')
    fs.chmodSync(nodeBin, 0o755)
    fs.chmodSync(pnpmBin, 0o755)
  }
  return dir
}

function pluginEnvironment() {
  const binDir = ensureRuntimeShims()
  const basePath = inheritedPath()
  return Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: '1',
    DSH_HOME: dshHomeDir(),
    DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED || '1',
    CI: 'true',
    PATH: basePath ? `${binDir}${path.delimiter}${basePath}` : binDir,
    npm_config_runtime: 'electron',
    npm_config_target: process.versions.electron || '',
    npm_config_disturl: 'https://electronjs.org/headers',
  })
}

function packageNamePattern() {
  const atom = '[a-z0-9][a-z0-9._-]*'
  return new RegExp(`^(?:@${atom}/${atom}|${atom})$`, 'i')
}

function isPackageName(value) {
  return typeof value === 'string' && value.length <= 214 && packageNamePattern().test(value)
}

function parseInstallSpec(value) {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (input.length === 0 || input.length > 260 || /[\0\r\n&|<>^%!`$;]/.test(input)) return null

  if (input.startsWith('@')) {
    const slash = input.indexOf('/')
    if (slash < 2) return null
    const versionAt = input.indexOf('@', slash)
    const name = versionAt === -1 ? input : input.slice(0, versionAt)
    const version = versionAt === -1 ? '' : input.slice(versionAt + 1)
    if (!isPackageName(name)) return null
    if (version && !isSafeVersion(version)) return null
    return { name, spec: input }
  }

  const versionAt = input.indexOf('@')
  const name = versionAt === -1 ? input : input.slice(0, versionAt)
  const version = versionAt === -1 ? '' : input.slice(versionAt + 1)
  if (!isPackageName(name)) return null
  if (version && !isSafeVersion(version)) return null
  return { name, spec: input }
}

function isSafeVersion(value) {
  return /^(?:latest|next|beta|alpha|rc|canary|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/i.test(value)
}

function pluginArgs(action, rawSpec) {
  if (action === 'list') return ['list', '--depth', '0']
  if (action === 'install') {
    const parsed = parseInstallSpec(rawSpec)
    if (!parsed) throw new Error('仅支持 npm Registry 包名，可选 latest/next/beta/alpha/rc/canary 或精确版本号。')
    return ['add', parsed.spec]
  }
  if (action === 'update') {
    const name = String(rawSpec || '').trim()
    if (!isPackageName(name)) throw new Error('升级时请输入合法的 npm 包名。')
    return ['update', name]
  }
  if (action === 'remove') {
    const name = String(rawSpec || '').trim()
    if (!isPackageName(name)) throw new Error('卸载时请输入合法的 npm 包名。')
    return ['remove', name]
  }
  throw new Error('未知插件操作。')
}

function terminateTree(child) {
  if (!child || child.killed) return
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGTERM')
    }
  } catch (err) {
    // best-effort cancellation
  }
}

function sendPlugin(channel, payload) {
  if (!pluginWindow || pluginWindow.isDestroyed()) return
  pluginWindow.webContents.send(channel, payload)
}

function runPlugin(action, rawSpec) {
  if (pluginProcess) return Promise.reject(new Error('已有插件操作正在执行。'))
  if (!fs.existsSync(dshBinPath())) return Promise.reject(new Error('内置 DSH CLI 缺失，请重新安装。'))
  const args = pluginArgs(action, rawSpec)
  fs.mkdirSync(dshHomeDir(), { recursive: true })

  return new Promise((resolve, reject) => {
    let output = ''
    const child = spawn(
      process.execPath,
      ['--expose-internals', dshBinPath(), 'plugin', '--profile', WEB_PROFILE, ...args],
      {
        cwd: app.getPath('home'),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: pluginEnvironment(),
      },
    )
    pluginProcess = child
    sendPlugin('plugin:state', { running: true, action, needsRestart: pluginNeedsRestart })

    const forward = (stream, data) => {
      const text = String(data)
      output += text
      if (output.length > 100000) output = output.slice(-100000)
      sendPlugin('plugin:output', { stream, text })
    }
    child.stdout.on('data', (data) => forward('stdout', data))
    child.stderr.on('data', (data) => forward('stderr', data))
    child.once('error', (err) => {
      if (pluginProcess === child) pluginProcess = null
      sendPlugin('plugin:state', { running: false, action, needsRestart: pluginNeedsRestart })
      reject(err)
    })
    child.once('exit', (code, signal) => {
      if (pluginProcess === child) pluginProcess = null
      if (code === 0 && action !== 'list') pluginNeedsRestart = true
      sendPlugin('plugin:state', { running: false, action, needsRestart: pluginNeedsRestart })
      const result = { ok: code === 0, code, signal, output, needsRestart: pluginNeedsRestart }
      if (code === 0) resolve(result)
      else reject(Object.assign(new Error(`插件操作失败（退出码 ${code === null ? 'null' : code}）`), { result }))
    })
  })
}

function createLocalWindow(file, preload, options = {}) {
  const localUrl = pathToFileURL(file).href
  const local = new BrowserWindow(Object.assign({
    width: 860,
    height: 680,
    minWidth: 680,
    minHeight: 520,
    show: false,
    backgroundColor: '#0b0f14',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }, options))
  local.webContents.on('will-navigate', (event, url) => {
    if (url !== localUrl) event.preventDefault()
  })
  local.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  local.once('ready-to-show', () => local.show())
  local.loadFile(file).catch((err) => dialog.showErrorBox('DSH Desktop', err.message))
  return local
}

function openPluginManager() {
  if (!app.isReady()) return app.whenReady().then(openPluginManager)
  if (pluginWindow && !pluginWindow.isDestroyed()) {
    pluginWindow.show()
    pluginWindow.focus()
    return
  }
  pluginWindow = createLocalWindow(PLUGIN_HTML, PLUGIN_PRELOAD, {
    title: 'DSH 插件管理',
    width: 900,
    height: 720,
  })
  pluginWindow.on('closed', () => { pluginWindow = null })
}

function normalizeWebUrl(input) {
  let value = String(input || '').trim()
  if (!value) return 'https://www.google.com/'
  if (/\s/.test(value) && !/^https?:\/\//i.test(value)) {
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch (err) {
    return `https://www.google.com/search?q=${encodeURIComponent(String(input || ''))}`
  }
}

function configureRemoteContents(contents, permissionMode = 'deny') {
  const ses = contents.session
  if (permissionMode === 'deny') {
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  }
  contents.setWindowOpenHandler(({ url }) => {
    const safe = normalizeWebUrl(url)
    if (safe) shell.openExternal(safe).catch(() => {})
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return
      event.preventDefault()
      if (['mailto:', 'tel:'].includes(parsed.protocol)) shell.openExternal(url).catch(() => {})
    } catch (err) {
      event.preventDefault()
    }
  })
}

function layoutBrowser() {
  if (!browserWindow || !browserToolbarView || !browserContentView) return
  const bounds = browserWindow.getContentBounds()
  browserToolbarView.setBounds({ x: 0, y: 0, width: bounds.width, height: TOOLBAR_HEIGHT })
  browserContentView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: bounds.width, height: Math.max(1, bounds.height - TOOLBAR_HEIGHT) })
}

function sendBrowserState() {
  if (!browserToolbarView || browserToolbarView.webContents.isDestroyed() || !browserContentView) return
  const contents = browserContentView.webContents
  browserToolbarView.webContents.send('browser:state', {
    url: contents.getURL(),
    title: contents.getTitle(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
  })
}

function navigateBrowser(input) {
  if (!browserContentView) return false
  const url = normalizeWebUrl(input)
  if (!url) return false
  browserContentView.webContents.loadURL(url).catch(() => {})
  return true
}

function openBrowser(initialUrl) {
  if (!app.isReady()) return app.whenReady().then(() => openBrowser(initialUrl))
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.show()
    browserWindow.focus()
    if (initialUrl) navigateBrowser(initialUrl)
    return
  }

  browserWindow = new BaseWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    title: 'DSH Browser',
    icon: ICON,
    backgroundColor: '#0b0f14',
  })
  browserToolbarView = new WebContentsView({
    webPreferences: {
      preload: BROWSER_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  browserContentView = new WebContentsView({
    webPreferences: {
      partition: 'persist:dsh-browser',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  browserWindow.contentView.addChildView(browserToolbarView)
  browserWindow.contentView.addChildView(browserContentView)
  browserWindow.on('resize', layoutBrowser)
  browserWindow.on('closed', () => {
    try { browserToolbarView && browserToolbarView.webContents.close() } catch (err) { /* ignore */ }
    try { browserContentView && browserContentView.webContents.close() } catch (err) { /* ignore */ }
    browserToolbarView = null
    browserContentView = null
    browserWindow = null
  })

  const toolbarUrl = pathToFileURL(BROWSER_TOOLBAR_HTML).href
  browserToolbarView.webContents.on('will-navigate', (event, url) => {
    if (url !== toolbarUrl) event.preventDefault()
  })
  browserToolbarView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  configureRemoteContents(browserContentView.webContents)

  for (const eventName of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) {
    browserContentView.webContents.on(eventName, () => sendBrowserState())
  }
  browserContentView.webContents.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    if (isMainFrame) sendBrowserState()
  })

  layoutBrowser()
  browserToolbarView.webContents.loadFile(BROWSER_TOOLBAR_HTML).catch(() => {})
  navigateBrowser(initialUrl || 'https://www.google.com/')
  browserWindow.show()
}

function sitesFile() {
  return path.join(app.getPath('userData'), 'sites.json')
}

function readSites() {
  try {
    const parsed = JSON.parse(fs.readFileSync(sitesFile(), 'utf8'))
    return Array.isArray(parsed) ? parsed.filter((item) => item && isPackageSafeSite(item)) : []
  } catch (err) {
    return []
  }
}

function isPackageSafeSite(item) {
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.url === 'string' && !!normalizeWebUrl(item.url)
}

function writeSites(items) {
  fs.writeFileSync(sitesFile(), JSON.stringify(items, null, 2), 'utf8')
}

function addSite(name, rawUrl) {
  const url = normalizeWebUrl(rawUrl)
  const cleanName = String(name || '').trim().slice(0, 80)
  if (!url) throw new Error('Site 只支持 http/https 地址。')
  if (!cleanName) throw new Error('请输入 Site 名称。')
  const sites = readSites()
  const item = { id: crypto.randomUUID(), name: cleanName, url, createdAt: new Date().toISOString() }
  sites.push(item)
  writeSites(sites)
  return sites
}

function removeSite(id) {
  const sites = readSites().filter((item) => item.id !== id)
  writeSites(sites)
  const siteWin = siteWindows.get(id)
  if (siteWin && !siteWin.isDestroyed()) siteWin.close()
  siteWindows.delete(id)
  return sites
}

function sitePartition(id) {
  const digest = crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 20)
  return `persist:dsh-site-${digest}`
}

function openSite(id) {
  const site = readSites().find((item) => item.id === id)
  if (!site) throw new Error('Site 不存在。')
  const existing = siteWindows.get(id)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return true
  }
  const siteWin = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 680,
    minHeight: 500,
    title: site.name,
    icon: ICON,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    webPreferences: {
      partition: sitePartition(id),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })
  configureRemoteContents(siteWin.webContents)
  siteWin.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    siteWin.setTitle(site.name)
  })
  siteWin.on('closed', () => siteWindows.delete(id))
  siteWindows.set(id, siteWin)
  siteWin.loadURL(site.url).catch((err) => dialog.showErrorBox(site.name, err.message))
  return true
}

function openSitesManager() {
  if (!app.isReady()) return app.whenReady().then(openSitesManager)
  if (sitesWindow && !sitesWindow.isDestroyed()) {
    sitesWindow.show()
    sitesWindow.focus()
    return
  }
  sitesWindow = createLocalWindow(SITES_HTML, SITES_PRELOAD, {
    title: 'DSH Sites',
    width: 900,
    height: 700,
  })
  sitesWindow.on('closed', () => { sitesWindow = null })
}

function patchMenus() {
  const original = Menu.buildFromTemplate.bind(Menu)
  Menu.buildFromTemplate = function patchedBuildFromTemplate(template) {
    if (!Array.isArray(template)) return original(template)
    const hasAppMenu = template.some((item) => item && item.label === '文件') && template.some((item) => item && item.label === '帮助')
    if (hasAppMenu) {
      const next = template.map((item) => item)
      const tools = {
        label: '工具',
        submenu: [
          { label: '插件管理', accelerator: 'CmdOrCtrl+Shift+P', click: openPluginManager },
          { label: '内置浏览器', accelerator: 'CmdOrCtrl+Shift+B', click: () => openBrowser() },
          { label: 'Sites', accelerator: 'CmdOrCtrl+Shift+S', click: openSitesManager },
        ],
      }
      const viewIndex = next.findIndex((item) => item && item.label === '视图')
      if (viewIndex >= 0) next.splice(viewIndex, 0, tools)
      else next.push(tools)
      return original(next)
    }

    const isTray = template.length > 0 && template[0] && template[0].label === 'DSH Desktop'
    if (isTray) {
      const next = template.map((item) => item)
      const exitIndex = next.findIndex((item) => item && item.label === '退出')
      const insertAt = exitIndex >= 0 ? Math.max(0, exitIndex - 1) : next.length
      next.splice(insertAt, 0,
        { label: '插件管理', click: openPluginManager },
        { label: '内置浏览器', click: () => openBrowser() },
        { label: 'Sites', click: openSitesManager },
      )
      return original(next)
    }
    return original(template)
  }
}

function registerIpc() {
  ipcMain.handle('plugin:list', (event) => {
    if (!pluginWindow || event.sender !== pluginWindow.webContents) throw new Error('unauthorized sender')
    return runPlugin('list', '')
  })
  ipcMain.handle('plugin:run', (event, payload) => {
    if (!pluginWindow || event.sender !== pluginWindow.webContents) throw new Error('unauthorized sender')
    const action = payload && payload.action
    const spec = payload && payload.spec
    return runPlugin(action, spec)
  })
  ipcMain.handle('plugin:cancel', (event) => {
    if (!pluginWindow || event.sender !== pluginWindow.webContents) throw new Error('unauthorized sender')
    if (pluginProcess) terminateTree(pluginProcess)
    return true
  })
  ipcMain.handle('plugin:restart', (event) => {
    if (!pluginWindow || event.sender !== pluginWindow.webContents) throw new Error('unauthorized sender')
    app.relaunch()
    app.exit(0)
    return true
  })
  ipcMain.handle('plugin:status', (event) => {
    if (!pluginWindow || event.sender !== pluginWindow.webContents) throw new Error('unauthorized sender')
    return { running: !!pluginProcess, needsRestart: pluginNeedsRestart, profile: WEB_PROFILE }
  })

  ipcMain.handle('browser:navigate', (event, url) => {
    if (!browserToolbarView || event.sender !== browserToolbarView.webContents) throw new Error('unauthorized sender')
    return navigateBrowser(url)
  })
  ipcMain.handle('browser:back', (event) => {
    if (!browserToolbarView || event.sender !== browserToolbarView.webContents) throw new Error('unauthorized sender')
    if (browserContentView && browserContentView.webContents.navigationHistory.canGoBack()) browserContentView.webContents.navigationHistory.goBack()
    return true
  })
  ipcMain.handle('browser:forward', (event) => {
    if (!browserToolbarView || event.sender !== browserToolbarView.webContents) throw new Error('unauthorized sender')
    if (browserContentView && browserContentView.webContents.navigationHistory.canGoForward()) browserContentView.webContents.navigationHistory.goForward()
    return true
  })
  ipcMain.handle('browser:reload', (event) => {
    if (!browserToolbarView || event.sender !== browserToolbarView.webContents) throw new Error('unauthorized sender')
    if (browserContentView) browserContentView.webContents.reload()
    return true
  })
  ipcMain.handle('browser:home', (event) => {
    if (!browserToolbarView || event.sender !== browserToolbarView.webContents) throw new Error('unauthorized sender')
    return navigateBrowser('https://www.google.com/')
  })
  ipcMain.handle('browser:external', (event) => {
    if (!browserToolbarView || event.sender !== browserToolbarView.webContents) throw new Error('unauthorized sender')
    const url = browserContentView ? normalizeWebUrl(browserContentView.webContents.getURL()) : null
    if (url) shell.openExternal(url).catch(() => {})
    return !!url
  })

  ipcMain.handle('sites:list', (event) => {
    if (!sitesWindow || event.sender !== sitesWindow.webContents) throw new Error('unauthorized sender')
    return readSites()
  })
  ipcMain.handle('sites:add', (event, payload) => {
    if (!sitesWindow || event.sender !== sitesWindow.webContents) throw new Error('unauthorized sender')
    return addSite(payload && payload.name, payload && payload.url)
  })
  ipcMain.handle('sites:remove', (event, id) => {
    if (!sitesWindow || event.sender !== sitesWindow.webContents) throw new Error('unauthorized sender')
    return removeSite(String(id || ''))
  })
  ipcMain.handle('sites:open', (event, id) => {
    if (!sitesWindow || event.sender !== sitesWindow.webContents) throw new Error('unauthorized sender')
    return openSite(String(id || ''))
  })
  ipcMain.handle('sites:browser', (event, id) => {
    if (!sitesWindow || event.sender !== sitesWindow.webContents) throw new Error('unauthorized sender')
    const site = readSites().find((item) => item.id === String(id || ''))
    if (!site) throw new Error('Site 不存在。')
    openBrowser(site.url)
    return true
  })
}

function registerDesktopExtensions() {
  if (registered) return
  registered = true
  patchMenus()
  registerIpc()
  app.on('before-quit', () => {
    if (pluginProcess) terminateTree(pluginProcess)
    for (const siteWin of siteWindows.values()) {
      try { if (!siteWin.isDestroyed()) siteWin.destroy() } catch (err) { /* ignore */ }
    }
  })
}

module.exports = {
  registerDesktopExtensions,
}
