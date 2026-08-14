'use strict'
/**
 * DSH Desktop — codex 桌面端风格的 DeepSeek Harness 原生客户端。
 *
 * 零配置：原生窗口加载运行中的 DSH Web 客户端（默认 http://127.0.0.1:3080），
 * 无需任何用户配置。打包一条命令：npm run dist（镜像已内置）。
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

const ARG_URL = (() => {
  const hit = process.argv.find((a) => a.startsWith('--url='))
  return hit ? hit.slice(6) : null
})()
const HARNESS_URL = (process.env.DSH_URL || ARG_URL || 'http://127.0.0.1:3080').replace(/\/+$/, '')
const SMOKE = process.argv.includes('--smoke')

const ASSETS = path.join(__dirname, 'assets')
const PRELOAD = path.join(__dirname, 'preload.js')
const ERROR_HTML = path.join(__dirname, 'error.html')
const SEND_DIALOG_HTML = path.join(__dirname, 'send-dialog.html')

let win = null
let sendDialog = null
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

// ---------------------------------------------------------------- RPC
async function rpc(method, payload = {}) {
  const res = await fetch(HARNESS_URL + '/api/' + method, {
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
      const res = await fetch(HARNESS_URL + '/api/events.host', { signal: controller.signal })
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
        { label: '在浏览器中打开 DSH', click: () => shell.openExternal(HARNESS_URL) },
        { type: 'separator' },
        {
          label: '关于 DSH Desktop',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: '关于',
            message: 'DSH Desktop ' + app.getVersion(),
            detail: 'DeepSeek Harness 桌面客户端\n连接：' + HARNESS_URL + '\n零配置，开箱即用',
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
function loadMain() {
  if (!win) return
  win.loadURL(HARNESS_URL).catch(() => loadErrorPage())
}

function loadErrorPage() {
  if (!win) return
  win.loadFile(ERROR_HTML).catch(() => {})
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
  win.once('ready-to-show', () => { if (!SMOKE) win.show() })
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
    loadErrorPage()
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
  return url.startsWith('file://') || url.startsWith(HARNESS_URL)
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
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId)
    }
    globalShortcut.unregisterAll()
  })
}
