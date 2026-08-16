'use strict'

const bridge = window.sitesBridge
const nameInput = document.getElementById('name')
const urlInput = document.getElementById('url')
const addButton = document.getElementById('add')
const message = document.getElementById('message')
const sitesRoot = document.getElementById('sites')

function button(label, className, handler) {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label
  if (className) el.className = className
  el.addEventListener('click', handler)
  return el
}

function render(items) {
  sitesRoot.replaceChildren()
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '还没有 Site。把经常使用的网页工具固定到这里。'
    sitesRoot.appendChild(empty)
    return
  }

  for (const site of items) {
    const card = document.createElement('div')
    card.className = 'site'

    const info = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'name'
    title.textContent = site.name
    const url = document.createElement('div')
    url.className = 'url'
    url.textContent = site.url
    info.append(title, url)

    const actions = document.createElement('div')
    actions.className = 'actions'
    actions.append(
      button('作为 Site 打开', 'primary', async () => {
        try { await bridge.open(site.id) } catch (error) { setMessage(error.message) }
      }),
      button('浏览器打开', '', async () => {
        try { await bridge.openInBrowser(site.id) } catch (error) { setMessage(error.message) }
      }),
      button('删除', 'danger', async () => {
        if (!window.confirm(`删除 Site「${site.name}」？`)) return
        try { render(await bridge.remove(site.id)); setMessage('已删除。') } catch (error) { setMessage(error.message) }
      }),
    )

    card.append(info, actions)
    sitesRoot.appendChild(card)
  }
}

function setMessage(value) {
  message.textContent = String(value || '')
}

async function refresh() {
  if (!bridge) return
  try {
    render(await bridge.list())
  } catch (error) {
    setMessage(error.message)
  }
}

addButton.addEventListener('click', async () => {
  if (!bridge) return
  const name = nameInput.value.trim()
  const url = urlInput.value.trim()
  if (!name || !url) {
    setMessage('名称和网址都需要填写。')
    return
  }
  addButton.disabled = true
  try {
    render(await bridge.add(name, url))
    nameInput.value = ''
    urlInput.value = ''
    setMessage('Site 已保存。')
  } catch (error) {
    setMessage(error.message)
  } finally {
    addButton.disabled = false
  }
})

urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addButton.click()
})

if (bridge) refresh()
else {
  setMessage('Sites 桥接不可用。')
  addButton.disabled = true
}
