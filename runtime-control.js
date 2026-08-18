'use strict'

const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const runtimeManager = require('./runtime-manager')

const AUTO_TICK_MS = 60 * 60 * 1000
const INITIAL_AUTO_TICK_MS = 6000
const SMOKE_PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000

let autoTimer = null

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { return fallback }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  try {
    fs.renameSync(tmp, file)
  } catch (err) {
    fs.copyFileSync(tmp, file)
    fs.rmSync(tmp, { force: true })
  }
}

function appendMaintenanceLog(message) {
  try {
    const root = runtimeManager.runtimeRoot()
    fs.mkdirSync(root, { recursive: true })
    fs.appendFileSync(path.join(root, 'runtime-update.log'), `${new Date().toISOString()} maintenance ${message}\n`, 'utf8')
  } catch (err) {
    // diagnostics are best-effort
  }
}

function storedSettings() {
  const raw = readJson(settingsFile(), {}) || {}
  return {
    channel: raw.dshRuntimeUpdateChannel === 'latest' ? 'latest' : 'stable',
    autoUpdate: raw.dshRuntimeAutoUpdate !== false,
  }
}

function effectiveSettings() {
  const stored = storedSettings()
  const envChannel = process.env.DSH_RUNTIME_CHANNEL
  const envAuto = process.env.DSH_RUNTIME_AUTO_UPDATE
  const channelOverridden = envChannel === 'stable' || envChannel === 'latest'
  const autoOverridden = ['0', '1', 'false', 'true'].includes(String(envAuto || '').toLowerCase())
  let channel = stored.channel
  if (channelOverridden) channel = envChannel
  let autoUpdate = stored.autoUpdate
  if (autoOverridden) autoUpdate = envAuto === '1' || String(envAuto).toLowerCase() === 'true'
  return {
    stored,
    effective: { channel, autoUpdate },
    overrides: { channel: channelOverridden, autoUpdate: autoOverridden },
  }
}

function saveSettings(patch) {
  const raw = readJson(settingsFile(), {}) || {}
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'channel')) {
    if (patch.channel !== 'stable' && patch.channel !== 'latest') throw new Error('Runtime 更新通道仅支持 stable/latest。')
    raw.dshRuntimeUpdateChannel = patch.channel
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'autoUpdate')) {
    if (typeof patch.autoUpdate !== 'boolean') throw new Error('自动更新开关必须是布尔值。')
    raw.dshRuntimeAutoUpdate = patch.autoUpdate
  }
  writeJsonAtomic(settingsFile(), raw)
  rescheduleAutoUpdates()
  appendMaintenanceLog(`settings saved channel=${raw.dshRuntimeUpdateChannel || 'stable'} auto=${raw.dshRuntimeAutoUpdate !== false}`)
  return getStatus()
}

function assertInside(target, boundary) {
  const root = path.resolve(boundary)
  const resolved = path.resolve(target)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error(`refusing to remove path outside runtime root: ${resolved}`)
}

function unlinkReparsePoint(target) {
  try {
    fs.unlinkSync(target)
  } catch (err) {
    if (process.platform === 'win32' && err && ['EPERM', 'EISDIR'].includes(err.code)) {
      fs.rmdirSync(target)
      return
    }
    throw err
  }
}

function safeRemoveTree(target, boundary) {
  assertInside(target, boundary)
  let stat
  try { stat = fs.lstatSync(target) } catch (err) {
    if (err && err.code === 'ENOENT') return false
    throw err
  }
  if (stat.isSymbolicLink()) {
    unlinkReparsePoint(target)
    return true
  }
  if (!stat.isDirectory()) {
    fs.unlinkSync(target)
    return true
  }
  for (const entry of fs.readdirSync(target)) safeRemoveTree(path.join(target, entry), boundary)
  fs.rmdirSync(target)
  return true
}

function cleanupSmokeProfiles(now = Date.now()) {
  const root = runtimeManager.runtimeRoot()
  const smokeRoot = path.join(root, 'smoke-home')
  if (!fs.existsSync(smokeRoot)) return { removed: [], kept: [] }
  const removed = []
  const kept = []
  for (const entry of fs.readdirSync(smokeRoot)) {
    const full = path.join(smokeRoot, entry)
    let stat
    try { stat = fs.lstatSync(full) } catch (err) { continue }
    const age = Math.max(0, now - stat.mtimeMs)
    if (age < SMOKE_PROFILE_MAX_AGE_MS) {
      kept.push(entry)
      continue
    }
    try {
      safeRemoveTree(full, smokeRoot)
      removed.push(entry)
    } catch (err) {
      appendMaintenanceLog(`smoke cleanup failed path=${entry} error=${err.message}`)
      kept.push(entry)
    }
  }
  if (removed.length > 0) appendMaintenanceLog(`removed old smoke profiles count=${removed.length} names=${removed.join(',')}`)
  return { removed, kept }
}

function listManagedVersions() {
  const root = path.join(runtimeManager.runtimeRoot(), 'versions')
  if (!fs.existsSync(root)) return []
  const versions = []
  for (const entry of fs.readdirSync(root)) {
    const validated = runtimeManager.validateInstalledVersion(entry)
    if (!validated) continue
    let stat = null
    try { stat = fs.statSync(path.join(root, entry)) } catch (err) { /* ignore */ }
    versions.push({ version: entry, updatedAt: stat ? new Date(stat.mtimeMs).toISOString() : null })
  }
  return versions.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

function cleanupManagedVersions() {
  const state = runtimeManager.loadState()
  const protectedVersions = new Set([state.activeVersion, state.previousVersion, state.pendingVersion].filter(Boolean))
  const root = path.join(runtimeManager.runtimeRoot(), 'versions')
  const removed = []
  const kept = []
  if (!fs.existsSync(root)) return { removed, kept }
  for (const entry of fs.readdirSync(root)) {
    if (protectedVersions.has(entry)) {
      kept.push(entry)
      continue
    }
    const full = path.join(root, entry)
    try {
      safeRemoveTree(full, root)
      removed.push(entry)
    } catch (err) {
      appendMaintenanceLog(`managed runtime cleanup failed version=${entry} error=${err.message}`)
      kept.push(entry)
    }
  }
  if (removed.length > 0) appendMaintenanceLog(`removed unused managed runtimes count=${removed.length} versions=${removed.join(',')}`)
  return { removed, kept }
}

function writeRuntimeState(state) {
  const file = runtimeManager.stateFile()
  const next = Object.assign({}, state, { schema: 1 })
  writeJsonAtomic(file, next)
}

function requestRollback() {
  const state = runtimeManager.loadState()
  const current = runtimeManager.currentRuntimeDescriptor()
  if (state.previousVersion && runtimeManager.validateInstalledVersion(state.previousVersion)) {
    state.pendingVersion = state.previousVersion
    state.lastError = null
    writeRuntimeState(state)
    appendMaintenanceLog(`rollback requested target=${state.pendingVersion}; activation deferred until restart`)
    return { ok: true, target: state.pendingVersion, requiresRestart: true }
  }
  if (state.activeVersion && runtimeManager.validateInstalledVersion(state.activeVersion)) {
    const outgoing = state.activeVersion
    state.activeVersion = null
    state.previousVersion = outgoing
    state.pendingVersion = null
    state.lastError = null
    writeRuntimeState(state)
    appendMaintenanceLog(`rollback requested target=bundled@${current.bundledVersion}; activation deferred until restart`)
    return { ok: true, target: current.bundledVersion, targetSource: 'bundled', requiresRestart: true }
  }
  return { ok: false, reason: '当前没有可回滚的上一版本。' }
}

async function checkNow() {
  return runtimeManager.checkAndStageUpdate({ force: true, silent: false })
}

function getStatus() {
  const state = runtimeManager.loadState()
  const current = runtimeManager.currentRuntimeDescriptor()
  const settings = effectiveSettings()
  const managedVersions = listManagedVersions()
  let rollbackTarget = null
  if (state.previousVersion && runtimeManager.validateInstalledVersion(state.previousVersion)) rollbackTarget = state.previousVersion
  else if (state.activeVersion) rollbackTarget = current.bundledVersion
  return {
    current: {
      version: current.version,
      source: current.source,
      bundledVersion: current.bundledVersion,
    },
    settings,
    state: {
      activeVersion: state.activeVersion,
      previousVersion: state.previousVersion,
      pendingVersion: state.pendingVersion,
      latestVersion: state.latestVersion,
      lastCheckedAt: state.lastCheckedAt,
      lastUpdateAt: state.lastUpdateAt,
      lastError: state.lastError,
      blockedVersions: state.blockedVersions || {},
    },
    rollbackTarget,
    managedVersions,
    runtimeRoot: runtimeManager.runtimeRoot(),
  }
}

function scheduleNext(delayMs) {
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = setTimeout(async () => {
    autoTimer = null
    const settings = effectiveSettings()
    if (!settings.effective.autoUpdate) return
    try {
      await runtimeManager.checkAndStageUpdate({ silent: true })
    } catch (err) {
      appendMaintenanceLog(`scheduled update failed error=${err.message}`)
    } finally {
      if (effectiveSettings().effective.autoUpdate) scheduleNext(AUTO_TICK_MS)
    }
  }, delayMs)
  if (typeof autoTimer.unref === 'function') autoTimer.unref()
}

function startAutoUpdates() {
  const settings = effectiveSettings()
  if (!settings.effective.autoUpdate) return
  if (!autoTimer) scheduleNext(INITIAL_AUTO_TICK_MS)
}

function rescheduleAutoUpdates() {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
  if (effectiveSettings().effective.autoUpdate) scheduleNext(1000)
}

function stopAutoUpdates() {
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = null
}

function runMaintenance() {
  const smoke = cleanupSmokeProfiles()
  const runtimes = cleanupManagedVersions()
  return { smoke, runtimes }
}

module.exports = {
  checkNow,
  cleanupManagedVersions,
  cleanupSmokeProfiles,
  effectiveSettings,
  getStatus,
  requestRollback,
  runMaintenance,
  safeRemoveTree,
  saveSettings,
  startAutoUpdates,
  stopAutoUpdates,
}
