'use strict'
/**
 * Behavior tests for startup feedback:
 * - bootstrap shows the splash before the Runtime preflight / web UI work;
 * - a second launch during boot brings that splash forward;
 * - Standard reuses the same splash; Creator opens its window before the DSH
 *   Runtime is ready, reports starting/ready/failed and dismisses the splash.
 */
const assert = require('assert')
const { waitFor, withDesktop } = require('./behavior-harness')

const CREATOR_INTERNALS = '{ startCreator, get harnessState() { return harnessState } }'

const scenarios = []
function scenario(name, run) {
  scenarios.push({ name, run })
}

function windowLoading(h, file) {
  return h.electron.windows.find((window) => window.loaded === file && !window.destroyed) || null
}

scenario('Bootstrap shows the splash before slow boot work and focuses it on a second launch', () =>
  withDesktop({ windows: true, singleInstance: true, ready: false }, async (h) => {
    let releaseWebUi
    const webUiGate = new Promise((resolve) => { releaseWebUi = resolve })
    h.stubModule('bundled-web-ui.js', {
      ensureBundledWebUi: async () => {
        h.timeline.push('ensureBundledWebUi:start')
        await webUiGate
        return { status: 'ready' }
      },
    })
    h.stubModule('main.js', {}) // the Standard host is covered by its own scenarios
    const bootstrap = h.loadWithInternals('bootstrap.js', '{ boot }')

    const booting = bootstrap.boot()
    await waitFor(() => h.timeline.includes('ensureBundledWebUi:start'), 3000, 'boot reaching web UI reconciliation')
    const splash = windowLoading(h, 'splash.html')
    assert.ok(splash, 'a splash window must exist while boot work is still running')
    assert.ok(
      h.timeline.indexOf('window:load:splash.html') < h.timeline.indexOf('ensureBundledWebUi:start'),
      `splash must be shown before slow boot work (timeline ${JSON.stringify(h.timeline)})`,
    )

    h.electron.app.emit('second-instance')
    assert.strictEqual(splash.focused, 1, 'a second launch during boot must bring the splash forward')

    releaseWebUi()
    await booting
    assert.ok(!splash.destroyed, 'the mode host takes over the splash until its first frame')
  }))

scenario('Standard reuses the boot splash and dismisses it on its first frame', () =>
  withDesktop({ windows: true }, async (h) => {
    const shown = h.require('boot-splash.js').showSplash()
    const main = h.loadWithInternals('main.js', '{ createSplash, dismissSplash }')

    main.createSplash()
    assert.strictEqual(h.electron.windows.filter((window) => window.loaded === 'splash.html').length, 1, 'no second splash window')
    main.dismissSplash()
    assert.ok(shown.destroyed)
  }))

scenario('Creator opens its window before the Runtime is ready and reports progress', () =>
  withDesktop({ windows: true, coldStartMs: 1500 }, async (h) => {
    const splash = h.require('boot-splash.js').showSplash()
    const creator = h.loadWithInternals('creator-main.js', CREATOR_INTERNALS)

    let settled = false
    const starting = creator.startCreator().then(() => { settled = true })
    await waitFor(() => windowLoading(h, 'creator.html'), 1000, 'Creator window')
    const window = windowLoading(h, 'creator.html')
    assert.ok(!settled, 'the Creator window must open while the Runtime is still cold-starting')
    const status = h.electron.ipcHandlers.get('creator:status')
    const early = await status({ sender: window.webContents })
    assert.strictEqual(early.harnessState, 'starting')
    assert.strictEqual(early.harnessUrl, '')

    window.emit('ready-to-show')
    assert.ok(splash.destroyed, 'Creator dismisses the boot splash on its first frame')
    assert.ok(window.visible)

    await starting
    const [runtime] = h.processes.dshWebChildren()
    const url = `http://127.0.0.1:${runtime.port}`
    assert.strictEqual(creator.harnessState, 'ready')
    assert.deepStrictEqual(window.webContents.sent.filter(([channel]) => channel === 'creator:harness-url'), [['creator:harness-url', url]])
    const late = await status({ sender: window.webContents })
    assert.strictEqual(late.harnessState, 'ready')
    assert.strictEqual(late.harnessUrl, url)
  }))

scenario('Creator reports a failed Runtime start to the open window', () =>
  withDesktop({
    windows: true,
    coldStartMs: 100,
    onSpawn: (child) => { if (child.isDshWeb) setTimeout(() => child.finish(1), 50) },
  }, async (h) => {
    const creator = h.loadWithInternals('creator-main.js', CREATOR_INTERNALS)
    await creator.startCreator()
    const window = windowLoading(h, 'creator.html')
    assert.ok(window, 'the Creator window opens even when the Runtime fails')
    assert.strictEqual(creator.harnessState, 'failed')
    assert.deepStrictEqual(window.webContents.sent.filter(([channel]) => channel === 'creator:harness-url'), [['creator:harness-url', '']])
    const status = await h.electron.ipcHandlers.get('creator:status')({ sender: window.webContents })
    assert.strictEqual(status.harnessState, 'failed')
  }))

;(async () => {
  for (const { name, run } of scenarios) {
    try {
      await run()
      console.log(`  ok - ${name}`)
    } catch (error) {
      console.error(`  FAIL - ${name}`)
      throw error
    }
  }
  console.log(`[desktop-startup] ${scenarios.length} behavior scenarios passed: early splash, second launch during boot, Creator window before Runtime`)
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
