'use strict'

const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { app, ipcMain } = require('electron')
const { isPackageName, loadPluginCatalog } = require('./plugin-market')
const { assessPackageSecurity } = require('./plugin-security')

let registered = false

function pluginMarketCachePath() {
  return path.join(app.getPath('userData'), 'plugin-market-cache.json')
}

function profilePackagePath() {
  return path.join(app.getPath('userData'), 'dsh-home', 'profiles', 'web', 'package.json')
}

function installedPackages() {
  try {
    const pkg = JSON.parse(fs.readFileSync(profilePackagePath(), 'utf8'))
    const names = new Set()
    for (const key of ['dependencies', 'optionalDependencies', 'devDependencies']) {
      const deps = pkg && pkg[key]
      if (!deps || typeof deps !== 'object' || Array.isArray(deps)) continue
      for (const name of Object.keys(deps)) {
        if (isPackageName(name)) names.add(name)
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  } catch (_) {
    return []
  }
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
  ipcMain.handle('plugin:installed', (event) => {
    if (!isAuthorizedSender(event)) throw new Error('unauthorized sender')
    return installedPackages()
  })
  ipcMain.handle('plugin:security', async (event, rawPackageName) => {
    if (!isAuthorizedSender(event)) throw new Error('unauthorized sender')
    const packageName = String(rawPackageName || '').trim()
    if (!isPackageName(packageName)) throw new Error('非法 npm 包名。')
    // Intentionally no long-lived cache: every explicit assessment and every
    // one-click install/update receives a fresh npm + OSV preflight.
    return assessPackageSecurity(packageName)
  })
}

module.exports = {
  installedPackages,
  registerPluginMarketIpc,
}
