'use strict'

const bridge = window.pluginBridge
const search = document.getElementById('search')
const category = document.getElementById('category')
const sort = document.getElementById('sort')
const onlyInstalled = document.getElementById('onlyInstalled')
const onlyInstallable = document.getElementById('onlyInstallable')
const refreshMarket = document.getElementById('refreshMarket')
const cards = document.getElementById('cards')
const empty = document.getElementById('empty')
const output = document.getElementById('output')
const state = document.getElementById('state')
const profile = document.getElementById('profile')
const source = document.getElementById('source')
const count = document.getElementById('count')
const updated = document.getElementById('updated')
const restartBox = document.getElementById('restartBox')
const restart = document.getElementById('restart')
const cancel = document.getElementById('cancel')
const manualPackage = document.getElementById('manualPackage')
const manualInstall = document.getElementById('manualInstall')
const manualUpdate = document.getElementById('manualUpdate')
const manualRemove = document.getElementById('manualRemove')

let registry = { categories: {}, plugins: [], updated: '' }
let installed = new Set()
let running = false
let disposers = []
const securityResults = new Map()
const securityBusy = new Set()

function append(text) {
  if (output.textContent === '等待操作…') output.textContent = ''
  output.textContent += String(text || '')
  output.scrollTop = output.scrollHeight
}

function setRunning(value) {
  running = !!value
  state.textContent = running ? '运行中' : '空闲'
  cancel.disabled = !running
  refreshMarket.disabled = running
  manualPackage.disabled = running
  manualInstall.disabled = running
  manualUpdate.disabled = running
  manualRemove.disabled = running
  render()
}

function setRestart(value) {
  restartBox.classList.toggle('visible', !!value)
}

function categoryLabel(id) {
  const item = registry.categories && registry.categories[id]
  return (item && (item.zh || item.en)) || id || '其他'
}

function localizedDescription(plugin) {
  const desc = plugin && plugin.description
  return (desc && (desc.zh || desc.en)) || '暂无描述。'
}

function riskLabel(level) {
  const labels = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    critical: '严重风险',
    unknown: '无法评估',
  }
  return labels[level] || '未评估'
}

function rebuildCategories() {
  const selected = category.value
  while (category.options.length > 1) category.remove(1)
  const ids = new Set(registry.plugins.map((plugin) => plugin.category).filter(Boolean))
  for (const id of Array.from(ids).sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'zh-CN'))) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = categoryLabel(id)
    category.appendChild(option)
  }
  if (ids.has(selected)) category.value = selected
}

function visiblePlugins() {
  const query = search.value.trim().toLowerCase()
  const categoryValue = category.value
  let items = registry.plugins.filter((plugin) => {
    if (categoryValue && plugin.category !== categoryValue) return false
    if (onlyInstalled.checked && (!plugin.packageName || !installed.has(plugin.packageName))) return false
    if (onlyInstallable.checked && !plugin.installable) return false
    if (!query) return true
    const haystack = [
      plugin.name,
      plugin.packageName,
      plugin.owner,
      categoryLabel(plugin.category),
      localizedDescription(plugin),
    ].join('\n').toLowerCase()
    return haystack.includes(query)
  })

  if (sort.value === 'name') {
    items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  } else if (sort.value === 'newest') {
    items.sort((a, b) => String(b.added || '').localeCompare(String(a.added || '')) || (b.stars || 0) - (a.stars || 0))
  } else {
    items.sort((a, b) => (b.stars || 0) - (a.stars || 0) || String(b.added || '').localeCompare(String(a.added || '')))
  }
  return items
}

function makePill(text, className) {
  const span = document.createElement('span')
  span.className = `pill${className ? ` ${className}` : ''}`
  span.textContent = text
  return span
}

function makeButton(label, className, disabled, onClick) {
  const button = document.createElement('button')
  button.textContent = label
  if (className) button.className = className
  button.disabled = !!disabled
  button.addEventListener('click', onClick)
  return button
}

function appendSecurityBox(card, plugin) {
  if (!plugin.packageName) return
  const result = securityResults.get(plugin.packageName)
  if (!result) return
  const assessment = result.assessment || {}
  const box = document.createElement('div')
  box.className = 'security'
  const title = document.createElement('strong')
  const version = result.metadata && result.metadata.latestVersion ? ` · ${result.metadata.latestVersion}` : ''
  title.textContent = `安全预检：${riskLabel(assessment.level)} · ${assessment.score === undefined ? '--' : assessment.score}/100${version}`
  box.appendChild(title)

  const reasons = Array.isArray(assessment.reasons) ? assessment.reasons.slice(0, 4) : []
  if (reasons.length) {
    const list = document.createElement('ul')
    for (const reason of reasons) {
      const item = document.createElement('li')
      item.textContent = reason
      list.appendChild(item)
    }
    box.appendChild(list)
  } else {
    const note = document.createElement('div')
    note.textContent = '当前预检未发现显著风险信号。'
    box.appendChild(note)
  }
  card.appendChild(box)
}

function renderCard(plugin) {
  const isInstalled = !!plugin.packageName && installed.has(plugin.packageName)
  const security = plugin.packageName ? securityResults.get(plugin.packageName) : null
  const assessment = security && security.assessment
  const card = document.createElement('article')
  card.className = `card${isInstalled ? ' installed' : ''}${plugin.deprecated ? ' deprecated' : ''}`

  const head = document.createElement('div')
  head.className = 'card-head'
  const nameBox = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'title'
  title.textContent = plugin.name
  nameBox.appendChild(title)
  if (plugin.packageName) {
    const pkg = document.createElement('div')
    pkg.className = 'pkg'
    pkg.textContent = plugin.packageName
    nameBox.appendChild(pkg)
  }
  head.appendChild(nameBox)
  if (isInstalled) head.appendChild(makePill('已安装', 'ok'))
  else if (plugin.deprecated) head.appendChild(makePill('已弃用', 'warn'))
  card.appendChild(head)

  const desc = document.createElement('div')
  desc.className = 'desc'
  desc.textContent = localizedDescription(plugin)
  card.appendChild(desc)

  const meta = document.createElement('div')
  meta.className = 'card-meta'
  meta.appendChild(makePill(categoryLabel(plugin.category)))
  if (plugin.owner) meta.appendChild(makePill(`作者 ${plugin.owner}`))
  if (plugin.stars !== null && plugin.stars !== undefined) meta.appendChild(makePill(`★ ${plugin.stars}`))
  if (plugin.added) meta.appendChild(makePill(`收录 ${plugin.added}`))
  if (assessment) meta.appendChild(makePill(`安全 ${riskLabel(assessment.level)}`, `risk-${assessment.level}`))
  card.appendChild(meta)

  if (plugin.deprecated && plugin.replacement) {
    const deprecatedNote = document.createElement('div')
    deprecatedNote.className = 'hint'
    deprecatedNote.textContent = `该插件已弃用，建议改用：${plugin.replacement}`
    card.appendChild(deprecatedNote)
  }

  appendSecurityBox(card, plugin)

  const actions = document.createElement('div')
  actions.className = 'actions'
  if (!plugin.installable) {
    const note = document.createElement('span')
    note.className = 'note'
    note.textContent = '该条目没有安全的 npm 包名，桌面端暂不提供一键安装。'
    actions.appendChild(note)
  } else {
    const assessing = securityBusy.has(plugin.packageName)
    actions.appendChild(makeButton(assessing ? '评估中…' : '安全评估', '', running || assessing, () => assessPackage(plugin.packageName, true)))
    if (isInstalled) {
      actions.appendChild(makeButton('升级', '', running || assessing, () => runMarketAction('update', plugin.packageName)))
      actions.appendChild(makeButton('卸载', 'danger', running, () => runAction('remove', plugin.packageName)))
    } else {
      actions.appendChild(makeButton('安装', 'primary', running || assessing || plugin.deprecated, () => runMarketAction('install', plugin.packageName)))
    }
  }
  card.appendChild(actions)
  return card
}

function render() {
  const items = visiblePlugins()
  cards.textContent = ''
  const fragment = document.createDocumentFragment()
  for (const plugin of items) fragment.appendChild(renderCard(plugin))
  cards.appendChild(fragment)
  empty.classList.toggle('visible', items.length === 0)
  count.textContent = `${items.length} / ${registry.plugins.length} 个插件`
}

async function refreshInstalled(options = {}) {
  if (!bridge || running) return
  try {
    const result = await bridge.installed()
    installed = new Set(Array.isArray(result) ? result : [])
    if (options.log !== false) append(`\n已刷新本地插件：${installed.size} 个。\n`)
    render()
  } catch (error) {
    append(`\n读取已安装插件失败：${error && error.message ? error.message : String(error)}\n`)
  }
}

async function loadMarket() {
  if (!bridge) return
  refreshMarket.disabled = true
  source.textContent = '目录：刷新中…'
  source.className = 'badge'
  try {
    const result = await bridge.catalog()
    registry = (result && result.registry) || { categories: {}, plugins: [], updated: '' }
    securityResults.clear()
    rebuildCategories()
    if (result && result.source === 'live') {
      source.textContent = '目录：实时'
      source.className = 'badge live'
    } else if (result && result.source === 'cache') {
      source.textContent = '目录：离线缓存'
      source.className = 'badge cache'
      if (result.error) append(`\n实时目录不可用，已使用缓存：${result.error}\n`)
    } else {
      source.textContent = '目录：不可用'
      source.className = 'badge'
      if (result && result.error) append(`\n插件目录加载失败：${result.error}\n`)
    }
    updated.textContent = `更新时间：${registry.updated || '--'}`
    render()
  } catch (error) {
    source.textContent = '目录：不可用'
    source.className = 'badge'
    append(`\n插件目录加载失败：${error && error.message ? error.message : String(error)}\n`)
  } finally {
    refreshMarket.disabled = running
  }
}

async function assessPackage(packageName, logResult) {
  if (!bridge || running || securityBusy.has(packageName)) return securityResults.get(packageName) || null
  securityBusy.add(packageName)
  render()
  try {
    const result = await bridge.security(packageName)
    securityResults.set(packageName, result)
    if (logResult) {
      const assessment = result && result.assessment
      append(`\n[安全预检] ${packageName}: ${riskLabel(assessment && assessment.level)}，风险分 ${assessment && assessment.score !== undefined ? assessment.score : '--'}/100。\n`)
      if (assessment && Array.isArray(assessment.reasons)) {
        for (const reason of assessment.reasons.slice(0, 5)) append(`- ${reason}\n`)
      }
    }
    return result
  } catch (error) {
    const failed = {
      ok: false,
      assessment: {
        score: 100,
        level: 'unknown',
        blocked: true,
        requiresConfirmation: false,
        reasons: [`无法完成实时安全评估：${error && error.message ? error.message : String(error)}`],
      },
    }
    securityResults.set(packageName, failed)
    if (logResult) append(`\n[安全预检] ${packageName}: 无法评估，已阻止市场一键安装。\n`)
    return failed
  } finally {
    securityBusy.delete(packageName)
    render()
  }
}

async function securityGate(packageName) {
  // Always refresh immediately before an install/update. A previous green
  // badge is informational only and cannot be replayed to bypass the gate.
  securityResults.delete(packageName)
  const result = await assessPackage(packageName, true)
  const assessment = result && result.assessment
  if (!assessment || assessment.blocked) {
    append(`\n已阻止：${packageName} 未通过市场安全门禁。可查看风险原因；高级手动入口仍保留给明确了解风险的用户。\n`)
    return false
  }
  if (assessment.requiresConfirmation) {
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons.slice(0, 4).join('\n• ') : ''
    return window.confirm(`插件 ${packageName} 被评为高风险（${assessment.score}/100）。\n\n• ${reasons}\n\n仍要继续吗？`)
  }
  return true
}

async function runMarketAction(action, spec) {
  if (action === 'install' || action === 'update') {
    const allowed = await securityGate(spec)
    if (!allowed) return
  }
  return runAction(action, spec)
}

async function runAction(action, spec) {
  if (!bridge || running) return
  if (!spec) return
  if (output.textContent === '等待操作…') output.textContent = ''
  setRunning(true)
  const labels = { install: '安装', update: '升级', remove: '卸载' }
  append(`\n> ${labels[action] || action} ${spec}\n\n`)
  try {
    const result = await bridge.run(action, spec)
    if (result && result.needsRestart) setRestart(true)
    append(`\n完成${result && result.code !== undefined ? `（退出码 ${result.code}）` : ''}\n`)
  } catch (error) {
    append(`\n错误：${error && error.message ? error.message : String(error)}\n`)
  } finally {
    setRunning(false)
    await refreshInstalled({ log: false })
  }
}

function runManual(action) {
  const spec = manualPackage.value.trim()
  if (!spec) {
    append('\n请输入插件包名。\n')
    return
  }
  runAction(action, spec)
}

for (const element of [search, category, sort, onlyInstalled, onlyInstallable]) {
  element.addEventListener(element.tagName === 'INPUT' && element.type === 'text' ? 'input' : 'change', render)
}
refreshMarket.addEventListener('click', loadMarket)
cancel.addEventListener('click', () => bridge && bridge.cancel())
restart.addEventListener('click', () => bridge && bridge.restart())
manualInstall.addEventListener('click', () => runManual('install'))
manualUpdate.addEventListener('click', () => runManual('update'))
manualRemove.addEventListener('click', () => runManual('remove'))
manualPackage.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !running) runManual('install')
})

if (bridge) {
  disposers.push(bridge.onOutput((payload) => append(payload && payload.text)))
  disposers.push(bridge.onState((payload) => {
    setRunning(payload && payload.running)
    setRestart(payload && payload.needsRestart)
  }))
  bridge.status().then((statusValue) => {
    profile.textContent = `Profile: ${(statusValue && statusValue.profile) || 'web'}`
    setRunning(statusValue && statusValue.running)
    setRestart(statusValue && statusValue.needsRestart)
  }).catch((error) => append(`初始化失败：${error.message}\n`))

  Promise.all([loadMarket(), refreshInstalled({ log: false })]).catch((error) => append(`初始化失败：${error.message}\n`))
} else {
  append('插件桥接不可用。\n')
  setRunning(true)
}

window.addEventListener('beforeunload', () => {
  for (const dispose of disposers) {
    try { dispose() } catch (_) { /* ignore */ }
  }
  disposers = []
})
