'use strict'

const { app } = require('electron')
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-maintenance-'))
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-maintenance-outside-'))
process.env.DSH_DESKTOP_RUNTIME_ROOT = root

const runtimeControl = require('../runtime-control')

function makeRuntime(version) {
  const dir = path.join(root, 'versions', version, 'node_modules', '@deepseek-ai', 'dsh')
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version }), 'utf8')
  fs.writeFileSync(path.join(dir, 'lib', 'bin.js'), '// test runtime\n', 'utf8')
}

function cleanup() {
  try { fs.rmSync(root, { recursive: true, force: true }) } catch (err) { /* best-effort test cleanup */ }
  try { fs.rmSync(outside, { recursive: true, force: true }) } catch (err) { /* best-effort test cleanup */ }
}

async function main() {
  try {
    fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'must-survive', 'utf8')
    const smoke = path.join(root, 'smoke-home', 'old-probe')
    fs.mkdirSync(smoke, { recursive: true })
    const link = path.join(smoke, 'runtime-link')
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    fs.utimesSync(smoke, old, old)

    const smokeResult = runtimeControl.cleanupSmokeProfiles(Date.now())
    assert(smokeResult.removed.includes('old-probe'), 'old smoke profile should be removed')
    assert(fs.existsSync(path.join(outside, 'sentinel.txt')), 'junction target must never be traversed/deleted')
    assert(!fs.existsSync(smoke), 'old smoke profile itself should be removed')

    const active = '1.0.0'
    const previous = '0.9.0'
    const pending = '1.1.0'
    const stale = '0.8.0'
    for (const version of [active, previous, pending, stale]) makeRuntime(version)
    fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({
      schema: 1,
      activeVersion: active,
      previousVersion: previous,
      pendingVersion: pending,
      latestVersion: pending,
      lastCheckedAt: null,
      lastUpdateAt: null,
      lastError: null,
      blockedVersions: {},
    }, null, 2), 'utf8')

    const gc = runtimeControl.cleanupManagedVersions()
    assert(gc.removed.includes(stale), 'unreferenced managed runtime should be removed')
    for (const version of [active, previous, pending]) {
      assert(fs.existsSync(path.join(root, 'versions', version)), `${version} must be preserved`)
    }
    assert(!fs.existsSync(path.join(root, 'versions', stale)), 'stale runtime should be gone')

    assert.throws(() => runtimeControl.safeRemoveTree(outside, root), /outside runtime root/, 'boundary escape must be rejected')
    process.stdout.write('[runtime-maintenance] junction-safe cleanup and protected-version GC passed\n')
    cleanup()
    app.exit(0)
  } catch (err) {
    process.stderr.write(`[runtime-maintenance] ${err && err.stack ? err.stack : err}\n`)
    cleanup()
    app.exit(1)
  }
}

if (app.isReady()) main()
else app.whenReady().then(main)
