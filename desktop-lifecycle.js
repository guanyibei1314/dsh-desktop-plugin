'use strict'

const { app } = require('electron')

// Electron's app.exit() deliberately skips before-quit/will-quit. Every owner of
// a child process (DSH Runtime, Creator Runtime, PTY, plugin operation)
// registers its cleanup here, so a mode switch or restart stops those children
// exactly like a normal quit instead of orphaning them. Hooks must be
// idempotent: a quit that is cancelled and retried runs them again.
const shutdownHooks = []
let installed = false

function runShutdownHooks() {
  for (const hook of shutdownHooks.slice()) {
    try {
      hook()
    } catch (err) {
      console.error('[desktop-lifecycle]', err && err.stack ? err.stack : err)
    }
  }
}

function onShutdown(hook) {
  if (typeof hook !== 'function') throw new TypeError('shutdown hook must be a function')
  if (!installed) {
    installed = true
    app.on('before-quit', runShutdownHooks)
  }
  shutdownHooks.push(hook)
}

/** Stop every owned child process, then restart the Desktop shell. */
function relaunch(options) {
  runShutdownHooks()
  if (options) app.relaunch(options)
  else app.relaunch()
  app.exit(0)
}

module.exports = {
  onShutdown,
  relaunch,
  runShutdownHooks,
}
