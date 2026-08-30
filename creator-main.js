'use strict'

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} = require('electron')
const fs = require('fs')
const path = require('path')
const net = require('net')
const { spawn } = require('child_process')
const {
  canonicalRoot,
  defaultState,
  inferStage,
  normalizeState,
  readTextLimited,
  resolveContentDir,
  resolveEditableFile,
  safeId,
  sanitizeTitle,
  writeTextAtomic,
} = require('./creator-core')
const desktopMode = require('./desktop-mode')

const CREATOR_HTML = path.join(__dirname, 'creator.html')
const CREATOR_PRELOAD = path.join(__dirname, 'creator-preload.js')
const ICON = path.join(__dirname, 'assets', 'icon.png')
const SMOKE = process.argv.includes('--smoke')
const MAX_CONTENT_ITEMS = 2000
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm'])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

let creatorWindow = null
let tray = null
let harnessProc = null
let harnessUrl = ''
let quitting = false

function physicalNodeModulePath(...parts) {
  const inAsar = path.join(__dirname, 'node_modules', ...parts)
  const unpacked = inAsar.replace(/[\\/]app\.asar[\\/]/, `${path.sep}app.asar.unpacked${path.sep}`)
  if (unpacked !== inAsar && fs.existsSync(unpacked)) return unpacked
  return inAsar
}

function dshBinPath() {
  return physicalNodeModulePath('@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

function dshHomeDir() {
  return path.join(app.getPath('userData'), 'dsh-home')
}

function creatorDataDir() {
  return path.join(app.getPath('userData'), 'creator')
}

function stateFile() {
  return path.join(creatorDataDir(), 'state.json')
}

function creatorLog(message) {
  try {
    fs.mkdirSync(creatorDataDir(), { recursive: true })
    fs.appendFileSync(path.join(creatorDataDir(), 'creator.log'), `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch (_) {
    // Diagnostics are best-effort only.
  }
}

function readState() {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(stateFile(), 'utf8')))
  } catch (_) {
    return defaultState()
  }
}

function saveState(input) {
  fs.mkdirSync(creatorDataDir(), { recursive: true })
  const current = readState()
  const next = normalizeState(input)
  next.revision = Math.max(current.revision + 1, next.revision + 1)
  const file = stateFile()
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8')
  try {
    fs.renameSync(temp, file)
  } catch (error) {
    fs.copyFileSync(temp, file)
    fs.rmSync(temp, { force: true })
  }
  return next
}

function updateState(mutator) {
  const next = readState()
  mutator(next)
  return saveState(next)
}

function pickPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = address && address.port
      server.close(() => resolve(port))
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function probeHarness(url, timeoutMs = 1200) {
  try {
    const response = await fetch(`${url}/`, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
    return response.ok
  } catch (_) {
    return false
  }
}

async function startHarness() {
  if (SMOKE) return ''
  if (harnessProc && harnessProc.exitCode === null && harnessUrl) return harnessUrl
  const bin = dshBinPath()
  if (!fs.existsSync(bin)) throw new Error('内置 DeepSeek Harness 缺失。')
  const port = await pickPort()
  fs.mkdirSync(dshHomeDir(), { recursive: true })
  const child = spawn(
    process.execPath,
    ['--expose-internals', bin, 'web', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: dshHomeDir(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: dshHomeDir(),
        DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED || '1',
      }),
    },
  )
  harnessProc = child
  const captured = []
  const collect = (chunk) => {
    captured.push(String(chunk))
    if (captured.length > 80) captured.shift()
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  child.once('error', (error) => collect(`spawn error: ${error.message}`))
  child.once('exit', () => {
    if (harnessProc === child) {
      harnessProc = null
      harnessUrl = ''
    }
  })

  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (harnessProc !== child || child.exitCode !== null) break
    if (await probeHarness(url)) {
      if (harnessProc !== child || child.exitCode !== null) break
      harnessUrl = url
      creatorLog(`harness ready ${url}`)
      return url
    }
    await delay(750)
  }
  stopHarness()
  throw new Error(`Creator 模式启动 DSH 超时：${captured.join('').slice(-3000)}`)
}

function stopHarness() {
  const child = harnessProc
  harnessProc = null
  harnessUrl = ''
  if (!child) return
  try {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    else child.kill('SIGTERM')
  } catch (_) {
    // Best-effort shutdown.
  }
}

function isCreatorSender(event) {
  return !!creatorWindow && !creatorWindow.isDestroyed() && !!event && event.sender === creatorWindow.webContents
}

function requireCreatorSender(event) {
  if (!isCreatorSender(event)) throw new Error('unauthorized sender')
}

function stateLibraryRoot() {
  const root = readState().libraryRoot
  return root ? canonicalRoot(root) : ''
}

function listContentFacts(dir) {
  const names = fs.readdirSync(dir)
  let video = false
  let cover = false
  let subtitle = false
  for (const name of names.slice(0, 5000)) {
    const ext = path.extname(name).toLowerCase()
    const lower = name.toLowerCase()
    if (VIDEO_EXTS.has(ext)) video = true
    if (ext === '.srt' || ext === '.vtt') subtitle = true
    if (IMAGE_EXTS.has(ext) && /cover|封面|16x9|4x3|3x4/.test(lower)) cover = true
  }
  return {
    topic: fs.existsSync(path.join(dir, 'topic.md')),
    script: fs.existsSync(path.join(dir, 'script.md')),
    video,
    subtitle,
    cover,
  }
}

function listContents() {
  const state = readState()
  if (!state.libraryRoot) return []
  const root = canonicalRoot(state.libraryRoot)
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const result = []
  for (const entry of entries.slice(0, MAX_CONTENT_ITEMS)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const id = safeId(entry.name)
    if (!id) continue
    let dir
    try { dir = resolveContentDir(root, id) } catch (_) { continue }
    const facts = listContentFacts(dir)
    let topic = ''
    try { topic = readTextLimited(path.join(dir, 'topic.md')).slice(0, 1200) } catch (_) { /* ignore */ }
    const firstText = topic.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, '').trim()).find(Boolean) || entry.name
    const meta = state.contentMeta[id] || {}
    result.push({
      id,
      title: firstText.slice(0, 160),
      stage: inferStage(facts, meta),
      facts,
      meta,
      modifiedAt: fs.statSync(dir).mtime.toISOString(),
    })
  }
  return result.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

function createContent(rawTitle, sourceIdeaId = '') {
  const title = sanitizeTitle(rawTitle)
  const state = readState()
  if (!state.libraryRoot) throw new Error('请先在 Creator 设置里选择内容目录。')
  const root = canonicalRoot(state.libraryRoot)
  const day = new Date().toISOString().slice(0, 10)
  const base = `${day}_${title}`.replace(/\s+/g, '_')
  let id = base
  let index = 2
  while (fs.existsSync(path.join(root, id))) {
    id = `${base}_${index}`
    index += 1
  }
  if (!safeId(id)) throw new Error('生成的内容目录名无效。')
  const dir = path.join(root, id)
  fs.mkdirSync(dir, { recursive: false })
  writeTextAtomic(path.join(dir, 'topic.md'), `# ${title}\n\n## 一句话核心\n\n\n## 目标受众\n\n\n## 参考资料\n\n`)
  writeTextAtomic(path.join(dir, 'script.md'), `# ${title}\n\n## 开头\n\n\n## 正文\n\n\n## 结尾\n\n`)

  const next = updateState((draft) => {
    draft.contentMeta[id] = Object.assign({}, draft.contentMeta[id], {
      published: false,
      nextStep: '完善脚本',
      contentType: '视频',
    })
    if (sourceIdeaId) {
      const idea = draft.ideas.find((item) => item.id === sourceIdeaId)
      if (idea) {
        idea.status = 'promoted'
        idea.contentId = id
        idea.updatedAt = new Date().toISOString()
      }
    }
  })
  return { id, title, path: dir, state: next }
}

function readContent(id) {
  const root = stateLibraryRoot()
  if (!root) throw new Error('请先选择内容目录。')
  const dir = resolveContentDir(root, id)
  const topicFile = resolveEditableFile(root, id, 'topic.md')
  const scriptFile = resolveEditableFile(root, id, 'script.md')
  return {
    id,
    path: dir,
    topic: readTextLimited(topicFile),
    script: readTextLimited(scriptFile),
    facts: listContentFacts(dir),
    meta: readState().contentMeta[id] || {},
  }
}

function writeContent(id, field, text) {
  const root = stateLibraryRoot()
  if (!root) throw new Error('请先选择内容目录。')
  const fileName = field === 'topic' ? 'topic.md' : field === 'script' ? 'script.md' : ''
  if (!fileName) throw new Error('仅允许编辑 topic.md 或 script.md。')
  const file = resolveEditableFile(root, id, fileName)
  writeTextAtomic(file, text)
  return readContent(id)
}

async function pickLibrary() {
  const result = await dialog.showOpenDialog(creatorWindow, {
    title: '选择 Creator 内容目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length !== 1) return readState()
  const root = canonicalRoot(result.filePaths[0])
  return updateState((draft) => { draft.libraryRoot = root })
}

async function exportBackup() {
  const result = await dialog.showSaveDialog(creatorWindow, {
    title: '导出 Creator 运营数据备份',
    defaultPath: `dsh-creator-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false }
  const state = readState()
  fs.writeFileSync(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2), 'utf8')
  return { ok: true, path: result.filePath }
}

function openLibrary() {
  const root = stateLibraryRoot()
  if (!root) throw new Error('请先选择内容目录。')
  shell.openPath(root).catch(() => {})
  return true
}

function openContent(id) {
  const root = stateLibraryRoot()
  if (!root) throw new Error('请先选择内容目录。')
  const dir = resolveContentDir(root, id)
  shell.openPath(dir).catch(() => {})
  return true
}

function registerIpc() {
  ipcMain.handle('creator:status', (event) => {
    requireCreatorSender(event)
    return { mode: desktopMode.getMode(), harnessUrl, version: app.getVersion() }
  })
  ipcMain.handle('creator:state:get', (event) => {
    requireCreatorSender(event)
    return readState()
  })
  ipcMain.handle('creator:state:save', (event, state) => {
    requireCreatorSender(event)
    return saveState(state)
  })
  ipcMain.handle('creator:library:pick', async (event) => {
    requireCreatorSender(event)
    return pickLibrary()
  })
  ipcMain.handle('creator:library:list', (event) => {
    requireCreatorSender(event)
    return listContents()
  })
  ipcMain.handle('creator:library:create', (event, payload) => {
    requireCreatorSender(event)
    return createContent(payload && payload.title, payload && payload.sourceIdeaId)
  })
  ipcMain.handle('creator:content:get', (event, id) => {
    requireCreatorSender(event)
    return readContent(String(id || ''))
  })
  ipcMain.handle('creator:content:write', (event, payload) => {
    requireCreatorSender(event)
    return writeContent(String(payload && payload.id || ''), String(payload && payload.field || ''), payload && payload.text)
  })
  ipcMain.handle('creator:content:open', (event, id) => {
    requireCreatorSender(event)
    return openContent(String(id || ''))
  })
  ipcMain.handle('creator:library:open', (event) => {
    requireCreatorSender(event)
    return openLibrary()
  })
  ipcMain.handle('creator:backup:export', async (event) => {
    requireCreatorSender(event)
    return exportBackup()
  })
  ipcMain.handle('creator:switch-mode', (event, mode) => {
    requireCreatorSender(event)
    desktopMode.switchMode(mode)
    return true
  })
}

function buildCreatorMenu() {
  return Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '重新加载 Creator', accelerator: 'CmdOrCtrl+R', click: () => creatorWindow && creatorWindow.webContents.reload() },
        { label: '打开内容目录', click: () => { try { openLibrary() } catch (error) { dialog.showErrorBox('DSH Creator', error.message) } } },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit() } },
      ],
    },
    {
      label: 'Creator',
      submenu: [
        { label: '新建内容', accelerator: 'CmdOrCtrl+N', click: () => creatorWindow && creatorWindow.webContents.send('creator:command', 'new-content') },
        { label: '新建灵感', click: () => creatorWindow && creatorWindow.webContents.send('creator:command', 'new-idea') },
        { label: '刷新内容库', accelerator: 'F5', click: () => creatorWindow && creatorWindow.webContents.send('creator:command', 'refresh') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于 DSH Creator', click: () => dialog.showMessageBox(creatorWindow, {
          type: 'info',
          title: 'DSH Creator',
          message: `DSH Desktop ${app.getVersion()} · Creator 模式`,
          detail: '本地优先的内容、灵感、运营与 AI 会话工作台。正文和媒体仍保存在你选择的真实文件夹。',
        }) },
      ],
    },
  ])
}

function createTray() {
  if (SMOKE || tray) return
  const image = nativeImage.createFromPath(ICON)
  tray = new Tray(image)
  tray.setToolTip('DSH Desktop — Creator 模式')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'DSH Desktop', enabled: false },
    { type: 'separator' },
    { label: '显示 Creator', click: () => { if (creatorWindow) { creatorWindow.show(); creatorWindow.focus() } } },
    { label: '打开内容目录', click: () => { try { openLibrary() } catch (_) { /* no library yet */ } } },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ]))
  tray.on('double-click', () => { if (creatorWindow) { creatorWindow.show(); creatorWindow.focus() } })
}

function createCreatorWindow() {
  creatorWindow = new BrowserWindow({
    width: 1540,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    title: 'DSH Desktop — Creator',
    backgroundColor: '#0b0f14',
    icon: ICON,
    show: false,
    webPreferences: {
      preload: CREATOR_PRELOAD,
      partition: 'persist:dsh-creator-shell',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const session = creatorWindow.webContents.session
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  creatorWindow.webContents.on('will-navigate', (event, url) => {
    const local = new URL(`file://${CREATOR_HTML.replace(/\\/g, '/')}`).href
    if (url !== local && !url.startsWith('file:')) event.preventDefault()
  })
  creatorWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  creatorWindow.on('close', (event) => {
    if (!quitting && !SMOKE) {
      event.preventDefault()
      creatorWindow.hide()
    }
  })
  creatorWindow.on('closed', () => { creatorWindow = null })
  creatorWindow.once('ready-to-show', () => { if (!SMOKE) creatorWindow.show() })
  creatorWindow.webContents.on('did-finish-load', () => {
    creatorWindow.webContents.send('creator:harness-url', harnessUrl)
    if (SMOKE) {
      console.log('CREATOR_SMOKE_OK')
      setTimeout(() => app.exit(0), 200)
    }
  })
  Menu.setApplicationMenu(buildCreatorMenu())
  creatorWindow.loadFile(CREATOR_HTML).catch((error) => dialog.showErrorBox('DSH Creator', error.message))
  createTray()
}

async function startCreator() {
  registerIpc()
  try {
    harnessUrl = await startHarness()
  } catch (error) {
    creatorLog(`harness error: ${error && error.stack ? error.stack : error}`)
    harnessUrl = ''
  }
  createCreatorWindow()
}

app.on('before-quit', () => {
  quitting = true
  stopHarness()
  if (tray) {
    try { tray.destroy() } catch (_) { /* ignore */ }
    tray = null
  }
})

if (app.isReady()) startCreator()
else app.whenReady().then(startCreator)

module.exports = {
  createContent,
  listContents,
  readState,
  saveState,
}
