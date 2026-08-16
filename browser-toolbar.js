'use strict'

const bridge = window.browserBridge
const form = document.getElementById('form')
const address = document.getElementById('address')
const back = document.getElementById('back')
const forward = document.getElementById('forward')
const reload = document.getElementById('reload')
const home = document.getElementById('home')
const external = document.getElementById('external')
let disposeState = null
let editing = false

function applyState(value) {
  const state = value || {}
  back.disabled = !state.canGoBack
  forward.disabled = !state.canGoForward
  reload.classList.toggle('loading', !!state.loading)
  if (!editing && state.url) address.value = state.url
  document.title = state.title ? `DSH Browser — ${state.title}` : 'DSH Browser'
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  if (bridge) bridge.navigate(address.value)
  address.blur()
})
address.addEventListener('focus', () => { editing = true; address.select() })
address.addEventListener('blur', () => { editing = false })
back.addEventListener('click', () => bridge && bridge.back())
forward.addEventListener('click', () => bridge && bridge.forward())
reload.addEventListener('click', () => bridge && bridge.reload())
home.addEventListener('click', () => bridge && bridge.home())
external.addEventListener('click', () => bridge && bridge.external())

if (bridge) disposeState = bridge.onState(applyState)
else {
  address.value = '浏览器桥接不可用'
  for (const button of [back, forward, reload, home, external]) button.disabled = true
}

window.addEventListener('beforeunload', () => {
  if (disposeState) disposeState()
})
