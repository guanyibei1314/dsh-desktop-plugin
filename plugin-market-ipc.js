'use strict'

const path = require('path')
const { pathToFileURL } = require('url')
const { app, ipcMain } = require('electron')
const { loadPluginCatalog } = require('./plugin-market')

let registered = false

function pluginMarketCachePath() {
  return path.join(app.getPath('userData'), 'plugin-market-cache.json')
}

function isAuthorizedSender(event) {
  const expected = pathToFileURL(path.join(__dirname, 'plugin-manager.html')).href
  try {
    return !!event && !!event.sender && event.sender.getURL() === expected
  } catch (_) {
    return false
  }
}

function registerPluginMarketIpc() {
  if (registered) return
  registered = true
  ipcMain.handle('plugin:catalog', async (event) => {
    if (!isAuthorizedSender(event)) throw new Error('unauthorized sender')
    return loadPluginCatalog(pluginMarketCachePath())
  })
}

module.exports = {
  registerPluginMarketIpc,
}
