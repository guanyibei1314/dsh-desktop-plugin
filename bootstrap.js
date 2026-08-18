'use strict'

const { app } = require('electron')
const runtimeManager = require('./runtime-manager')

// Redirect every desktop-owned DSH CLI spawn (main service, plugin manager and
// bundled skin reconciliation) through one validated runtime selected for this
// process. Non-DSH child processes are left untouched.
runtimeManager.patchDshSpawn()

const RUNTIME_UPDATE_SMOKE = process.argv.includes('--runtime-update-smoke')
const SMOKE = process.argv.includes('--smoke')

if (!RUNTIME_UPDATE_SMOKE) {
  const desktopExtensions = require('./desktop-extensions')
  const { registerPluginMarketIpc } = require('./plugin-market-ipc')

  // Desktop-owned capability windows are registered before the DSH renderer is
  // created so their IPC stays isolated from the remote/local DSH Web page.
  desktopExtensions.registerDesktopExtensions()
  registerPluginMarketIpc()
}

async function boot() {
  // A staged official DSH update is activated only after it can start against
  // the user's real private Profile. Failed candidates stay blocked and the
  // prior/bundled runtime remains selected for this process.
  if (!SMOKE) {
    try {
      await runtimeManager.prepareRuntimeBeforeBoot()
    } catch (err) {
      console.error('[runtime-manager]', err && err.stack ? err.stack : err)
    }
  }

  const { ensureBundledWebUi } = require('./bundled-web-ui')
  // The skin bundle is physically shipped inside the installer. Reconcile it
  // into the private web profile before DSH starts. The DSH CLI spawn itself is
  // transparently routed through the currently selected managed runtime.
  if (!SMOKE) {
    try {
      await ensureBundledWebUi()
    } catch (err) {
      // Appearance must never make the desktop unusable. The bootstrap module
      // writes diagnostics and the normal DSH UI still starts on failure.
      console.error('[bundled-web-ui]', err && err.stack ? err.stack : err)
    }
  }

  require('./main.js')
  if (!SMOKE) runtimeManager.scheduleAutoUpdate()
}

async function runtimeUpdateSmoke() {
  try {
    const result = await runtimeManager.runUpdaterSmoke()
    process.stdout.write(`[runtime-update-smoke] ${JSON.stringify(result)}\n`)
    app.exit(0)
  } catch (err) {
    process.stderr.write(`[runtime-update-smoke] ${err && err.stack ? err.stack : err}\n`)
    app.exit(1)
  }
}

if (RUNTIME_UPDATE_SMOKE) {
  if (app.isReady()) runtimeUpdateSmoke()
  else app.whenReady().then(runtimeUpdateSmoke)
} else if (app.isReady()) boot()
else app.whenReady().then(boot)
