'use strict'
/**
 * Shared harness for behavior tests of Electron main-process modules.
 *
 * Desktop modules are loaded for real, with only the process boundary faked:
 * `electron` is a recording stub, `child_process.spawn` returns fake children
 * whose lifetime and termination are observable, and `fetch` answers DSH
 * readiness probes for fake `dsh web` children after a configurable cold start.
 * Nothing here launches Electron, DSH or a browser.
 */
const fs = require('fs')
const Module = require('module')
const os = require('os')
const path = require('path')
const { EventEmitter } = require('events')

const ROOT = path.join(__dirname, '..')
const SCRIPTS = path.join(ROOT, 'scripts')
const NODE_MODULES = path.join(ROOT, 'node_modules')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRepoModule(file) {
  return file.startsWith(ROOT + path.sep) && !file.startsWith(NODE_MODULES + path.sep) && !file.startsWith(SCRIPTS + path.sep)
}

function clearRepoModules() {
  for (const key of Object.keys(require.cache)) {
    if (isRepoModule(key)) delete require.cache[key]
  }
}

function createFakeProcesses(options = {}) {
  const coldStartMs = options.coldStartMs || 0
  const timeline = options.timeline || []
  const children = []
  let nextPid = 41000

  function makeChild(command, args, spawnOptions) {
    const child = new EventEmitter()
    child.command = command
    child.args = args.slice()
    child.options = spawnOptions || {}
    child.pid = nextPid++
    child.exitCode = null
    child.signalCode = null
    child.killed = false
    child.exited = false
    child.terminatedBy = null
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.spawnedAt = Date.now()
    const portIndex = child.args.indexOf('--port')
    child.port = portIndex >= 0 ? Number(child.args[portIndex + 1]) : null
    child.isDshWeb = child.args.includes('web') && child.args.some((arg) => /bin\.js$/.test(String(arg)))
    child.finish = (code, signal = null) => {
      if (child.exited) return
      child.exited = true
      child.exitCode = code
      child.signalCode = signal
      timeline.push(`child-exit:${child.pid}`)
      setImmediate(() => child.emit('exit', code, signal))
    }
    child.terminate = (how) => {
      if (child.exited) return
      child.killed = true
      child.terminatedBy = how
      timeline.push(`child-terminated:${child.pid}`)
      // taskkill /F reports exit code 1; a POSIX SIGTERM leaves exitCode null.
      if (how === 'taskkill') child.finish(1)
      else child.finish(null, 'SIGTERM')
    }
    child.kill = (signal = 'SIGTERM') => {
      child.terminate(`kill:${signal}`)
      return true
    }
    return child
  }

  function spawn(command, args = [], spawnOptions = {}) {
    if (command === 'taskkill') {
      const pid = Number(args[args.indexOf('/PID') + 1])
      const target = children.find((child) => child.pid === pid)
      if (target) target.terminate('taskkill')
      const killer = makeChild(command, args, spawnOptions)
      killer.finish(0)
      return killer
    }
    const child = makeChild(command, args, spawnOptions)
    children.push(child)
    timeline.push(`spawn:${child.pid}`)
    if (child.args.includes('--version')) {
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('0.0.0-fake\n'))
        child.finish(0)
      })
    }
    if (typeof options.onSpawn === 'function') options.onSpawn(child)
    return child
  }

  async function fetch(url) {
    const parsed = new URL(String(url))
    const port = Number(parsed.port)
    const child = children.find((item) => item.isDshWeb && item.port === port && !item.exited)
    if (child && Date.now() - child.spawnedAt >= coldStartMs) {
      return new Response('<!doctype html><title>DSH</title>', { status: 200, headers: { 'content-type': 'text/html' } })
    }
    throw new TypeError('fetch failed: ECONNREFUSED')
  }

  return {
    children,
    timeline,
    childProcess: { spawn },
    fetch,
    dshWebChildren: () => children.filter((child) => child.isDshWeb),
    liveDshWebChildren: () => children.filter((child) => child.isDshWeb && !child.exited),
  }
}

function createElectronStub(options = {}) {
  const userData = options.userData
  const timeline = options.timeline || []
  const listeners = new Map()
  const ipcHandlers = new Map()
  const originalBuildFromTemplate = (template) => ({ template })
  const Menu = {
    buildFromTemplate: originalBuildFromTemplate,
    setApplicationMenu() {},
  }
  const app = {
    getPath: () => userData,
    getVersion: () => '0.0.0-behavior',
    isReady: () => !!options.ready,
    whenReady: () => {
      timeline.push('whenReady')
      return new Promise(() => {})
    },
    requestSingleInstanceLock: () => {
      timeline.push('requestSingleInstanceLock')
      return options.singleInstance !== false
    },
    hasSingleInstanceLock: () => options.singleInstance !== false,
    quit: () => timeline.push('quit'),
    exit: (code) => timeline.push(`exit:${code}`),
    relaunch: (relaunchOptions) => timeline.push({ relaunch: relaunchOptions || null }),
    on: (event, listener) => {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(listener)
      return app
    },
    emit: (event, ...args) => {
      for (const listener of listeners.get(event) || []) listener(...args)
    },
    listenerCount: (event) => (listeners.get(event) || []).length,
    setLoginItemSettings() {},
  }
  function notExpected(name) {
    return function UnexpectedConstruction() {
      throw new Error(`${name} must not be constructed by this behavior test`)
    }
  }
  return {
    app,
    ipcMain: {
      handle: (channel, handler) => ipcHandlers.set(channel, handler),
      on: (channel, handler) => ipcHandlers.set(channel, handler),
    },
    ipcHandlers,
    Menu,
    originalBuildFromTemplate,
    BrowserWindow: Object.assign(notExpected('BrowserWindow'), { getAllWindows: () => [] }),
    BaseWindow: notExpected('BaseWindow'),
    WebContentsView: notExpected('WebContentsView'),
    Tray: notExpected('Tray'),
    Notification: Object.assign(notExpected('Notification'), { isSupported: () => false }),
    nativeImage: { createFromPath: () => ({}) },
    dialog: { showErrorBox() {}, showMessageBox: async () => ({}) },
    shell: { openExternal: async () => {}, openPath: async () => '' },
    clipboard: { writeText() {} },
    powerSaveBlocker: { start: () => 1, stop() {}, isStarted: () => false },
    globalShortcut: { isRegistered: () => false, register: () => true, unregister() {}, unregisterAll() {} },
    screen: { getAllDisplays: () => [] },
  }
}

/**
 * Run one isolated scenario: fresh temp userData, fresh repo module instances,
 * stubbed electron/child_process/fetch, and restored globals afterwards.
 */
async function withDesktop(options, scenario) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-behavior-'))
  const userData = path.join(temp, 'userData')
  fs.mkdirSync(userData, { recursive: true })
  const timeline = []
  const processes = createFakeProcesses(Object.assign({}, options, { timeline }))
  const electron = createElectronStub(Object.assign({}, options, { userData, timeline }))

  const originalLoad = Module._load
  const originalFetch = globalThis.fetch
  const originalExistsSync = fs.existsSync
  const savedEnv = {}
  const env = Object.assign({
    DSH_URL: undefined,
    DSH_DESKTOP_MODE: undefined,
    DSH_RUNTIME_AUTO_UPDATE: '0',
    DSH_DESKTOP_RUNTIME_ROOT: path.join(temp, 'runtime-root'),
    DSH_DESKTOP_DSH_HOME: path.join(temp, 'dsh-home'),
  }, options.env || {})
  for (const [key, value] of Object.entries(env)) {
    savedEnv[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  Module._load = function stubbedLoad(request) {
    if (request === 'electron') return electron
    if (request === 'child_process') return processes.childProcess
    return originalLoad.apply(this, arguments)
  }
  globalThis.fetch = processes.fetch
  // The bundled DSH CLI and pnpm are installed on CI but not necessarily in a
  // local checkout; only their presence matters because spawn is faked.
  fs.existsSync = function existsWithBundledRuntime(target) {
    const normalized = String(target).replace(/\\/g, '/')
    if (/\/node_modules\/@deepseek-ai\/dsh\/lib\/bin\.js$/.test(normalized) && normalized.startsWith(ROOT.replace(/\\/g, '/'))) return true
    if (/\/node_modules\/pnpm\/bin\/pnpm\.mjs$/.test(normalized) && normalized.startsWith(ROOT.replace(/\\/g, '/'))) return true
    return originalExistsSync.apply(fs, arguments)
  }
  clearRepoModules()

  const harness = {
    root: ROOT,
    temp,
    userData,
    timeline,
    electron,
    processes,
    require: (relative) => require(path.join(ROOT, relative)),
    loadWithInternals,
  }
  try {
    return await scenario(harness)
  } finally {
    // Let fake exits scheduled with setImmediate settle before restoring globals.
    await delay(20)
    Module._load = originalLoad
    globalThis.fetch = originalFetch
    fs.existsSync = originalExistsSync
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    clearRepoModules()
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

/**
 * Load a repo module exactly as shipped, plus a test-only view of selected
 * module-scoped bindings. The expression is appended inside the module scope.
 */
function loadWithInternals(relative, internalsExpression) {
  const file = path.join(ROOT, relative)
  const source = `${fs.readFileSync(file, 'utf8')}\n;module.exports.__internals = ${internalsExpression}\n`
  const loaded = new Module(file, module)
  loaded.filename = file
  loaded.paths = Module._nodeModulePaths(path.dirname(file))
  loaded._compile(source, file)
  return loaded.exports.__internals
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await delay(25)
  }
  throw new Error(`timed out waiting for ${label}`)
}

function indexOfEntry(timeline, entry) {
  return timeline.findIndex((item) => item === entry)
}

module.exports = {
  ROOT,
  delay,
  indexOfEntry,
  loadWithInternals,
  waitFor,
  withDesktop,
}
