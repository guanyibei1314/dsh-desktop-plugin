'use strict'

const $ = (id) => document.getElementById(id)
let snapshot = null
let busy = false

function fmtTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function setBusy(value) {
  busy = value
  for (const id of ['save', 'check', 'rollback', 'restart', 'folder']) $(id).disabled = value
}

function blockedSummary(state) {
  const entries = Object.entries((state && state.blockedVersions) || {})
  if (!entries.length) return '无'
  const latest = entries.sort((a, b) => String((b[1] && b[1].at) || '').localeCompare(String((a[1] && a[1].at) || '')))[0]
  return `${entries.length} 个；最近 ${latest[0]}`
}

function statusText(status) {
  if (!status) return '状态未知'
  const state = status.state || {}
  if (state.pendingVersion) return `Runtime ${state.pendingVersion} 已验证并暂存，重启后会用真实 Profile 做最终兼容性预检。`
  if (state.lastError) return '最近一次 Runtime 操作存在错误，当前仍使用已验证版本。'
  if (Object.keys(state.blockedVersions || {}).length > 0) return '存在被安全策略阻止的 Runtime 版本；当前已验证 Runtime 不受影响。'
  if (state.latestVersion && status.current && state.latestVersion === status.current.version) return '当前 Runtime 已是最近一次检查到的版本。'
  return 'Runtime 更新系统正常。'
}

function render(status) {
  snapshot = status
  const current = status.current || {}
  const state = status.state || {}
  const settings = status.settings || { stored: {}, effective: {}, overrides: {} }
  $('current').textContent = `${current.version || '—'}${current.source ? ` (${current.source})` : ''}`
  $('bundled').textContent = current.bundledVersion || '—'
  $('latest').textContent = state.latestVersion || '—'
  $('pending').textContent = state.pendingVersion || '—'
  $('previous').textContent = state.previousVersion || '—'
  $('blocked').textContent = blockedSummary(state)
  $('checked').textContent = fmtTime(state.lastCheckedAt)
  $('updated').textContent = fmtTime(state.lastUpdateAt)
  $('channel').value = settings.stored.channel || 'stable'
  $('autoUpdate').checked = settings.stored.autoUpdate !== false
  $('rollback').disabled = busy || !status.rollbackTarget

  const overrides = []
  if (settings.overrides.channel) overrides.push(`更新通道被环境变量强制为 ${settings.effective.channel}`)
  if (settings.overrides.autoUpdate) overrides.push(`自动更新被环境变量覆盖为 ${settings.effective.autoUpdate ? '开启' : '关闭'}`)
  $('override').textContent = overrides.length ? `注意：${overrides.join('；')}。界面设置会保存，但当前进程以环境变量为准。` : ''

  const statusBox = $('status')
  statusBox.textContent = statusText(status)
  const blocked = Object.keys(state.blockedVersions || {}).length > 0
  statusBox.className = `status ${state.lastError ? 'err' : (state.pendingVersion || blocked) ? 'warn' : 'ok'}`
  $('error').textContent = state.lastError || ''

  const versions = $('versions')
  versions.replaceChildren()
  const list = Array.isArray(status.managedVersions) ? status.managedVersions : []
  if (!list.length) {
    const li = document.createElement('li')
    li.textContent = '当前没有独立 managed Runtime；正在使用安装包兜底 Runtime。'
    versions.appendChild(li)
  } else {
    for (const item of list) {
      const roles = []
      if (item.version === state.activeVersion) roles.push('active')
      if (item.version === state.previousVersion) roles.push('previous')
      if (item.version === state.pendingVersion) roles.push('pending')
      const li = document.createElement('li')
      li.textContent = `${item.version}${roles.length ? ` — ${roles.join(', ')}` : ''}`
      versions.appendChild(li)
    }
  }
}

async function refresh() {
  try {
    render(await window.runtimeSettings.getStatus())
  } catch (err) {
    $('status').className = 'status err'
    $('status').textContent = '读取 Runtime 状态失败。'
    $('error').textContent = err && err.message ? err.message : String(err)
  }
}

async function run(action, successText) {
  if (busy) return
  setBusy(true)
  $('error').textContent = ''
  try {
    const response = await action()
    if (response && response.status) render(response.status)
    else await refresh()
    if (successText) $('status').textContent = successText(response)
  } catch (err) {
    $('status').className = 'status err'
    $('status').textContent = '操作失败。'
    $('error').textContent = err && err.message ? err.message : String(err)
  } finally {
    setBusy(false)
    if (snapshot) $('rollback').disabled = !snapshot.rollbackTarget
  }
}

$('save').addEventListener('click', () => run(
  () => window.runtimeSettings.save({ channel: $('channel').value, autoUpdate: $('autoUpdate').checked }),
  () => 'Runtime 更新设置已保存。',
))

$('check').addEventListener('click', () => run(
  () => window.runtimeSettings.checkNow(),
  (response) => {
    const result = response && response.result ? response.result : {}
    if (result.status === 'staged') return `Runtime ${result.latest} 已下载并通过隔离启动测试，重启后完成最终激活预检。`
    if (result.status === 'current') return `当前已是最新版本 ${result.current}。`
    if (result.status === 'blocked') return `版本 ${result.latest || '未知'} 被安全策略阻止，当前版本保持不变。`
    if (result.status === 'error') return '检查失败，当前 Runtime 保持不变。'
    return `检查完成：${result.status || 'done'}`
  },
))

$('rollback').addEventListener('click', () => run(
  () => window.runtimeSettings.rollback(),
  (response) => {
    const result = response && response.result ? response.result : {}
    return result.ok ? `已安排回滚到 ${result.target}，重启后生效。` : (result.reason || '没有可回滚版本。')
  },
))

$('restart').addEventListener('click', () => window.runtimeSettings.restart())
$('folder').addEventListener('click', () => window.runtimeSettings.openFolder())

refresh()
