'use strict'

const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const WEB_PROFILE = 'web'
const BUNDLED_PACKAGE = '@linxin666/dsh-skins'
const BUNDLED_VERSION = '0.1.18'

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

function bundledPackageDir() {
  return physicalNodeModulePath('@linxin666', 'dsh-skins')
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
  if (!fs.existsSync(pnpm)) throw new Error('内置 pnpm 运行时缺失，请重新安装 DSH Desktop。')

  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'node.cmd'), `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${exe}" %*\r\n`, 'utf8')
    fs.writeFileSync(path.join(dir, 'pnpm.cmd'), `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${exe}" "${pnpm}" %*\r\n`, 'utf8')
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
    // This operation must be completely offline: the selected skin bundle is
    // physically shipped inside DSH Desktop and linked into the web profile.
    npm_config_offline: 'true',
    npm_config_prefer_offline: 'true',
  })
}

function stateFile() {
  return path.join(dshHomeDir(), 'desktop-bundled-web-ui.json')
}

function logFile() {
  return path.join(app.getPath('userData'), 'bundled-web-ui.log')
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { return null }
}

function appendLog(message) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch (err) {
    // best-effort diagnostics only
  }
}

function normalizedLinkSpec(dir) {
  const normalized = process.platform === 'win32' ? dir.replace(/\\/g, '/') : dir
  return `link:${normalized}`
}

function profileDependency() {
  const profilePackage = readJson(path.join(dshHomeDir(), 'profiles', WEB_PROFILE, 'package.json'))
  if (!profilePackage || typeof profilePackage !== 'object') return null
  for (const key of ['dependencies', 'optionalDependencies', 'devDependencies']) {
    const deps = profilePackage[key]
    if (deps && typeof deps[BUNDLED_PACKAGE] === 'string') return deps[BUNDLED_PACKAGE]
  }
  return null
}

function validateBundledPackage() {
  const dir = bundledPackageDir()
  const pkg = readJson(path.join(dir, 'package.json'))
  if (!pkg || pkg.name !== BUNDLED_PACKAGE) throw new Error('内置皮肤包缺失，请重新安装 DSH Desktop。')
  if (pkg.version !== BUNDLED_VERSION) {
    throw new Error(`内置皮肤包版本异常：期望 ${BUNDLED_VERSION}，实际 ${pkg.version || 'unknown'}。`)
  }
  const skinsDir = path.join(dir, 'skins')
  if (!fs.existsSync(skinsDir) || fs.readdirSync(skinsDir).length === 0) {
    throw new Error('内置皮肤资产缺失，请重新安装 DSH Desktop。')
  }
  return dir
}

function runDshPluginAdd(linkSpec) {
  return new Promise((resolve, reject) => {
    const bin = dshBinPath()
    if (!fs.existsSync(bin)) return reject(new Error('内置 DSH CLI 缺失，请重新安装 DSH Desktop。'))
    fs.mkdirSync(dshHomeDir(), { recursive: true })
    const child = spawn(
      process.execPath,
      ['--expose-internals', bin, 'plugin', '--profile', WEB_PROFILE, 'add', linkSpec],
      {
        cwd: app.getPath('home'),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: pluginEnvironment(),
      },
    )
    let output = ''
    const collect = (data) => {
      output += String(data)
      if (output.length > 120000) output = output.slice(-120000)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) return resolve(output)
      reject(new Error(`内置皮肤注册失败（退出码 ${code === null ? 'null' : code}${signal ? `，${signal}` : ''}）：${output.slice(-3000)}`))
    })
  })
}

async function ensureBundledWebUi() {
  const dir = validateBundledPackage()
  const linkSpec = normalizedLinkSpec(dir)
  const existing = profileDependency()
  const state = readJson(stateFile())

  // Respect an explicit user-managed registry/link installation. Desktop only
  // owns entries it originally installed as its bundled local link.
  if (existing && !existing.startsWith('link:') && !(state && state.managedByDesktop)) {
    appendLog(`skip: ${BUNDLED_PACKAGE} is user-managed (${existing})`)
    return { status: 'user-managed', dependency: existing }
  }

  if (
    existing === linkSpec &&
    state &&
    state.managedByDesktop === true &&
    state.version === BUNDLED_VERSION &&
    state.linkSpec === linkSpec
  ) {
    return { status: 'ready', dependency: existing }
  }

  appendLog(`reconcile: ${BUNDLED_PACKAGE}@${BUNDLED_VERSION} -> ${linkSpec}`)
  await runDshPluginAdd(linkSpec)
  const after = profileDependency()
  if (!after || !after.startsWith('link:')) {
    throw new Error(`内置皮肤已执行安装但 web profile 未记录 ${BUNDLED_PACKAGE}。`)
  }
  const next = {
    managedByDesktop: true,
    package: BUNDLED_PACKAGE,
    version: BUNDLED_VERSION,
    linkSpec,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(stateFile(), JSON.stringify(next, null, 2), 'utf8')
  appendLog(`ready: ${BUNDLED_PACKAGE}@${BUNDLED_VERSION}`)
  return { status: 'installed', dependency: after }
}

module.exports = {
  BUNDLED_PACKAGE,
  BUNDLED_VERSION,
  bundledPackageDir,
  ensureBundledWebUi,
}
