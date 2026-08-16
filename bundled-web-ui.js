'use strict'

const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const WEB_PROFILE = 'web'
const BUNDLED_PACKAGE = '@linxin666/dsh-skins'
const BUNDLED_VERSION = '0.1.18'
const SKIN_CENTER_PACKAGE = '@linxin666/dsh-client-ui-skin-center'
const SKIN_CENTER_VERSION = '0.1.18'

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

function bundledSkinCenterDir() {
  return physicalNodeModulePath('@linxin666', 'dsh-client-ui-skin-center')
}

function dshHomeDir() {
  return path.join(app.getPath('userData'), 'dsh-home')
}

function webProfileDir() {
  return path.join(dshHomeDir(), 'profiles', WEB_PROFILE)
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
    // Everything reconciled here is already inside the installer. Never turn
    // desktop startup into an implicit registry download.
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

function profilePackageFile() {
  return path.join(webProfileDir(), 'package.json')
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

function readProfilePackage() {
  const profilePackage = readJson(profilePackageFile())
  return profilePackage && typeof profilePackage === 'object' ? profilePackage : null
}

function profileDependencyFor(packageName, profilePackage = readProfilePackage()) {
  if (!profilePackage) return null
  for (const key of ['dependencies', 'optionalDependencies', 'devDependencies']) {
    const deps = profilePackage[key]
    if (deps && typeof deps[packageName] === 'string') return deps[packageName]
  }
  return null
}

function profileDependency(profilePackage = readProfilePackage()) {
  return profileDependencyFor(BUNDLED_PACKAGE, profilePackage)
}

function profileHasBundle(profilePackage = readProfilePackage()) {
  const bundles = profilePackage && profilePackage.dsh && profilePackage.dsh.profile && profilePackage.dsh.profile.bundles
  return Array.isArray(bundles) && bundles.includes(BUNDLED_PACKAGE)
}

function validatePackage(dir, expectedName, expectedVersion, missingMessage) {
  const pkg = readJson(path.join(dir, 'package.json'))
  if (!pkg || pkg.name !== expectedName) throw new Error(missingMessage)
  if (pkg.version !== expectedVersion) {
    throw new Error(`内置包版本异常：${expectedName} 期望 ${expectedVersion}，实际 ${pkg.version || 'unknown'}。`)
  }
  return dir
}

function validateBundledPackage() {
  const dir = validatePackage(
    bundledPackageDir(),
    BUNDLED_PACKAGE,
    BUNDLED_VERSION,
    '内置皮肤包缺失，请重新安装 DSH Desktop。',
  )
  const skinsDir = path.join(dir, 'skins')
  if (!fs.existsSync(skinsDir) || fs.readdirSync(skinsDir).length === 0) {
    throw new Error('内置皮肤资产缺失，请重新安装 DSH Desktop。')
  }
  validatePackage(
    bundledSkinCenterDir(),
    SKIN_CENTER_PACKAGE,
    SKIN_CENTER_VERSION,
    '内置 Skin Center 依赖缺失，请重新安装 DSH Desktop。',
  )
  return dir
}

function runCaptured(commandArgs, options, failurePrefix) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, options)
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
      reject(new Error(`${failurePrefix}（退出码 ${code === null ? 'null' : code}${signal ? `，${signal}` : ''}）：${output.slice(-3000)}`))
    })
  })
}

function runDshPluginAdd(linkSpec) {
  const bin = dshBinPath()
  if (!fs.existsSync(bin)) return Promise.reject(new Error('内置 DSH CLI 缺失，请重新安装 DSH Desktop。'))
  fs.mkdirSync(dshHomeDir(), { recursive: true })
  return runCaptured(
    ['--expose-internals', bin, 'plugin', '--profile', WEB_PROFILE, 'add', linkSpec],
    {
      cwd: app.getPath('home'),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: pluginEnvironment(),
    },
    '内置皮肤注册失败',
  )
}

function runProfileDependencyLink(linkSpec) {
  const pnpm = pnpmBinPath()
  if (!fs.existsSync(pnpm)) return Promise.reject(new Error('内置 pnpm 运行时缺失，请重新安装 DSH Desktop。'))
  fs.mkdirSync(webProfileDir(), { recursive: true })
  return runCaptured(
    [pnpm, 'add', '--save-prod', '--offline', linkSpec],
    {
      cwd: webProfileDir(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: pluginEnvironment(),
    },
    '内置 Skin Center 依赖固定失败',
  )
}

async function ensureBundledWebUi() {
  const dir = validateBundledPackage()
  const linkSpec = normalizedLinkSpec(dir)
  const skinCenterLinkSpec = normalizedLinkSpec(bundledSkinCenterDir())
  let profilePackage = readProfilePackage()
  const existing = profileDependency(profilePackage)
  const state = readJson(stateFile())
  const desktopManaged = Boolean(state && state.managedByDesktop)

  // Never replace an explicit user-managed dsh-skins registry or different
  // local link. Desktop owns only the exact bundle link it recorded itself.
  if (existing && existing !== linkSpec && !desktopManaged) {
    appendLog(`skip: ${BUNDLED_PACKAGE} is user-managed (${existing})`)
    return { status: 'user-managed', dependency: existing }
  }

  const bundleReady = existing === linkSpec && profileHasBundle(profilePackage)
  if (!bundleReady) {
    appendLog(`reconcile bundle: ${BUNDLED_PACKAGE}@${BUNDLED_VERSION} -> ${linkSpec}`)
    await runDshPluginAdd(linkSpec)
    profilePackage = readProfilePackage()
    const afterBundle = profileDependency(profilePackage)
    if (afterBundle !== linkSpec) {
      throw new Error(`内置皮肤已执行安装，但 web profile 未记录预期的本地链接：${String(afterBundle)}。`)
    }
    if (!profileHasBundle(profilePackage)) {
      throw new Error(`内置皮肤已写入依赖，但 ${BUNDLED_PACKAGE} 未进入 web profile bundle 层。`)
    }
  }

  // dsh-skins' bundle patch refers to Skin Center by package name. A pnpm
  // link: dependency does not install the linked package's own dependencies
  // into the consumer profile, so a restart can otherwise leave the loader
  // unable to resolve @linxin666/dsh-client-ui-skin-center. Persist that
  // already-packaged dependency as its own local profile link, but do NOT add
  // it to dsh.profile.bundles (dsh-skins already owns activation via its patch).
  profilePackage = readProfilePackage()
  const existingSkinCenter = profileDependencyFor(SKIN_CENTER_PACKAGE, profilePackage)
  const skinCenterWasDesktopManaged = Boolean(state && state.skinCenterManagedByDesktop)
  if (!existingSkinCenter || (skinCenterWasDesktopManaged && existingSkinCenter !== skinCenterLinkSpec)) {
    appendLog(`reconcile dependency: ${SKIN_CENTER_PACKAGE}@${SKIN_CENTER_VERSION} -> ${skinCenterLinkSpec}`)
    await runProfileDependencyLink(skinCenterLinkSpec)
    profilePackage = readProfilePackage()
  } else if (existingSkinCenter !== skinCenterLinkSpec) {
    appendLog(`keep: ${SKIN_CENTER_PACKAGE} is user-managed (${existingSkinCenter})`)
  }

  const after = profileDependency(profilePackage)
  const afterSkinCenter = profileDependencyFor(SKIN_CENTER_PACKAGE, profilePackage)
  if (after !== linkSpec || !profileHasBundle(profilePackage)) {
    throw new Error('内置皮肤 Profile 状态在依赖固定后失效。')
  }
  if (!afterSkinCenter) {
    throw new Error(`${SKIN_CENTER_PACKAGE} 未写入 web profile，重启后将无法解析 Skin Center。`)
  }

  const next = {
    managedByDesktop: true,
    package: BUNDLED_PACKAGE,
    version: BUNDLED_VERSION,
    linkSpec,
    skinCenterPackage: SKIN_CENTER_PACKAGE,
    skinCenterVersion: SKIN_CENTER_VERSION,
    skinCenterManagedByDesktop: afterSkinCenter === skinCenterLinkSpec,
    skinCenterLinkSpec: afterSkinCenter === skinCenterLinkSpec ? skinCenterLinkSpec : null,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(stateFile(), JSON.stringify(next, null, 2), 'utf8')
  appendLog(`ready: ${BUNDLED_PACKAGE}@${BUNDLED_VERSION}; ${SKIN_CENTER_PACKAGE}=${afterSkinCenter}`)

  const unchanged = bundleReady && existingSkinCenter === afterSkinCenter && afterSkinCenter === skinCenterLinkSpec
  return { status: unchanged ? 'ready' : 'installed', dependency: after, skinCenterDependency: afterSkinCenter }
}

module.exports = {
  BUNDLED_PACKAGE,
  BUNDLED_VERSION,
  SKIN_CENTER_PACKAGE,
  SKIN_CENTER_VERSION,
  bundledPackageDir,
  bundledSkinCenterDir,
  ensureBundledWebUi,
}
