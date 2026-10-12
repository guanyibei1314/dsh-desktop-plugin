'use strict'
/**
 * Behavior tests for Desktop process lifecycle:
 * - every `dsh web` launch passes --no-open (no system browser tab);
 * - error-page retries during a cold start share one Runtime launch;
 * - mode switch / Runtime restart / plugin restart stop owned children first;
 * - the single-instance lock is claimed before any boot work, in both modes.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { delay, waitFor, withDesktop } = require('./behavior-harness')

const MAIN_INTERNALS = '{ startBundledDsh, loadMain, setWindow: (value) => { win = value }, get dshProc() { return dshProc } }'
const CREATOR_INTERNALS = '{ startHarness, get harnessProc() { return harnessProc } }'

function assertDshWebArgs(child, label) {
  const web = child.args.indexOf('web')
  assert.ok(web > 0, `${label}: expected a dsh web launch, got ${JSON.stringify(child.args)}`)
  assert.deepStrictEqual(
    child.args.slice(web),
    ['web', '--host', '127.0.0.1', '--port', String(child.port), '--no-open'],
    `${label}: dsh web must bind loopback and pass --no-open so no system browser tab opens`,
  )
}

function assertStoppedBeforeExit(timeline, child, label) {
  const terminated = timeline.indexOf(`child-terminated:${child.pid}`)
  const exit = timeline.indexOf('exit:0')
  assert.ok(terminated >= 0, `${label}: owned child ${child.pid} was never terminated (timeline ${JSON.stringify(timeline)})`)
  assert.ok(exit > terminated, `${label}: owned child must be terminated before app.exit (timeline ${JSON.stringify(timeline)})`)
}

function fakeWindow(record) {
  const webContents = { send: (channel, payload) => record.push(['send', channel, payload]) }
  return {
    webContents,
    isDestroyed: () => false,
    loadURL: async (url) => { record.push(['loadURL', url]) },
    loadFile: async (file) => { record.push(['loadFile', path.basename(file)]) },
  }
}

const scenarios = []
function scenario(name, run) {
  scenarios.push({ name, run })
}

scenario('Standard: error-page retry during a cold start shares one Runtime launch', () =>
  withDesktop({ coldStartMs: 1500 }, async (h) => {
    const main = h.loadWithInternals('main.js', MAIN_INTERNALS)
    const loads = []
    main.setWindow(fakeWindow(loads))

    const first = main.loadMain()
    await delay(400) // error.html fires its 5s retry while DSH is still cold-starting
    const retry = main.loadMain()
    const direct = main.startBundledDsh()
    await Promise.all([first, retry])
    const url = await direct

    const launched = h.processes.dshWebChildren()
    assert.strictEqual(launched.length, 1, 'overlapping starts must not spawn a second Runtime')
    assert.ok(!launched[0].exited, 'the single Runtime must stay alive')
    assert.strictEqual(main.dshProc, launched[0], 'the live Runtime must remain owned by Desktop')
    assert.strictEqual(url, `http://127.0.0.1:${launched[0].port}`)
    assert.deepStrictEqual(loads, [['loadURL', url]], 'one navigation to the Runtime and no error page')
    assertDshWebArgs(launched[0], 'Standard Runtime')
  }))

scenario('Standard: a failed launch releases the in-flight slot for the next retry', () => {
  let launches = 0
  return withDesktop({
    coldStartMs: 100,
    onSpawn: (child) => {
      if (child.isDshWeb && ++launches === 1) setTimeout(() => child.finish(1), 50)
    },
  }, async (h) => {
    const main = h.loadWithInternals('main.js', MAIN_INTERNALS)
    await assert.rejects(main.startBundledDsh(), /内置 DeepSeek Harness 启动超时/)
    assert.strictEqual(main.dshProc, null)
    const url = await main.startBundledDsh()
    assert.strictEqual(h.processes.dshWebChildren().length, 2, 'the retry must launch a fresh Runtime')
    assert.deepStrictEqual(h.processes.liveDshWebChildren(), [main.dshProc])
    assert.strictEqual(url, `http://127.0.0.1:${main.dshProc.port}`)
  })
})

scenario('Standard: switching to Creator stops the Runtime before the relaunch exit', () =>
  withDesktop({ coldStartMs: 100 }, async (h) => {
    const main = h.loadWithInternals('main.js', MAIN_INTERNALS)
    await main.startBundledDsh()
    const [runtime] = h.processes.dshWebChildren()

    h.require('desktop-mode.js').switchMode('creator')

    assertStoppedBeforeExit(h.timeline, runtime, 'mode switch')
    assert.strictEqual(main.dshProc, null)
    const relaunch = h.timeline.find((entry) => entry && typeof entry === 'object' && 'relaunch' in entry)
    assert.ok(relaunch && relaunch.relaunch && Array.isArray(relaunch.relaunch.args), 'mode switch must relaunch the shell')
    assert.ok(!relaunch.relaunch.args.some((arg) => /^--(?:creator|standard)-mode$|^--desktop-mode=/.test(arg)), 'relaunch must drop one-shot mode flags')
    const settings = JSON.parse(fs.readFileSync(path.join(h.userData, 'settings.json'), 'utf8'))
    assert.strictEqual(settings.desktopMode, 'creator')
  }))

scenario('Runtime settings restart stops the Runtime before the relaunch exit', () =>
  withDesktop({ coldStartMs: 100 }, async (h) => {
    const main = h.loadWithInternals('main.js', MAIN_INTERNALS)
    await main.startBundledDsh()
    const [runtime] = h.processes.dshWebChildren()
    const settingsWindow = h.loadWithInternals('runtime-settings-window.js', '{ registerRuntimeSettings, setWindow: (value) => { runtimeWindow = value } }')
    settingsWindow.registerRuntimeSettings()
    const window = fakeWindow([])
    settingsWindow.setWindow(window)

    await h.electron.ipcHandlers.get('runtime-settings:restart')({ sender: window.webContents })

    assertStoppedBeforeExit(h.timeline, runtime, 'Runtime settings restart')
  }))

scenario('Plugin restart stops the plugin operation and the Runtime before the relaunch exit', () =>
  withDesktop({ coldStartMs: 100 }, async (h) => {
    const main = h.loadWithInternals('main.js', MAIN_INTERNALS)
    await main.startBundledDsh()
    const [runtime] = h.processes.dshWebChildren()
    const extensions = h.loadWithInternals('desktop-extensions.js', '{ registerDesktopExtensions, runPlugin, setPluginWindow: (value) => { pluginWindow = value } }')
    extensions.registerDesktopExtensions()
    const window = fakeWindow([])
    extensions.setPluginWindow(window)

    const operation = extensions.runPlugin('list', '').catch((error) => error)
    const plugin = h.processes.children.find((child) => child.args.includes('plugin'))
    assert.ok(plugin && !plugin.exited, 'plugin operation must be running')

    await h.electron.ipcHandlers.get('plugin:restart')({ sender: window.webContents })

    assertStoppedBeforeExit(h.timeline, plugin, 'plugin restart (plugin operation)')
    assertStoppedBeforeExit(h.timeline, runtime, 'plugin restart (DSH Runtime)')
    assert.ok(await operation instanceof Error, 'the interrupted plugin operation must settle as failed')
  }))

scenario('Creator: Runtime launch passes --no-open, second launch focuses Creator, relaunch stops the Runtime', () =>
  withDesktop({ coldStartMs: 100 }, async (h) => {
    const creator = h.loadWithInternals('creator-main.js', CREATOR_INTERNALS)
    const url = await creator.startHarness()
    const [runtime] = h.processes.dshWebChildren()
    assert.strictEqual(url, `http://127.0.0.1:${runtime.port}`)
    assertDshWebArgs(runtime, 'Creator Runtime')
    assert.strictEqual(h.electron.app.listenerCount('second-instance'), 1, 'Creator must handle second-instance now that bootstrap owns the lock')

    h.require('desktop-mode.js').switchMode('standard')

    assertStoppedBeforeExit(h.timeline, runtime, 'Creator mode switch')
    assert.strictEqual(creator.harnessProc, null)
  }))

scenario('Runtime preflight probe passes --no-open and stops the probe Runtime', () =>
  withDesktop({ coldStartMs: 100 }, async (h) => {
    const runtimeRoot = process.env.DSH_DESKTOP_RUNTIME_ROOT
    const version = '9.9.9'
    const packageDir = path.join(runtimeRoot, 'versions', version, 'node_modules', '@deepseek-ai', 'dsh')
    fs.mkdirSync(path.join(packageDir, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(packageDir, 'lib', 'bin.js'), '// fake DSH bin for behavior tests\n')
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh',
      version,
      repository: { type: 'git', url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
    }))
    fs.writeFileSync(path.join(runtimeRoot, 'state.json'), JSON.stringify({ schema: 1, pendingVersion: version, blockedVersions: {} }))

    const descriptor = await h.require('runtime-manager.js').prepareRuntimeBeforeBoot()

    assert.strictEqual(descriptor.version, version, 'the pending Runtime must activate after a passing probe')
    assert.strictEqual(descriptor.source, 'managed')
    const probes = h.processes.dshWebChildren()
    assert.strictEqual(probes.length, 1)
    assertDshWebArgs(probes[0], 'Runtime preflight probe')
    await waitFor(() => probes[0].exited, 2000, 'probe Runtime termination')
    assert.ok(probes[0].killed, 'the probe Runtime must be terminated after the probe')
  }))

scenario('Bootstrap: a second launch quits before any boot work', () =>
  withDesktop({ singleInstance: false, ready: true }, async (h) => {
    h.require('bootstrap.js')
    await delay(50)

    assert.ok(h.timeline.includes('requestSingleInstanceLock'))
    assert.ok(h.timeline.includes('quit'), 'secondary instance must quit')
    assert.ok(!fs.existsSync(process.env.DSH_DESKTOP_RUNTIME_ROOT), 'secondary instance must not run the Runtime preflight or version GC')
    assert.strictEqual(h.electron.Menu.buildFromTemplate, h.electron.originalBuildFromTemplate, 'secondary instance must not patch menus')
    assert.strictEqual(h.electron.ipcHandlers.size, 0, 'secondary instance must not register IPC')
    assert.strictEqual(h.processes.children.length, 0, 'secondary instance must not spawn anything')
  }))

scenario('Bootstrap: the primary claims the lock before waiting for ready', () =>
  withDesktop({ singleInstance: true, ready: false }, async (h) => {
    h.require('bootstrap.js')

    const lock = h.timeline.indexOf('requestSingleInstanceLock')
    const ready = h.timeline.indexOf('whenReady')
    assert.ok(lock >= 0 && ready > lock, `lock must precede boot (timeline ${JSON.stringify(h.timeline)})`)
    assert.ok(!h.timeline.includes('quit'), 'primary instance must keep running')
    assert.notStrictEqual(h.electron.Menu.buildFromTemplate, h.electron.originalBuildFromTemplate, 'primary instance must install desktop menus')
    assert.ok(h.electron.ipcHandlers.has('runtime-settings:restart'))
    assert.ok(h.electron.ipcHandlers.has('plugin:restart'))
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
  console.log(`[desktop-lifecycle] ${scenarios.length} behavior scenarios passed: --no-open launches, shared cold start, cleanup before relaunch, early single-instance lock`)
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
