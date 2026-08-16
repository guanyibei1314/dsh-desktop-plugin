'use strict'

const { app } = require('electron')
const desktopExtensions = require('./desktop-extensions')
const { ensureBundledWebUi } = require('./bundled-web-ui')

// Desktop-owned capability windows are registered before the DSH renderer is
// created so their IPC stays isolated from the remote/local DSH Web page.
desktopExtensions.registerDesktopExtensions()

async function boot() {
  // The skin bundle is physically shipped inside the installer. Reconcile it
  // into the private web profile before bundled DSH starts, with offline mode
  // enforced by bundled-web-ui.js. Smoke mode deliberately skips profile
  // mutation; CI has a dedicated packaged offline-link verification lane.
  if (!process.argv.includes('--smoke')) {
    try {
      await ensureBundledWebUi()
    } catch (err) {
      // Appearance must never make the desktop unusable. The bootstrap module
      // writes diagnostics and the normal DSH UI still starts on failure.
      console.error('[bundled-web-ui]', err && err.stack ? err.stack : err)
    }
  }
  require('./main.js')
}

if (app.isReady()) boot()
else app.whenReady().then(boot)
