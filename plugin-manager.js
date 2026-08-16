'use strict'

const bridge = window.pluginBridge
const packageInput = document.getElementById('package')
const output = document.getElementById('output')
const state = document.getElementById('state')
const profile = document.getElementById('profile')
const restartBox = document.getElementById('restartBox')
const install = document.getElementById('install')
const update = document.getElementById('update')
const remove = document.getElementById('remove')
const list = document.getElementById('list')
const cancel = document.getElementById('cancel')
const restart = document.getElementById('restart')
const actionButtons = [install, update, remove, list]

let running = false
let disposers = []

function append(text) {
  if (output.textContent === '等待操作…') output.textContent = ''
  output.textContent += String(text || '')
  output.scrollTop = output.scrollHeight
}

function setRunning(value) {
  running = !!value
  for (const button of actionButtons) button.disabled = running
  cancel.disabled = !running
  packageInput.disabled = running
  state.textContent = running ? '运行中' : '空闲'
}

function setRestart(value) {
  restartBox.classList.toggle('visible', !!value)
}

async function run(action) {
  if (!bridge || running) return
  const spec = packageInput.value.trim()
  if (action !== 'list' && !spec) {
    append('\n请输入插件包名。\n')
    return
  }
  output.textContent = ''
  setRunning(true)
  append(`> ${action === 'list' ? '刷新已安装插件' : action + ' ' + spec}\n\n`)
  try {
    const result = action === 'list' ? await bridge.list() : await bridge.run(action, spec)
    if (result && result.needsRestart) setRestart(true)
    append(`\n完成${result && result.code !== undefined ? `（退出码 ${result.code}）` : ''}\n`)
  } catch (error) {
    append(`\n错误：${error && error.message ? error.message : String(error)}\n`)
  } finally {
    setRunning(false)
  }
}

install.addEventListener('click', () => run('install'))
update.addEventListener('click', () => run('update'))
remove.addEventListener('click', () => run('remove'))
list.addEventListener('click', () => run('list'))
cancel.addEventListener('click', () => bridge && bridge.cancel())
restart.addEventListener('click', () => bridge && bridge.restart())
packageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !running) run('install')
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
  run('list')
} else {
  append('插件桥接不可用。\n')
  for (const button of actionButtons) button.disabled = true
}

window.addEventListener('beforeunload', () => {
  for (const dispose of disposers) {
    try { dispose() } catch (error) { /* ignore */ }
  }
  disposers = []
})
