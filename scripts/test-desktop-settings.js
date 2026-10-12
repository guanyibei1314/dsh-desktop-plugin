'use strict'
/**
 * Behavior tests for settings.json: window bounds are saved once dragging
 * settles (and flushed on quit/relaunch), every writer goes through an atomic
 * temp-file + rename, writers keep each other's keys, and a corrupt file is
 * kept aside instead of being silently overwritten.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { delay, withDesktop } = require('./behavior-harness')

const MAIN_INTERNALS = '{ rememberBounds, setWindow: (value) => { win = value } }'

function spyWrites(settingsFile) {
  const original = fs.writeFileSync
  const writes = []
  fs.writeFileSync = function spiedWriteFileSync(target) {
    if (String(target).startsWith(settingsFile)) writes.push(String(target))
    return original.apply(fs, arguments)
  }
  return { writes, restore: () => { fs.writeFileSync = original } }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const scenarios = []
function scenario(name, run) {
  scenarios.push({ name, run })
}

scenario('Dragging the main window writes settings once it settles, atomically', () =>
  withDesktop({}, async (h) => {
    const settingsFile = path.join(h.userData, 'settings.json')
    const main = h.loadWithInternals('main.js', MAIN_INTERNALS)
    let bounds = { x: 0, y: 0, width: 1320, height: 860 }
    main.setWindow({ isDestroyed: () => false, isMinimized: () => false, isMaximized: () => false, getBounds: () => Object.assign({}, bounds) })
    const spy = spyWrites(settingsFile)
    try {
      for (let step = 1; step <= 60; step += 1) {
        bounds = { x: step * 5, y: step * 3, width: 1320, height: 860 }
        main.rememberBounds() // what each move/resize event calls
      }
      assert.strictEqual(spy.writes.length, 0, 'no settings write per move/resize event')
      await delay(700)
      assert.strictEqual(spy.writes.length, 1, `exactly one write after the drag settles, got ${spy.writes.length}`)
      assert.notStrictEqual(spy.writes[0], settingsFile, 'settings.json is replaced by rename, never written in place')
      assert.deepStrictEqual(readJson(settingsFile).windowBounds, { x: 300, y: 180, width: 1320, height: 860 })

      bounds = { x: 10, y: 20, width: 1000, height: 700 }
      main.rememberBounds()
      h.require('desktop-lifecycle.js').runShutdownHooks() // quit or relaunch
      assert.deepStrictEqual(readJson(settingsFile).windowBounds, bounds, 'pending bounds are flushed on quit/relaunch')
    } finally {
      spy.restore()
    }
  }))

scenario('Mode, Runtime update and window settings keep each other\'s keys', () =>
  withDesktop({}, async (h) => {
    const settingsFile = path.join(h.userData, 'settings.json')
    h.require('desktop-mode.js').setMode('creator')
    h.require('runtime-control.js').saveSettings({ channel: 'latest', autoUpdate: false })
    const main = h.loadWithInternals('main.js', MAIN_INTERNALS)
    main.setWindow({ isDestroyed: () => false, isMinimized: () => false, isMaximized: () => false, getBounds: () => ({ x: 1, y: 2, width: 960, height: 600 }) })
    main.rememberBounds()
    h.require('desktop-lifecycle.js').runShutdownHooks()

    const stored = readJson(settingsFile)
    assert.strictEqual(stored.desktopMode, 'creator')
    assert.strictEqual(stored.dshRuntimeUpdateChannel, 'latest')
    assert.strictEqual(stored.dshRuntimeAutoUpdate, false)
    assert.deepStrictEqual(stored.windowBounds, { x: 1, y: 2, width: 960, height: 600 })
    assert.strictEqual(h.require('desktop-mode.js').getMode(), 'creator')
    assert.strictEqual(h.require('runtime-control.js').effectiveSettings().stored.channel, 'latest')
  }))

scenario('A corrupt settings.json is kept aside, not silently replaced', () =>
  withDesktop({}, async (h) => {
    const settingsFile = path.join(h.userData, 'settings.json')
    fs.writeFileSync(settingsFile, '{"desktopMode": "creat', 'utf8')
    const settings = h.require('desktop-settings.js')
    assert.deepStrictEqual(settings.readSettings(), {}, 'readers fall back to defaults')
    assert.strictEqual(h.require('desktop-mode.js').getMode(), 'standard')

    settings.updateSettings({ notificationsEnabled: false })
    assert.deepStrictEqual(readJson(settingsFile), { notificationsEnabled: false })
    assert.strictEqual(fs.readFileSync(`${settingsFile}.corrupt`, 'utf8'), '{"desktopMode": "creat', 'the unreadable file is preserved for diagnosis')
    assert.deepStrictEqual(fs.readdirSync(h.userData).filter((name) => name.includes('.tmp-')), [], 'no temp files are left behind')
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
  console.log(`[desktop-settings] ${scenarios.length} behavior scenarios passed: debounced bounds, atomic shared writes, corrupt-file preservation`)
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
