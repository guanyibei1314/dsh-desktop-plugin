'use strict'
/**
 * DSH Desktop — codex 桌面端风格的 DeepSeek Harness 原生客户端。
 *
 * 零配置：原生窗口加载运行中的 DSH Web 客户端（默认 http://127.0.0.1:3080）；
 * 若本机没有 DSH 服务，则自动启动打包内置的 DeepSeek Harness（Electron 自带
 * Node 运行时，用户无需安装 Node 或执行任何命令）。打包一条命令：npm run dist。
 *
 * 桌面集成：
 *   - 原生菜单（会话列表 / 主题 / 选项 / 视图 / 帮助）
 *   - 托盘图标（运行状态 + 快速发消息）
 *   - 回合完成 / 代理错误系统通知（点击聚焦窗口；可开关）
 *   - 会话运行中阻止系统休眠；任务完成时窗口闪烁
 *   - 窗口位置/大小记忆；开机自启；全局快捷键 Ctrl+Alt+D
 *   - 关窗隐藏到托盘；服务未启动时显示重试页
 *
 * 高级选项（可选，非必需）：环境变量 DSH_URL 或命令行 --url= 覆盖服务地址。
 */
const { app, BrowserWindow, Menu, Tray, nativeImage, Notification, dialog, shell, ipcMain, clipboard, powerSaveBlocker, globalShortcut, screen } = require('electron')
const fs = require('fs')
const path = require('path')
const net = require('net')
const { spawn } = require('child_process')

const ARG_URL = (() => {
  const hit = process.argv.find((a) => a.startsWith('--url='))
  return hit ? hit.slice(6) : null
})()
const HARNESS_URL = (process.env.DSH_URL || ARG_URL || 'http://127.0.0.1:3080').replace(/\/+$/, '')
const SMOKE = process.argv.includes('--smoke')

// ---------------------------------------------------------------- bundled DeepSeek Harness runtime
// 零配置的核心：优先连接本机已有服务（兼容现状）；没有则用 Electron 自带的
// Node 运行时启动打包内置的 DSH CLI（无需用户安装 Node / 执行命令）。
let dshProc = null       // 内置 DSH 子进程
let activeUrl = HARNESS_URL // 实际连接的 Harness URL（内置启动后可能变化）

const ASSETS = path.join(__dirname, 'assets')
const PRELOAD = path.join(__dirname, 'preload.js')
const ERROR_HTML = path.join(__dirname, 'error.html')
const SEND_DIALOG_HTML = path.join(__dirname, 'send-dialog.html')
const SPLASH_HTML = path.join(__dirname, 'splash.html')
const TERMINAL_HTML = path.join(__dirname, 'terminal.html')

let win = null
let splash = null
let sendDialog = null
let termWin = null
let tray = null
let quitting = false
let connected = false
let themePref = 'system'
let notificationsEnabled = true
let launchAtLogin = false
let shortcutEnabled = true
let sseTimer = null
let menuRebuildTimer = null
let powerBlockerId = null
const lastNotifyAt = new Map() // sessionId -> timestamp (debounce)
const sessionCache = new Map() // sessionId -> { cwd, running, blank, updatedAt }

// ---------------------------------------------------------------- local settings (zero-config: all optional, defaults work out of the box)
function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
  } catch (err) {
    return {}
  }
}

function saveSettings(patch) {
  try {
    const next = Object.assign(loadSettings(), patch)
    fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
  } catch (err) {
    // settings persistence is best-effort
  }
}

function applySettings() {
  const s = loadSettings()
  if (typeof s.notificationsEnabled === 'boolean') notificationsEnabled = s.notificationsEnabled
  if (typeof s.launchAtLogin === 'boolean') launchAtLogin = s.launchAtLogin
  if (typeof s.shortcutEnabled === 'boolean') shortcutEnabled = s.shortcutEnabled
  if (s.themePref && typeof s.themePref === 'string') themePref = s.themePref
  if (launchAtLogin) app.setLoginItemSettings({ openAtLogin: true })
  applyShortcut()
}

function applyShortcut() {
  if (SMOKE) return
  if (shortcutEnabled) {
    try {
      if (!globalShortcut.isRegistered('CommandOrControl+Alt+D')) {
        globalShortcut.register('CommandOrControl+Alt+D', () => {
          if (win === null || win.isDestroyed()) showWindow()
          else if (win.isFocused()) win.hide()
          else showWindow()
        })
      }
    } catch (err) {
      // shortcut registration failed — ignore
    }
  } else if (globalShortcut.isRegistered('CommandOrControl+Alt+D')) {
    globalShortcut.unregister('CommandOrControl+Alt+D')
  }
}

function rememberedBounds() {
  const s = loadSettings()
  if (!s.windowBounds) return null
  const b = s.windowBounds
  if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.width !== 'number' || typeof b.height !== 'number') return null
  const onScreen = screen.getAllDisplays().some((d) => {
    const area = d.workArea
    return b.x < area.x + area.width && b.x + b.width > area.x && b.y < area.y + area.height && b.y + b.height > area.y
  })
  return onScreen ? b : null
}

// ---------------------------------------------------------------- bundled DeepSeek Harness runtime
/**
 * 打包内置的 DSH CLI 入口。
 * 打包后 node_modules 被 asarUnpack 到 app.asar.unpacked（真实目录），DSH 的
 * profile module-fallback 会在这些包上创建 junction 链接，必须使用真实路径，
 * 因此 asar 内的路径要重写到 unpacked 位置。
 */
function dshBinPath() {
  const inAsar = path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const unpacked = inAsar.replace(/[\\/]app\.asar[\\/]/, '\\app.asar.unpacked\\')
  if (unpacked !== inAsar && fs.existsSync(unpacked)) return unpacked
  return inAsar
}

function hasBundledDsh() {
  try { return fs.existsSync(dshBinPath()) } catch (err) { return false }
}

/** 内置 DSH 的独立数据目录，不污染用户自己的 ~/.dsh。 */
function dshHomeDir() {
  return path.join(app.getPath('userData'), 'dsh-home')
}

/** 探测一个 Harness URL 是否可用。 */
async function probeUrl(url, timeoutMs = 2500) {
  try {
    const res = await fetch(url + '/', { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch (err) {
    return false
  }
}

/** 申请一个空闲的 loopback 端口。 */
function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 启动打包内置的 DSH web 服务，返回就绪后的实际 URL。 */
async function startBundledDsh() {
  if (dshProc !== null && activeUrl !== HARNESS_URL) return activeUrl
  if (!hasBundledDsh()) throw new Error('内置 DeepSeek Harness 缺失（node_modules/@deepseek-ai/dsh）')
  const port = await pickPort()
  const home = dshHomeDir()
  try { fs.mkdirSync(home, { recursive: true }) } catch (err) { /* ignore */ }
  const captured = []
  const child = spawn(
    process.execPath,
    ['--expose-internals', dshBinPath(), 'web', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: home,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: home,
        DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED || '1',
      }),
    },
  )
  dshProc = child
  child.on('error', (err) => { captured.push('spawn error: ' + err.message) })
  child.stdout.on('data', (d) => { captured.push(String(d)); if (captured.length > 40) captured.shift() })
  child.stderr.on('data', (d) => { captured.push(String(d)); if (captured.length > 40) captured.shift() })
  child.on('exit', () => { if (dshProc === child) { dshProc = null; activeUrl = HARNESS_URL } })

  const url = 'http://127.0.0.1:' + port
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (await probeUrl(url, 1000)) {
      activeUrl = url
      return url
    }
    if (dshProc === null) break // 子进程提前退出
    await delay(1000)
  }
  stopBundledDsh()
  throw new Error('内置 DeepSeek Harness 启动超时：' + captured.join('').slice(-2000))
}

/** 停止内置 DSH 子进程树。 */
function stopBundledDsh() {
  const child = dshProc
  dshProc = null
  if (child === null) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGTERM')
    }
  } catch (err) { /* ignore */ }
}

/**
 * 决定实际连接的 Harness URL：
 * 1. 用户显式指定 --url / DSH_URL：只连它，失败就报错页（尊重用户意图）。
 * 2. 默认：先探测 3080（本机已有服务则直接复用）；
 * 3. 没有则启动打包内置的 DSH 并等待就绪。
 * @returns 就绪的 URL；null 表示不可用（走错误页）。
 */
async function ensureHarness() {
  if (process.env.DSH_URL || ARG_URL) {
    return (await probeUrl(HARNESS_URL)) ? HARNESS_URL : null
  }
  if (await probeUrl(HARNESS_URL)) {
    activeUrl = HARNESS_URL
    return HARNESS_URL
  }
  // 冒烟测试保持快速失败，不启动内置 DSH（冷启动很慢）。
  if (SMOKE) return null
  if (!hasBundledDsh()) return null
  try {
    return await startBundledDsh()
  } catch (err) {
    process.stderr.write(String(err && err.message || err) + '\n')
    return null
  }
}

// ---------------------------------------------------------------- RPC
async function rpc(method, payload = {}) {
  const res = await fetch(activeUrl + '/api/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'dshd-' + Math.random().toString(36).slice(2, 10),
      method,
      payload,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const body = await res.json()
  const result = body && body.result
  if (!result || result.ok !== true) {
    const err = result && result.error
    throw new Error(err ? (err.message || err.code || 'rpc failed') : 'rpc failed')
  }
  return result.value
}

// ---------------------------------------------------------------- sessions / tray
async function refreshSessions() {
  try {
    const value = await rpc('session.list', {})
    const items = value && Array.isArray(value.items) ? value.items : []
    const next = new Map()
    for (const it of items) {
      const prev = sessionCache.get(it.sessionId)
      next.set(it.sessionId, {
        cwd: it.cwd || (prev && prev.cwd),
        running: !!it.running,
        blank: !!it.blank,
        updatedAt: it.updatedAt,
      })
    }
    sessionCache.clear()
    for (const [k, v] of next) sessionCache.set(k, v)
    connected = true
  } catch (err) {
    connected = false
  }
  updateTray()
  setWindowTitle()
  scheduleMenuRebuild()
}

function runningCount() {
  let n = 0
  for (const s of sessionCache.values()) if (s.running) n++
  return n
}

function updatePowerSave() {
  if (SMOKE) return
  const n = runningCount()
  if (n > 0 && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  } else if (n === 0 && powerBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerBlockerId)) powerSaveBlocker.stop(powerBlockerId)
    powerBlockerId = null
  }
}

function setWindowTitle() {
  if (win === null || win.isDestroyed()) return
  const n = runningCount()
  const suffix = !connected ? '（未连接）' : n > 0 ? '（' + n + ' 个会话运行中）' : ''
  win.setTitle('DSH Desktop' + suffix)
}

function updateTray() {
  if (tray === null || tray.isDestroyed()) return
  const n = runningCount()
  const status = !connected ? '未连接' : n > 0 ? n + ' 个会话运行中' : '空闲'
  tray.setToolTip('DSH Desktop — ' + status)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'DSH Desktop', enabled: false },
    { type: 'separator' },
    { label: '显示窗口', click: showWindow },
    { label: '发送消息…', click: openSendDialog },
    { label: '打开终端', click: openTerminal },
    { label: status, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ]))
}

function notifyTurnDone(sessionId, cwd) {
  if (!notificationsEnabled || !Notification.isSupported()) return
  const now = Date.now()
  const last = lastNotifyAt.get(sessionId) || 0
  if (now - last < 10000) return
  lastNotifyAt.set(sessionId, now)
  const base = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() : ''
  const n = new Notification({
    title: 'DSH · 任务完成',
    body: '会话 ' + String(sessionId).slice(0, 8) + (base ? '（' + base + '）' : '') + ' 已结束运行',
  })
  n.on('click', () => showWindow())
  n.show()
  if (win !== null && !win.isDestroyed() && !win.isFocused()) {
    win.flashFrame(true)
  }
}

// ---------------------------------------------------------------- SSE host stream
function connectEvents() {
  const controller = new AbortController()
  const run = async () => {
    try {
      const res = await fetch(activeUrl + '/api/events.host', { signal: controller.signal })
      if (!res.ok || !res.body) throw new Error('SSE HTTP ' + (res && res.status))
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, i)
          buf = buf.slice(i + 2)
          for (const line of block.split('\n')) {
            const data = line.startsWith('data:') ? line.slice(5).trim() : ''
            if (data === '') continue
            try { handleFrame(JSON.parse(data)) } catch (e) { /* non-frame comment or malformed */ }
          }
        }
      }
    } catch (err) {
      // stream closed or aborted — reconnect below
    } finally {
      if (!quitting && !SMOKE) sseTimer = setTimeout(connectEvents, 3000)
    }
  }
  run()
}

function handleFrame(frame) {
  if (!frame || typeof frame !== 'object') return
  const payload = frame.payload && typeof frame.payload === 'object' ? frame.payload : frame
  switch (payload.type) {
    case 'host/session-status': {
      const id = payload.sessionId
      const prev = sessionCache.get(id)
      const was = !!(prev && prev.running)
      const now = !!payload.running
      sessionCache.set(id, { cwd: prev ? prev.cwd : undefined, running: now, blank: false })
      updateTray()
      setWindowTitle()
      updatePowerSave()
      scheduleMenuRebuild()
      if (was && !now) notifyTurnDone(id, prev && prev.cwd)
      break
    }
    case 'host/session-added': {
      sessionCache.set(payload.sessionId, { cwd: payload.cwd, running: false, blank: !!payload.blank })
      updateTray()
      scheduleMenuRebuild()
      break
    }
    case 'host/session-removed': {
      sessionCache.delete(payload.sessionId)
      updateTray()
      setWindowTitle()
      updatePowerSave()
      scheduleMenuRebuild()
      break
    }
    case 'host/agent-error': {
      if (notificationsEnabled && Notification.isSupported()) {
        const n = new Notification({
          title: 'DSH · 代理出错',
          body: String(payload.message || '未知错误').slice(0, 240),
        })
        n.on('click', () => showWindow())
        n.show()
      }
      break
    }
    default:
      break
  }
}

// ---------------------------------------------------------------- theme (native menu -> harness settings)
async function setTheme(pref) {
  try {
    await rpc('settings.update', { ns: 'ui-theme', patch: { preference: pref } })
    themePref = pref
    saveSettings({ themePref })
    rebuildMenu()
  } catch (err) {
    dialog.showErrorBox('DSH Desktop', '主题切换失败：' + err.message)
  }
}

async function loadThemePref() {
  try {
    const value = await rpc('settings.describe', {})
    const namespaces = value && Array.isArray(value.namespaces) ? value.namespaces : []
    const ns = namespaces.find((n) => n.ns === 'ui-theme')
    if (ns && ns.value && typeof ns.value.preference === 'string') {
      themePref = ns.value.preference
      saveSettings({ themePref })
      rebuildMenu()
    }
  } catch (err) {
    // harness not reachable yet — keep defaults
  }
}

// ---------------------------------------------------------------- menu
function scheduleMenuRebuild() {
  if (menuRebuildTimer !== null) return
  menuRebuildTimer = setTimeout(() => {
    menuRebuildTimer = null
    if (!quitting) rebuildMenu()
  }, 1500)
}

function sessionLabel(sessionId, info) {
  const base = info && info.cwd ? info.cwd.split(/[\\/]/).filter(Boolean).pop() : ''
  const short = String(sessionId).slice(0, 8)
  return (info && info.running ? '● ' : '○ ') + (base || short) + (base ? '  (' + short + ')' : '')
}

function sessionMenuItems() {
  const items = []
  if (sessionCache.size === 0) {
    items.push({ label: connected ? '（暂无会话）' : '（未连接）', enabled: false })
  } else {
    for (const [id, info] of sessionCache) {
      const actions = []
      if (info && info.cwd) {
        actions.push({
          label: '打开工作目录',
          click: () => {
            rpc('host.openPath', { path: info.cwd }).catch((err) =>
              dialog.showErrorBox('DSH Desktop', '无法打开目录：' + err.message))
          },
        })
      }
      actions.push({
        label: '复制会话 ID',
        click: () => clipboard.writeText(String(id)),
      })
      items.push({ label: sessionLabel(id, info), submenu: actions })
    }
  }
  items.push({ type: 'separator' })
  items.push({ label: '刷新列表', click: () => { refreshSessions(); rebuildMenu() } })
  return items
}

function themeItems() {
  return [
    { label: '跟随系统', type: 'radio', checked: themePref === 'system', click: () => setTheme('system') },
    { label: '亮色', type: 'radio', checked: themePref === 'light', click: () => setTheme('light') },
    { label: '暗色', type: 'radio', checked: themePref === 'dark', click: () => setTheme('dark') },
  ]
}

function optionItems() {
  return [
    {
      label: '开机自启',
      type: 'checkbox',
      checked: launchAtLogin,
      click: (item) => {
        launchAtLogin = item.checked
        saveSettings({ launchAtLogin })
        app.setLoginItemSettings({ openAtLogin: launchAtLogin })
      },
    },
    {
      label: '完成通知',
      type: 'checkbox',
      checked: notificationsEnabled,
      click: (item) => {
        notificationsEnabled = item.checked
        saveSettings({ notificationsEnabled })
      },
    },
    {
      label: '全局快捷键 Ctrl+Alt+D 显示/隐藏窗口',
      type: 'checkbox',
      checked: shortcutEnabled,
      click: (item) => {
        shortcutEnabled = item.checked
        saveSettings({ shortcutEnabled })
        applyShortcut()
      },
    },
    { type: 'separator' },
    {
      label: '重置窗口布局',
      click: () => {
        saveSettings({ windowBounds: null })
        if (win !== null && !win.isDestroyed()) {
          win.setBounds({ x: 120, y: 80, width: 1320, height: 860 })
        }
      },
    },
  ]
}

function buildMenu() {
  const zoom = () => (win ? win.webContents.getZoomLevel() : 0)
  return Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => win && win.webContents.reload() },
        { label: '打开终端', accelerator: 'CmdOrCtrl+Shift+T', click: openTerminal },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit() } },
      ],
    },
    { label: '会话', submenu: sessionMenuItems() },
    { label: '主题', submenu: themeItems() },
    { label: '选项', submenu: optionItems() },
    {
      label: '视图',
      submenu: [
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: () => win && win.webContents.setZoomLevel(0) },
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => win && win.webContents.setZoomLevel(zoom() + 0.5) },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => win && win.webContents.setZoomLevel(zoom() - 0.5) },
        { type: 'separator' },
        { label: '切换开发者工具', accelerator: 'F12', click: () => win && win.webContents.toggleDevTools() },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', click: () => win && win.minimize() },
        { label: '关闭到托盘', click: () => win && win.hide() },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开设置文档',
          click: () => {
            rpc('settings.openDocument', {}).catch((err) =>
              dialog.showErrorBox('DSH Desktop', '无法打开设置文档：' + err.message))
          },
        },
        { label: '在浏览器中打开 DSH', click: () => shell.openExternal(activeUrl) },
        { type: 'separator' },
        {
          label: '关于 DSH Desktop',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: '关于',
            message: 'DSH Desktop ' + app.getVersion(),
            detail: 'DeepSeek Harness 桌面客户端\n连接：' + activeUrl + '\n零配置，开箱即用',
          }),
        },
      ],
    },
  ])
}

function rebuildMenu() {
  Menu.setApplicationMenu(buildMenu())
}

// ---------------------------------------------------------------- window
async function loadMain() {
  if (!win) return
  let url = HARNESS_URL
  try {
    url = await ensureHarness()
  } catch (err) {
    loadErrorPage()
    return
  }
  if (url === null) {
    loadErrorPage()
    return
  }
  win.loadURL(url).catch(() => loadErrorPage())
}

function loadErrorPage() {
  if (!win) return
  win.loadFile(ERROR_HTML).catch(() => {})
}

// ---------------------------------------------------------------- splash
/**
 * Show a lightweight startup window before the DSH web client is ready.
 *
 * The main window stays hidden until the remote client renders its first
 * frame, which can take a long time for profiles with many plugins. The
 * splash decouples perceived startup latency from the plugin count.
 */
function createSplash() {
  if (splash !== null && !splash.isDestroyed()) return
  splash = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: true,
    backgroundColor: '#0d1117',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  splash.on('closed', () => { splash = null })
  splash.loadFile(SPLASH_HTML).catch(() => {})
}

/** Dismiss the startup splash once the real shell has a first frame. */
function dismissSplash() {
  if (splash !== null && !splash.isDestroyed()) splash.destroy()
  splash = null
}

function showWindow() {
  if (win === null) createWindow()
  else {
    win.show()
    win.focus()
  }
}

function createWindow() {
  const bounds = rememberedBounds()
  const winOptions = {
    minWidth: 960,
    minHeight: 600,
    title: 'DSH Desktop',
    backgroundColor: '#0d1117',
    icon: path.join(ASSETS, 'icon.png'),
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
  if (bounds !== null) {
    Object.assign(winOptions, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
  } else {
    Object.assign(winOptions, { width: 1320, height: 860 })
  }
  win = new BrowserWindow(winOptions)
  win.once('ready-to-show', () => {
    dismissSplash()
    if (!SMOKE) win.show()
  })
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => { win = null })
  win.on('focus', () => win.flashFrame(false))
  win.on('page-title-updated', (e) => e.preventDefault())
  win.on('resize', () => rememberBounds())
  win.on('move', () => rememberBounds())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-fail-load', (e, code, desc) => {
    if (code === -3) return // ERR_ABORTED (navigation superseded)
    if (SMOKE) {
      console.error('SMOKE_FAIL', code, desc)
      app.exit(1)
      return
    }
    dismissSplash()
    loadErrorPage()
    if (!win.isVisible()) win.show()
  })
  win.webContents.on('did-finish-load', () => {
    setWindowTitle()
    if (SMOKE) {
      console.log('SMOKE_OK', win.webContents.getURL())
      setTimeout(() => app.exit(0), 250)
    }
  })
  loadMain()
}

function rememberBounds() {
  if (win === null || win.isDestroyed() || win.isMinimized() || win.isMaximized()) return
  saveSettings({ windowBounds: win.getBounds() })
}

// ---------------------------------------------------------------- send-message dialog
function isTrustedSender(event) {
  const url = (event.senderFrame && event.senderFrame.url) || event.sender.getURL()
  return url.startsWith('file://') || url.startsWith(activeUrl) || url.startsWith(HARNESS_URL)
}

function openSendDialog() {
  if (sendDialog !== null && !sendDialog.isDestroyed()) {
    sendDialog.focus()
    return
  }
  sendDialog = new BrowserWindow({
    width: 480,
    height: 360,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '发送消息',
    backgroundColor: '#0d1117',
    icon: path.join(ASSETS, 'icon.png'),
    parent: win,
    modal: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  sendDialog.on('closed', () => { sendDialog = null })
  sendDialog.loadFile(SEND_DIALOG_HTML).catch(() => {})
}

// ---------------------------------------------------------------- terminal (node-pty + xterm window)
let ptyProc = null

function clampDim(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Resolve the interactive shell executable for the current platform. */
function resolveShell() {
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot || 'C:\Windows'
    const candidates = [
      path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      path.join(sysRoot, 'System32', 'cmd.exe'),
    ]
    for (const c of candidates) if (fs.existsSync(c)) return c
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

/** Kill the active PTY, if any. Safe to call repeatedly. */
function cleanupPty() {
  if (ptyProc !== null) {
    try { ptyProc.kill() } catch (err) { /* already gone */ }
    ptyProc = null
  }
}

/** Open (or focus) the built-in terminal window. */
function openTerminal() {
  if (termWin !== null && !termWin.isDestroyed()) {
    termWin.focus()
    return
  }
  termWin = new BrowserWindow({
    width: 900,
    height: 560,
    minWidth: 480,
    minHeight: 300,
    title: '终端 — DSH Desktop',
    backgroundColor: '#0d1117',
    icon: path.join(ASSETS, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  termWin.setMenuBarVisibility(false)
  termWin.on('closed', () => { termWin = null; cleanupPty() })
  termWin.loadFile(TERMINAL_HTML).catch(() => {})
}

/** Spawn one PTY for the terminal window. Returns spawn facts for the renderer. */
function spawnPty(cols, rows) {
  cleanupPty()
  let pty
  try {
    pty = require('node-pty')
  } catch (err) {
    return { ok: false, error: 'node-pty 不可用：' + (err && err.message || err) }
  }
  const shell = resolveShell()
  let cwd = process.env.USERPROFILE || process.env.HOME
  if (!cwd) {
    try { cwd = require('os').homedir() } catch (err) { cwd = require('path').parse(process.cwd()).root }
  }
  try {
    ptyProc = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: clampDim(cols, 100, 20, 400),
      rows: clampDim(rows, 30, 5, 200),
      cwd,
      env: process.env,
    })
  } catch (err) {
    return { ok: false, error: '启动 shell 失败：' + (err && err.message || err) }
  }
  ptyProc.onData((data) => {
    if (termWin !== null && !termWin.isDestroyed()) termWin.webContents.send('terminal:data', data)
  })
  ptyProc.onExit(({ exitCode, signal }) => {
    if (termWin !== null && !termWin.isDestroyed()) {
      termWin.webContents.send('terminal:exit', { exitCode, signal })
    }
    ptyProc = null
  })
  return { ok: true, pid: ptyProc.pid }
}

ipcMain.handle('terminal:spawn', (event, args) => {
  if (!isTrustedSender(event)) return { ok: false, error: 'untrusted sender' }
  return spawnPty(args && args.cols, args && args.rows)
})

ipcMain.on('terminal:input', (event, data) => {
  if (!isTrustedSender(event)) return
  if (ptyProc !== null && typeof data === 'string') {
    try { ptyProc.write(data) } catch (err) { /* ignore */ }
  }
})

ipcMain.on('terminal:resize', (event, args) => {
  if (!isTrustedSender(event)) return
  if (ptyProc !== null && args && typeof args === 'object') {
    try {
      ptyProc.resize(clampDim(args.cols, 100, 20, 400), clampDim(args.rows, 30, 5, 200))
    } catch (err) { /* ignore */ }
  }
})

ipcMain.on('terminal:close', (event) => {
  if (!isTrustedSender(event)) return
  cleanupPty()
  if (termWin !== null && !termWin.isDestroyed()) termWin.close()
})

ipcMain.on('desktop:openTerminal', (event) => {
  if (!isTrustedSender(event)) return
  openTerminal()
})

ipcMain.handle('desktop:listSessions', (event) => {
  if (!isTrustedSender(event)) return { error: 'untrusted sender' }
  const items = []
  for (const [id, info] of sessionCache) {
    items.push({ sessionId: String(id), label: sessionLabel(id, info), running: !!(info && info.running) })
  }
  return { items }
})

ipcMain.handle('desktop:sendPrompt', async (event, args) => {
  if (!isTrustedSender(event)) return { ok: false, error: 'untrusted sender' }
  const sessionId = args && args.sessionId
  const text = args && typeof args.text === 'string' ? args.text.trim() : ''
  if (!sessionId || text === '') return { ok: false, error: 'empty session or text' }
  try {
    await rpc('session.prompt', {
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.on('desktop:closeSendDialog', (event) => {
  if (!isTrustedSender(event)) return
  if (sendDialog !== null && !sendDialog.isDestroyed()) sendDialog.close()
})

ipcMain.on('desktop:retry', () => loadMain())
ipcMain.on('desktop:quit', () => { quitting = true; app.quit() })

// ---------------------------------------------------------------- lifecycle
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    applySettings()
    rebuildMenu()
    if (!SMOKE) createSplash()
    createWindow()
    if (!SMOKE) {
      tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')))
      tray.on('click', () => showWindow())
      updateTray()
      connectEvents()
      refreshSessions()
      loadThemePref()
      setInterval(refreshSessions, 20000)
    }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('window-all-closed', () => { /* stay alive in tray (Windows) */ })
  app.on('before-quit', () => {
    quitting = true
    if (sseTimer) clearTimeout(sseTimer)
    if (menuRebuildTimer) clearTimeout(menuRebuildTimer)
    stopBundledDsh()
    cleanupPty()
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId)
    }
    globalShortcut.unregisterAll()
  })
}
