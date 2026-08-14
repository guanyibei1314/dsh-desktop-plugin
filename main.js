'use strict'
/**
 * DSH Desktop — codex 桌面端风格的 DeepSeek Harness 原生客户端。
 *
 * 原生窗口加载运行中的 DSH Web 客户端（默认 http://127.0.0.1:3080），
 * 并叠加桌面集成：
 *   - 原生菜单（主题切换 / 视图缩放 / 设置文档 / 关于）
 *   - 托盘图标（会话运行状态，点击显示窗口）
 *   - 回合完成 / 代理错误系统通知（订阅 /api/events.host SSE）
 *   - 关窗隐藏到托盘；服务未启动时显示重试页
 *
 * 服务地址可用环境变量 DSH_URL 或命令行 --url= 覆盖。
 */
const { app, BrowserWindow, Menu, Tray, nativeImage, Notification, dialog, shell, ipcMain } = require('electron')
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

let win = null
let tray = null
let quitting = false
let connected = false
let themePref = 'system'
let sseTimer = null
let running = new Map() // sessionId -> { cwd, running }
const lastNotifyAt = new Map() // sessionId -> timestamp (debounce)

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
      const prev = running.get(it.sessionId)
      next.set(it.sessionId, {
        cwd: it.cwd || (prev && prev.cwd),
        running: !!it.running,
      })
    }
    running = next
    connected = true
  } catch (err) {
    connected = false
  }
  updateTray()
}

function runningCount() {
  let n = 0
  for (const s of running.values()) if (s.running) n++
  return n
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
    { label: status, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ]))
}

function notifyTurnDone(sessionId, cwd) {
  if (!Notification.isSupported()) return
  const now = Date.now()
  const last = lastNotifyAt.get(sessionId) || 0
  if (now - last < 10000) return
  lastNotifyAt.set(sessionId, now)
  const base = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() : ''
  new Notification({
    title: 'DSH · 任务完成',
    body: '会话 ' + String(sessionId).slice(0, 8) + (base ? '（' + base + '）' : '') + ' 已结束运行',
  }).show()
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
      const prev = running.get(id)
      const was = !!(prev && prev.running)
      const now = !!payload.running
      running.set(id, { cwd: prev ? prev.cwd : undefined, running: now })
      updateTray()
      if (was && !now) notifyTurnDone(id, prev && prev.cwd)
      break
    }
    case 'host/session-added': {
      running.set(payload.sessionId, { cwd: payload.cwd, running: false })
      updateTray()
      break
    }
    case 'host/session-removed': {
      running.delete(payload.sessionId)
      updateTray()
      break
    }
    case 'host/agent-error': {
      if (Notification.isSupported()) {
        new Notification({
          title: 'DSH · 代理出错',
          body: String(payload.message || '未知错误').slice(0, 240),
        }).show()
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
    Menu.setApplicationMenu(buildMenu())
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
      Menu.setApplicationMenu(buildMenu())
    }
  } catch (err) {
    // harness not reachable yet — keep defaults
  }
}

// ---------------------------------------------------------------- menu
function themeItems() {
  return [
    { label: '跟随系统', type: 'radio', checked: themePref === 'system', click: () => setTheme('system') },
    { label: '亮色', type: 'radio', checked: themePref === 'light', click: () => setTheme('light') },
    { label: '暗色', type: 'radio', checked: themePref === 'dark', click: () => setTheme('dark') },
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
    { label: '主题', submenu: themeItems() },
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
            detail: 'DeepSeek Harness 桌面客户端\n连接：' + HARNESS_URL,
          }),
        },
      ],
    },
  ])
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
  win = new BrowserWindow({
    width: 1320,
    height: 860,
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
  })
  win.once('ready-to-show', () => { if (!SMOKE) win.show() })
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => { win = null })
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
    if (SMOKE) {
      console.log('SMOKE_OK', win.webContents.getURL())
      setTimeout(() => app.exit(0), 250)
    }
  })
  loadMain()
}

// ---------------------------------------------------------------- IPC (error page bridge)
ipcMain.on('desktop:retry', () => loadMain())
ipcMain.on('desktop:quit', () => { quitting = true; app.quit() })

// ---------------------------------------------------------------- lifecycle
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildMenu())
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
  })
}
