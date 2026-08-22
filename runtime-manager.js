'use strict'

const { app, Notification } = require('electron')
const childProcess = require('child_process')
const fs = require('fs')
const net = require('net')
const path = require('path')
const {
  EXPECTED_REPOSITORY,
  PACKAGE_NAME,
  REGISTRY_ORIGIN,
  REGISTRY_URL,
  OSV_URL,
  compareVersions,
  isDshBinArgument,
  isSafeVersion,
  normalizeOsvResponse,
  normalizeRegistryRelease,
  normalizeRepository,
  shouldCheck,
} = require('./runtime-update-core')
const { readJsonLimited } = require('./secure-fetch')
const {
  REGISTRY_KEYS_URL,
  officialReleaseApiUrl,
  officialSourcePackageApiUrl,
  normalizeOfficialGitHubRelease,
  normalizeOfficialSourcePackage,
  verifyNpmRegistrySignature,
} = require('./runtime-publisher-auth')

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10000
const MAX_REGISTRY_BYTES = 6 * 1024 * 1024
const MAX_OSV_BYTES = 2 * 1024 * 1024
const PROBE_TIMEOUT_MS = 90000
const STATE_SCHEMA = 1
const originalSpawn = childProcess.spawn.bind(childProcess)

let spawnPatched = false
let sessionDshBin = bundledDshBinPath()
let sessionVersion = bundledDshVersion()
let updateInFlight = null
let scheduledTimer = null

function physicalNodeModulePath(...parts) {
  const inAsar = path.join(__dirname, 'node_modules', ...parts)
  const unpacked = inAsar.replace(/[\\/]app\.asar[\\/]/, `${path.sep}app.asar.unpacked${path.sep}`)
  if (unpacked !== inAsar && fs.existsSync(unpacked)) return unpacked
  return inAsar
}

function bundledDshDir() {
  return physicalNodeModulePath('@deepseek-ai', 'dsh')
}

function bundledDshBinPath() {
  return physicalNodeModulePath('@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

function bundledDshVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(bundledDshDir(), 'package.json'), 'utf8'))
    return isSafeVersion(pkg.version) ? pkg.version : '0.0.0'
  } catch (err) {
    return '0.0.0'
  }
}

function pnpmBinPath() {
  return physicalNodeModulePath('pnpm', 'bin', 'pnpm.mjs')
}

function runtimeRoot() {
  if (process.env.DSH_DESKTOP_RUNTIME_ROOT) return path.resolve(process.env.DSH_DESKTOP_RUNTIME_ROOT)
  return path.join(app.getPath('userData'), 'dsh-runtime')
}

function dshHomeDir() {
  if (process.env.DSH_DESKTOP_DSH_HOME) return path.resolve(process.env.DSH_DESKTOP_DSH_HOME)
  return path.join(app.getPath('userData'), 'dsh-home')
}

function versionsDir() {
  return path.join(runtimeRoot(), 'versions')
}

function versionDir(version) {
  return path.join(versionsDir(), version)
}

function installedDshDir(version) {
  return path.join(versionDir(version), 'node_modules', '@deepseek-ai', 'dsh')
}

function installedDshBin(version) {
  return path.join(installedDshDir(version), 'lib', 'bin.js')
}

function stateFile() {
  return path.join(runtimeRoot(), 'state.json')
}

function logFile() {
  return path.join(runtimeRoot(), 'runtime-update.log')
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function ensureDirs() {
  fs.mkdirSync(runtimeRoot(), { recursive: true })
  fs.mkdirSync(versionsDir(), { recursive: true })
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { return null }
}

function appendLog(message) {
  try {
    ensureDirs()
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch (err) {
    // diagnostics are best-effort
  }
}

function defaultState() {
  return {
    schema: STATE_SCHEMA,
    activeVersion: null,
    previousVersion: null,
    pendingVersion: null,
    latestVersion: null,
    lastCheckedAt: null,
    lastUpdateAt: null,
    lastError: null,
    blockedVersions: {},
  }
}

function loadState() {
  const raw = readJson(stateFile())
  if (!raw || raw.schema !== STATE_SCHEMA || typeof raw !== 'object') return defaultState()
  const state = Object.assign(defaultState(), raw)
  if (!state.blockedVersions || typeof state.blockedVersions !== 'object' || Array.isArray(state.blockedVersions)) {
    state.blockedVersions = {}
  }
  for (const key of ['activeVersion', 'previousVersion', 'pendingVersion', 'latestVersion']) {
    if (state[key] !== null && !isSafeVersion(state[key])) state[key] = null
  }
  return state
}

function saveState(state) {
  ensureDirs()
  const next = Object.assign(defaultState(), state, { schema: STATE_SCHEMA })
  const tmp = `${stateFile()}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  try {
    fs.renameSync(tmp, stateFile())
  } catch (err) {
    fs.copyFileSync(tmp, stateFile())
    fs.rmSync(tmp, { force: true })
  }
}

function updateSettings() {
  const settings = readJson(settingsFile()) || {}
  const envChannel = process.env.DSH_RUNTIME_CHANNEL
  const channel = envChannel === 'latest' || settings.dshRuntimeUpdateChannel === 'latest' ? 'latest' : 'stable'
  const autoFromEnv = process.env.DSH_RUNTIME_AUTO_UPDATE
  const autoUpdate = autoFromEnv === '0' || autoFromEnv === 'false'
    ? false
    : autoFromEnv === '1' || autoFromEnv === 'true'
      ? true
      : settings.dshRuntimeAutoUpdate !== false
  return { channel, autoUpdate }
}

function validateInstalledVersion(version) {
  if (!isSafeVersion(version)) return null
  try {
    const dir = installedDshDir(version)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const bin = installedDshBin(version)
    if (pkg.name !== PACKAGE_NAME || pkg.version !== version || !fs.existsSync(bin)) return null
    if (normalizeRepository(pkg.repository) !== EXPECTED_REPOSITORY) return null
    return { version, dir, bin, repository: EXPECTED_REPOSITORY }
  } catch (err) {
    return null
  }
}

function currentRuntimeDescriptor() {
  return {
    version: sessionVersion,
    bin: sessionDshBin,
    bundledVersion: bundledDshVersion(),
    source: sessionDshBin === bundledDshBinPath() ? 'bundled' : 'managed',
  }
}

function patchDshSpawn() {
  if (spawnPatched) return
  spawnPatched = true
  childProcess.spawn = function patchedSpawn(command, args, options) {
    if (command === process.execPath && Array.isArray(args)) {
      const next = args.slice()
      let changed = false
      for (let i = 0; i < next.length; i += 1) {
        if (isDshBinArgument(next[i]) && fs.existsSync(sessionDshBin)) {
          next[i] = sessionDshBin
          changed = true
        }
      }
      if (changed) return originalSpawn(command, next, options)
    }
    return originalSpawn(command, args, options)
  }
}

function inheritedPath() {
  if (process.env.PATH !== undefined) return process.env.PATH
  if (process.platform !== 'win32') return ''
  const hit = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')
  return hit ? (hit[1] || '') : ''
}

function quoteSh(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function ensureRuntimeShims() {
  const dir = path.join(runtimeRoot(), 'bin')
  fs.mkdirSync(dir, { recursive: true })
  const pnpm = pnpmBinPath()
  if (!fs.existsSync(pnpm)) throw new Error('内置 pnpm 缺失，无法安全更新 DSH Runtime。')
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'node.cmd'), `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${process.execPath}" %*\r\n`, 'utf8')
    fs.writeFileSync(path.join(dir, 'pnpm.cmd'), `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${process.execPath}" "${pnpm}" %*\r\n`, 'utf8')
  } else {
    const node = path.join(dir, 'node')
    const pnpmShim = path.join(dir, 'pnpm')
    fs.writeFileSync(node, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quoteSh(process.execPath)} "$@"\n`, 'utf8')
    fs.writeFileSync(pnpmShim, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quoteSh(process.execPath)} ${quoteSh(pnpm)} "$@"\n`, 'utf8')
    fs.chmodSync(node, 0o755)
    fs.chmodSync(pnpmShim, 0o755)
  }
  return dir
}

function runtimeEnvironment(home) {
  const binDir = ensureRuntimeShims()
  const basePath = inheritedPath()
  return Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: '1',
    DSH_HOME: home,
    DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED || '1',
    CI: 'true',
    PATH: basePath ? `${binDir}${path.delimiter}${basePath}` : binDir,
    npm_config_registry: `${REGISTRY_ORIGIN}/`,
    npm_config_ignore_scripts: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  })
}

function runCaptured(args, options = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = originalSpawn(process.execPath, args, Object.assign({
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }, options))
    let output = ''
    let settled = false
    const timer = setTimeout(() => {
      terminateTree(child)
      if (!settled) {
        settled = true
        reject(new Error(`process timed out after ${timeoutMs}ms`))
      }
    }, timeoutMs)
    const collect = (data) => {
      output += String(data)
      if (output.length > 160000) output = output.slice(-160000)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', (err) => {
      clearTimeout(timer)
      if (!settled) {
        settled = true
        reject(err)
      }
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      if (code === 0) resolve(output)
      else reject(new Error(`process failed (${code === null ? 'null' : code}${signal ? `, ${signal}` : ''}): ${output.slice(-4000)}`))
    })
  })
}

function terminateTree(child) {
  if (!child || child.killed) return
  try {
    if (process.platform === 'win32' && child.pid) {
      originalSpawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  } catch (err) {
    // best-effort cleanup
  }
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

async function probeUrl(url, timeoutMs = 1200) {
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
    return response.ok
  } catch (err) {
    return false
  }
}

async function probeDshBin(bin, home, timeoutMs = PROBE_TIMEOUT_MS) {
  if (!fs.existsSync(bin)) throw new Error(`DSH bin missing: ${bin}`)
  fs.mkdirSync(home, { recursive: true })
  const env = runtimeEnvironment(home)
  await runCaptured(['--expose-internals', bin, '--version'], { cwd: home, env }, 20000)
  const port = await pickPort()
  const child = originalSpawn(
    process.execPath,
    ['--expose-internals', bin, 'web', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: home, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env },
  )
  let output = ''
  const collect = (data) => {
    output += String(data)
    if (output.length > 120000) output = output.slice(-120000)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  let exited = false
  child.once('exit', () => { exited = true })
  try {
    const url = `http://127.0.0.1:${port}/`
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await probeUrl(url)) return { ok: true, url }
      if (exited) break
      await delay(750)
    }
    throw new Error(`DSH web probe failed: ${output.slice(-5000)}`)
  } finally {
    terminateTree(child)
    await delay(300)
  }
}

async function fetchJson(url, options, maxBytes) {
  const response = await fetch(url, Object.assign({}, options, {
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }))
  return readJsonLimited(response, maxBytes, { label: 'Runtime security response' })
}

async function fetchOfficialRelease(channel) {
  const metadata = await fetchJson(REGISTRY_URL, {
    method: 'GET',
    headers: { accept: 'application/json', 'user-agent': 'DSH-Desktop-Runtime-Updater/0.7' },
  }, MAX_REGISTRY_BYTES)
  return normalizeRegistryRelease(metadata, channel)
}

async function queryOsv(version) {
  const body = await fetchJson(OSV_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ package: { ecosystem: 'npm', name: PACKAGE_NAME }, version }),
  }, MAX_OSV_BYTES)
  return normalizeOsvResponse(body)
}

function systemNpmCliPath() {
  const candidates = []
  if (process.platform === 'win32') {
    for (const root of [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (root) candidates.push(path.join(root, 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'))
    }
  }
  if (process.env.CI === 'true' && process.env.npm_execpath) candidates.push(process.env.npm_execpath)
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null
}

function runNpmCli(npmCli, args, cwd, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = originalSpawn(process.execPath, [npmCli, ...args], {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: runtimeEnvironment(path.join(runtimeRoot(), 'provenance-home')),
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      terminateTree(child)
      if (!settled) { settled = true; reject(new Error('npm publisher verification timed out')) }
    }, timeoutMs)
    child.stdout.on('data', (data) => { stdout += String(data); if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000) })
    child.stderr.on('data', (data) => { stderr += String(data); if (stderr.length > 500_000) stderr = stderr.slice(-500_000) })
    child.once('error', (error) => {
      clearTimeout(timer)
      if (!settled) { settled = true; reject(error) }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`npm publisher verification failed (${code}): ${stderr.slice(-4000)} ${stdout.slice(-4000)}`))
    })
  })
}

function decodedProvenancePayloads(value, out = []) {
  if (!value || typeof value !== 'object') return out
  if (value.dsseEnvelope && typeof value.dsseEnvelope.payload === 'string') {
    try {
      const decoded = Buffer.from(value.dsseEnvelope.payload, 'base64').toString('utf8')
      out.push(decodeURIComponent(decoded))
    } catch (_) { /* invalid payload is simply not accepted */ }
  }
  if (Array.isArray(value)) {
    for (const item of value) decodedProvenancePayloads(item, out)
  } else {
    for (const item of Object.values(value)) decodedProvenancePayloads(item, out)
  }
  return out
}

async function verifyOfficialGitHubRelease(release) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'DSH-Desktop-Runtime-Updater/0.9.2',
    'x-github-api-version': '2022-11-28',
  }
  const releaseBody = await fetchJson(officialReleaseApiUrl(release.version), { method: 'GET', headers }, 2 * 1024 * 1024)
  const normalizedRelease = normalizeOfficialGitHubRelease(releaseBody, release.version)
  const sourceBody = await fetchJson(officialSourcePackageApiUrl(release.version), { method: 'GET', headers }, 1024 * 1024)
  normalizeOfficialSourcePackage(sourceBody, release.version)
  appendLog(`verified immutable official GitHub release ${normalizedRelease.tag} source=${EXPECTED_REPOSITORY}`)
  return normalizedRelease
}

async function verifyRuntimeProvenance(release, installed) {
  if (!installed || installed.repository !== EXPECTED_REPOSITORY) {
    throw new Error('installed DSH repository identity does not match expected publisher source')
  }

  const keysBody = await fetchJson(REGISTRY_KEYS_URL, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': 'DSH-Desktop-Runtime-Updater/0.9.2',
    },
  }, 512 * 1024)
  const signature = verifyNpmRegistrySignature(release, keysBody)
  const upstream = await verifyOfficialGitHubRelease(release)
  appendLog(`verified exact npm Registry ECDSA key=${signature.keyid} + immutable GitHub release ${upstream.tag} source=${EXPECTED_REPOSITORY}${release.attestations ? ' provenance-metadata-present' : ''}`)
  return true
}

async function installOfficialVersion(release, options = {}) {
  if (!release || !isSafeVersion(release.version)) throw new Error('invalid runtime release')
  if (release.deprecated) throw new Error(`官方包已标记 deprecated：${release.deprecated}`)
  if (release.lifecycleScripts) throw new Error('官方 DSH 包声明了安装期脚本，自动更新已阻止。')

  const existing = validateInstalledVersion(release.version)
  if (existing && !options.forceReinstall) return existing
  const root = versionDir(release.version)
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'dsh-desktop-managed-runtime',
    private: true,
    version: '0.0.0',
  }, null, 2), 'utf8')

  const pnpm = pnpmBinPath()
  if (!fs.existsSync(pnpm)) throw new Error('bundled pnpm is missing')
  appendLog(`install ${PACKAGE_NAME}@${release.version} from official npm registry`)
  try {
    await runCaptured([
      pnpm,
      'add',
      '--save-prod',
      '--save-exact',
      '--ignore-scripts',
      `--registry=${REGISTRY_ORIGIN}/`,
      `${PACKAGE_NAME}@${release.version}`,
    ], {
      cwd: root,
      env: runtimeEnvironment(path.join(runtimeRoot(), 'install-home')),
    }, 180000)
  } catch (err) {
    const detail = String(err && err.message ? err.message : err)
    const windowsElectronCleanupExit = process.platform === 'win32'
      && /process failed \(2147483651\)/.test(detail)
      && /Done in [0-9.]+s using pnpm v[0-9.]+/.test(detail)
    if (!windowsElectronCleanupExit) throw err
    appendLog('pnpm reported Windows/Electron 0x80000003 after Done; continuing only to strict package/lock/publisher validation')
  }

  const installed = validateInstalledVersion(release.version)
  if (!installed) {
    fs.rmSync(root, { recursive: true, force: true })
    throw new Error('installed DSH runtime package identity/version validation failed')
  }
  const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8')
  if (!lock.includes(release.integrity)) {
    fs.rmSync(root, { recursive: true, force: true })
    throw new Error('pnpm lock integrity does not match official registry metadata')
  }

  // Authenticity must be independently verified before candidate JavaScript is
  // ever executed by --version or dsh web. Integrity from the same npm metadata
  // is not treated as an independent publisher identity.
  await verifyRuntimeProvenance(release, installed)
  const smokeHome = path.join(runtimeRoot(), 'smoke-home', `${release.version}-${Date.now()}`)
  await probeDshBin(installed.bin, smokeHome)
  // Do not recursively remove DSH_HOME here. DSH profiles may contain Windows
  // directory junctions back into the managed runtime. Recursive cleanup can
  // cross those junctions and delete the verified runtime itself. The probe
  // profile contains only small metadata and is intentionally retained.
  appendLog(`isolated smoke passed for ${release.version}; probe home retained at ${smokeHome}`)
  return installed
}

function markBlocked(state, version, reason) {
  state.blockedVersions[version] = {
    at: new Date().toISOString(),
    reason: String(reason || 'blocked').slice(0, 1000),
  }
}

async function activatePendingVersion(state) {
  if (!state.pendingVersion) return false
  const pending = validateInstalledVersion(state.pendingVersion)
  if (!pending) {
    markBlocked(state, state.pendingVersion, 'pending runtime files are missing or invalid')
    state.pendingVersion = null
    saveState(state)
    return false
  }
  appendLog(`preflight pending runtime ${pending.version} against current DSH_HOME`)
  try {
    await probeDshBin(pending.bin, dshHomeDir())
  } catch (err) {
    markBlocked(state, pending.version, `profile compatibility probe failed: ${err.message}`)
    state.pendingVersion = null
    state.lastError = `DSH ${pending.version} 激活前兼容性测试失败，已保留旧版本。`
    saveState(state)
    appendLog(`rollback pending ${pending.version}: ${err.message}`)
    return false
  }
  const previous = state.activeVersion && validateInstalledVersion(state.activeVersion) ? state.activeVersion : null
  state.previousVersion = previous
  state.activeVersion = pending.version
  state.pendingVersion = null
  state.lastUpdateAt = new Date().toISOString()
  state.lastError = null
  saveState(state)
  appendLog(`activated runtime ${state.activeVersion}; previous=${previous || `bundled@${bundledDshVersion()}`}`)
  return true
}

async function prepareRuntimeBeforeBoot() {
  ensureDirs()
  const state = loadState()
  try {
    await activatePendingVersion(state)
  } catch (err) {
    state.lastError = `Runtime 激活检查失败：${err.message}`
    saveState(state)
    appendLog(state.lastError)
  }

  const refreshed = loadState()
  const active = refreshed.activeVersion ? validateInstalledVersion(refreshed.activeVersion) : null
  if (refreshed.activeVersion && !active) {
    refreshed.lastError = `已激活 Runtime ${refreshed.activeVersion} 文件无效，已回退内置版本。`
    refreshed.activeVersion = null
    saveState(refreshed)
  }
  if (active) {
    sessionDshBin = active.bin
    sessionVersion = active.version
  } else {
    sessionDshBin = bundledDshBinPath()
    sessionVersion = bundledDshVersion()
  }
  appendLog(`boot runtime source=${currentRuntimeDescriptor().source} version=${sessionVersion}`)
  return currentRuntimeDescriptor()
}

function notify(title, body) {
  try {
    if (!app.isReady() || !Notification.isSupported()) return
    new Notification({ title, body }).show()
  } catch (err) {
    // notifications are best-effort
  }
}

async function checkAndStageUpdate(options = {}) {
  if (updateInFlight) return updateInFlight
  updateInFlight = (async () => {
    ensureDirs()
    const settings = updateSettings()
    const state = loadState()
    if (!options.force && !settings.autoUpdate) return { status: 'disabled', current: sessionVersion }
    if (!options.force && !shouldCheck(state.lastCheckedAt, Date.now(), CHECK_INTERVAL_MS)) {
      return { status: 'fresh', current: sessionVersion, latest: state.latestVersion }
    }

    state.lastCheckedAt = new Date().toISOString()
    try {
      const release = await fetchOfficialRelease(settings.channel)
      state.latestVersion = release.version
      saveState(state)
      const current = sessionVersion
      if (!options.forceVersion && compareVersions(release.version, current) <= 0) {
        state.lastError = null
        saveState(state)
        appendLog(`no update: current=${current} latest=${release.version}`)
        return { status: 'current', current, latest: release.version }
      }
      if (!options.forceVersion && state.blockedVersions[release.version]) {
        return { status: 'blocked', current, latest: release.version, reason: state.blockedVersions[release.version].reason }
      }

      let vulnerabilities
      try {
        vulnerabilities = await queryOsv(release.version)
      } catch (err) {
        throw new Error(`OSV 安全检查不可用，自动更新按 fail-closed 阻止：${err.message}`)
      }
      if (vulnerabilities.length > 0) {
        const reason = `OSV 已知漏洞：${vulnerabilities.join(', ')}`
        markBlocked(state, release.version, reason)
        state.lastError = reason
        saveState(state)
        notify('DSH Runtime 更新已阻止', `${release.version} 命中已知漏洞，继续使用 ${current}。`)
        return { status: 'blocked', current, latest: release.version, vulnerabilities }
      }

      const installed = await installOfficialVersion(release, { forceReinstall: Boolean(options.forceReinstall) })
      state.pendingVersion = installed.version
      state.lastError = null
      saveState(state)
      appendLog(`staged runtime ${installed.version}; activation deferred until next safe boot`)
      if (!options.silent) {
        notify('DSH Runtime 已验证', `${installed.version} 已安全下载并通过启动测试，将在下次启动 DSH Desktop 时启用。`)
      }
      return { status: 'staged', current, latest: release.version, integrity: release.integrity }
    } catch (err) {
      state.lastError = String(err && err.message ? err.message : err).slice(0, 1500)
      saveState(state)
      appendLog(`update check failed: ${state.lastError}`)
      return { status: 'error', current: sessionVersion, error: state.lastError }
    }
  })()
  try {
    return await updateInFlight
  } finally {
    updateInFlight = null
  }
}

function scheduleAutoUpdate() {
  if (scheduledTimer) return
  const settings = updateSettings()
  if (!settings.autoUpdate) return
  scheduledTimer = setTimeout(() => {
    scheduledTimer = null
    checkAndStageUpdate().catch((err) => appendLog(`scheduled update failed: ${err.message}`))
  }, 6000)
  if (typeof scheduledTimer.unref === 'function') scheduledTimer.unref()
}

async function runUpdaterSmoke() {
  ensureDirs()
  appendLog('runtime updater smoke started')
  const release = await fetchOfficialRelease('stable')
  const vulns = await queryOsv(release.version)
  if (vulns.length > 0) throw new Error(`official DSH ${release.version} has OSV findings: ${vulns.join(', ')}`)
  const installed = await installOfficialVersion(release, { forceReinstall: true })
  const state = loadState()
  state.pendingVersion = installed.version
  state.latestVersion = release.version
  state.lastCheckedAt = new Date().toISOString()
  saveState(state)
  const activated = await activatePendingVersion(state)
  if (!activated) {
    const failed = loadState()
    const reason = failed.lastError || (failed.blockedVersions[release.version] && failed.blockedVersions[release.version].reason) || 'unknown activation failure'
    throw new Error(`runtime smoke failed to activate ${release.version}: ${reason}`)
  }
  const finalState = loadState()
  const active = validateInstalledVersion(finalState.activeVersion)
  if (!active || active.version !== release.version) throw new Error('runtime smoke active version mismatch')
  sessionDshBin = active.bin
  sessionVersion = active.version
  appendLog(`runtime updater smoke passed version=${active.version}`)
  return {
    ok: true,
    version: active.version,
    bundledVersion: bundledDshVersion(),
    integrity: release.integrity,
    stateFile: stateFile(),
  }
}

module.exports = {
  bundledDshBinPath,
  bundledDshVersion,
  checkAndStageUpdate,
  currentRuntimeDescriptor,
  loadState,
  patchDshSpawn,
  prepareRuntimeBeforeBoot,
  runUpdaterSmoke,
  runtimeRoot,
  scheduleAutoUpdate,
  stateFile,
  validateInstalledVersion,
  verifyRuntimeProvenance,
}
