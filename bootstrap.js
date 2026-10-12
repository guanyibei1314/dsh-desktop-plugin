'use strict'

const { app } = require('electron')
const runtimeManager = require('./runtime-manager')
const runtimeControl = require('./runtime-control')
const desktopMode = require('./desktop-mode')
const bootSplash = require('./boot-splash')

// Redirect every desktop-owned DSH CLI spawn (main service, Creator service,
// plugin manager and bundled skin reconciliation) through one validated runtime
// selected for this process. Non-DSH child processes are left untouched.
runtimeManager.patchDshSpawn()

const RUNTIME_UPDATE_SMOKE = process.argv.includes('--runtime-update-smoke')
const SMOKE = process.argv.includes('--smoke')

// Claim the single-instance lock before any boot work, for both modes. A second
// launch must not preflight a pending Runtime against the live Profile, garbage
// collect managed versions or run pnpm in the shared web profile while the
// primary instance is still using them. The runtime update smoke is an isolated
// CI probe with its own runtime root and keeps no lock.
const PRIMARY_INSTANCE = RUNTIME_UPDATE_SMOKE || app.requestSingleInstanceLock()

if (PRIMARY_INSTANCE && !RUNTIME_UPDATE_SMOKE) {
  const { registerRuntimeSettings } = require('./runtime-settings-window')
  const desktopExtensions = require('./desktop-extensions')
  const { registerPluginMarketIpc } = require('./plugin-market-ipc')

  // Patch mode first. Runtime settings and desktop extensions wrap the same
  // Menu builder afterwards, so Standard and Creator receive one coherent menu.
  desktopMode.registerDesktopMode()
  registerRuntimeSettings()
  desktopExtensions.registerDesktopExtensions()
  registerPluginMarketIpc()

  // A second launch can arrive before main.js / creator-main.js register their
  // own handlers (boot below can take a while); bring the splash forward then.
  app.on('second-instance', () => bootSplash.focusSplash())
}

async function boot() {
  // Show a window before any slow boot work: a pending Runtime preflight can
  // take up to 90 seconds. The mode host keeps it until its own first frame.
  if (!SMOKE) bootSplash.showSplash()

  // A staged official DSH update is activated only after it can start against
  // the user's real private Profile. Failed candidates stay blocked and the
  // prior/bundled runtime remains selected for this process.
  if (!SMOKE) {
    try {
      await runtimeManager.prepareRuntimeBeforeBoot()
      const maintenance = runtimeControl.runMaintenance()
      if (maintenance.smoke.removed.length || maintenance.runtimes.removed.length) {
        console.log('[runtime-maintenance]', maintenance)
      }
    } catch (err) {
      console.error('[runtime-manager]', err && err.stack ? err.stack : err)
    }
  }

  const { ensureBundledWebUi } = require('./bundled-web-ui')
  // Shared bundled web UI remains reconciled for both modes. Creator does not
  // replace the DSH Runtime; it adds a separate local-first shell around it.
  if (!SMOKE) {
    try {
      await ensureBundledWebUi()
    } catch (err) {
      console.error('[bundled-web-ui]', err && err.stack ? err.stack : err)
    }
  }

  if (desktopMode.getMode() === desktopMode.MODE_CREATOR) require('./creator-main.js')
  else require('./main.js')

  if (!SMOKE) runtimeControl.startAutoUpdates()
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

if (!PRIMARY_INSTANCE) {
  // The primary instance receives `second-instance` and shows its window.
  app.quit()
} else if (RUNTIME_UPDATE_SMOKE) {
  if (app.isReady()) runtimeUpdateSmoke()
  else app.whenReady().then(runtimeUpdateSmoke)
} else if (app.isReady()) boot()
else app.whenReady().then(boot)
