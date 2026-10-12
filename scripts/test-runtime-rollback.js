'use strict'
/**
 * Behavior tests: a Runtime rollback sticks. Automatic update checks must not
 * re-stage the version the user rolled back from; a manual check or a newer
 * official release releases the hold. Real runtime-control + runtime-manager
 * on a temp runtime root, with a stubbed npm registry and OSV.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { withDesktop } = require('./behavior-harness')
const { OSV_URL, PACKAGE_NAME, REGISTRY_URL } = require('../runtime-update-core')

function installManagedVersion(runtimeRoot, version) {
  const dir = path.join(runtimeRoot, 'versions', version, 'node_modules', '@deepseek-ai', 'dsh')
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'bin.js'), '// fake DSH bin\n')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: PACKAGE_NAME,
    version,
    repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
  }))
}

function registryWithLatest(latest) {
  return {
    name: PACKAGE_NAME,
    'dist-tags': { latest },
    versions: {
      [latest]: {
        name: PACKAGE_NAME,
        version: latest,
        repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
        dist: {
          integrity: `sha512-${Buffer.from(latest).toString('base64')}`,
          tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${latest}.tgz`,
          signatures: [{ keyid: 'SHA256:Rml4dHVyZVJlZ2lzdHJ5S2V5', sig: Buffer.alloc(64, 7).toString('base64') }],
        },
      },
    },
  }
}

function stubRegistry(latest, requests) {
  return async (url) => {
    requests.push(url)
    if (url === REGISTRY_URL) {
      return new Response(JSON.stringify(registryWithLatest(latest)), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url === OSV_URL) return new Response('unavailable', { status: 503, headers: { 'content-type': 'text/plain' } })
    throw new TypeError(`unexpected request ${url}`)
  }
}

const scenarios = []
function scenario(name, run) {
  scenarios.push({ name, run })
}

scenario('Rolling back to the bundled Runtime holds the outgoing version until a manual check', () => {
  const requests = []
  return withDesktop({ env: { DSH_RUNTIME_AUTO_UPDATE: '1' }, fetch: stubRegistry('0.1.1-rc.3', requests) }, async (h) => {
    const runtimeRoot = process.env.DSH_DESKTOP_RUNTIME_ROOT
    installManagedVersion(runtimeRoot, '0.1.1-rc.3')
    fs.writeFileSync(path.join(runtimeRoot, 'state.json'), JSON.stringify({ schema: 1, activeVersion: '0.1.1-rc.3', blockedVersions: {} }))
    const control = h.require('runtime-control.js')
    const manager = h.require('runtime-manager.js')

    const rollback = control.requestRollback()
    assert.strictEqual(rollback.ok, true)
    assert.strictEqual(rollback.targetSource, 'bundled')
    assert.strictEqual(manager.loadState().heldVersion, '0.1.1-rc.3')
    assert.strictEqual(control.getStatus().state.heldVersion, '0.1.1-rc.3', 'the settings page can show the hold')

    const automatic = await manager.checkAndStageUpdate({ silent: true })
    assert.strictEqual(automatic.status, 'held', `an automatic check must not undo the rollback: ${JSON.stringify(automatic)}`)
    assert.deepStrictEqual(requests, [REGISTRY_URL], 'a held version is not security-checked or downloaded again')
    assert.strictEqual(h.processes.children.length, 0, 'nothing is installed or probed')
    assert.strictEqual(manager.loadState().pendingVersion, null)

    const manual = await manager.checkAndStageUpdate({ force: true, silent: false })
    assert.strictEqual(manual.status, 'error', JSON.stringify(manual))
    assert.match(manual.error, /OSV/, 'a manual check releases the hold and continues to the security checks')
    assert.strictEqual(manager.loadState().heldVersion, null)
  })
})

scenario('Rolling back between managed versions holds the outgoing one', () =>
  withDesktop({}, async (h) => {
    const runtimeRoot = process.env.DSH_DESKTOP_RUNTIME_ROOT
    installManagedVersion(runtimeRoot, '0.1.0-rc.8')
    installManagedVersion(runtimeRoot, '0.1.1-rc.3')
    fs.writeFileSync(path.join(runtimeRoot, 'state.json'), JSON.stringify({ schema: 1, activeVersion: '0.1.1-rc.3', previousVersion: '0.1.0-rc.8', blockedVersions: {} }))

    const rollback = h.require('runtime-control.js').requestRollback()
    assert.strictEqual(rollback.target, '0.1.0-rc.8')
    const state = h.require('runtime-manager.js').loadState()
    assert.strictEqual(state.pendingVersion, '0.1.0-rc.8')
    assert.strictEqual(state.heldVersion, '0.1.1-rc.3')
  }))

scenario('A newer official release than the held version releases the hold', () => {
  const requests = []
  return withDesktop({ env: { DSH_RUNTIME_AUTO_UPDATE: '1' }, fetch: stubRegistry('0.1.1', requests) }, async (h) => {
    const runtimeRoot = process.env.DSH_DESKTOP_RUNTIME_ROOT
    fs.mkdirSync(runtimeRoot, { recursive: true })
    fs.writeFileSync(path.join(runtimeRoot, 'state.json'), JSON.stringify({ schema: 1, heldVersion: '0.1.1-rc.3', blockedVersions: {} }))
    const manager = h.require('runtime-manager.js')

    const result = await manager.checkAndStageUpdate({ silent: true })
    assert.strictEqual(result.status, 'error', JSON.stringify(result))
    assert.match(result.error, /OSV/, 'a newer release proceeds to the security checks')
    assert.ok(requests.includes(OSV_URL))
    assert.strictEqual(manager.loadState().heldVersion, null)
  })
})

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
  console.log(`[runtime-rollback] ${scenarios.length} behavior scenarios passed: rollback holds the outgoing version until a manual check or newer release`)
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
