'use strict'

const { BrowserWindow } = require('electron')
const path = require('path')

const SPLASH_HTML = path.join(__dirname, 'splash.html')
const ICON = path.join(__dirname, 'assets', 'icon.png')

// One startup splash for the whole process. bootstrap.js shows it before the
// Runtime preflight and bundled web UI reconciliation, which can take a while;
// the Standard or Creator host keeps the same window until its own first frame.
let splash = null

function showSplash() {
  if (splash !== null && !splash.isDestroyed()) return splash
  const created = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: true,
    backgroundColor: '#0d1117',
    icon: ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  splash = created
  created.on('closed', () => { if (splash === created) splash = null })
  created.loadFile(SPLASH_HTML).catch(() => {})
  return created
}

/** Bring the splash forward, e.g. when a second launch arrives during boot. */
function focusSplash() {
  if (splash === null || splash.isDestroyed()) return false
  splash.show()
  splash.focus()
  return true
}

/** Dismiss the startup splash once the real shell has a first frame. */
function closeSplash() {
  const current = splash
  splash = null
  if (current !== null && !current.isDestroyed()) current.destroy()
}

module.exports = {
  closeSplash,
  focusSplash,
  showSplash,
}
