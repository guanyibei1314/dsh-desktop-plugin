'use strict'
/**
 * Behavior test: the Runtime updater must not download or probe an official
 * release this Desktop build cannot drive (DSH >= 0.1.2 needs the new web
 * auth/API), while a newer supported release still proceeds to the security
 * checks. Loads the real runtime-manager with stubbed electron, spawn and fetch.
 */
const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const os = require('os')
const path = require('path')
const { PACKAGE_NAME, REGISTRY_URL, OSV_URL } = require('../runtime-update-core')

const ROOT = path.join(__dirname, '..')

function registryMetadata(latest) {
  const integrity = `sha512-${Buffer.from(`fixture-${latest}`).toString('base64')}`
  return {
    name: PACKAGE_NAME,
    'dist-tags': { latest },
    versions: {
      [latest]: {
        name: PACKAGE_NAME,
        version: latest,
        repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
        dist: {
          integrity,
          tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${latest}.tgz`,
          signatures: [{ keyid: 'SHA256:Rml4dHVyZVJlZ2lzdHJ5S2V5', sig: Buffer.alloc(64, 7).toString('base64') }],
        },
      },
    },
  }
}

async function checkWithOfficialLatest(latest) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-supported-gate-'))
  const requests = []
  const spawns = []
  const electron = {
    app: { getPath: () => path.join(temp, 'userData'), isReady: () => false },
    Notification: Object.assign(function Notification() {}, { isSupported: () => false }),
  }
  const childProcess = { spawn: (...args) => { spawns.push(args); throw new Error('no process may be spawned') } }
  const originalLoad = Module._load
  const originalFetch = globalThis.fetch
  const savedRoot = process.env.DSH_DESKTOP_RUNTIME_ROOT
  process.env.DSH_DESKTOP_RUNTIME_ROOT = path.join(temp, 'runtime-root')
  Module._load = function stubbedLoad(request) {
    if (request === 'electron') return electron
    if (request === 'child_process') return childProcess
    return originalLoad.apply(this, arguments)
  }
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    if (String(url) === REGISTRY_URL) {
      return new Response(JSON.stringify(registryMetadata(latest)), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (String(url) === OSV_URL) return new Response('unavailable', { status: 503, headers: { 'content-type': 'text/plain' } })
    throw new Error(`unexpected request ${url}`)
  }
  const managerPath = require.resolve(path.join(ROOT, 'runtime-manager.js'))
  delete require.cache[managerPath]
  try {
    const manager = require(managerPath)
    const result = await manager.checkAndStageUpdate({ force: true, silent: true })
    return { result, requests, spawns, state: manager.loadState() }
  } finally {
    delete require.cache[managerPath]
    Module._load = originalLoad
    globalThis.fetch = originalFetch
    if (savedRoot === undefined) delete process.env.DSH_DESKTOP_RUNTIME_ROOT
    else process.env.DSH_DESKTOP_RUNTIME_ROOT = savedRoot
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

;(async () => {
  const unsupported = await checkWithOfficialLatest('0.2.0-rc.2')
  assert.strictEqual(unsupported.result.status, 'unsupported', JSON.stringify(unsupported.result))
  assert.strictEqual(unsupported.result.latest, '0.2.0-rc.2')
  assert.deepStrictEqual(unsupported.requests, [REGISTRY_URL], 'an unsupported release must not reach OSV, signature or GitHub checks')
  assert.strictEqual(unsupported.spawns.length, 0, 'an unsupported release must never be installed or probed')
  assert.strictEqual(unsupported.state.latestVersion, '0.2.0-rc.2')
  assert.strictEqual(unsupported.state.pendingVersion, null)
  assert.strictEqual(unsupported.state.lastError, null, 'an unsupported release is not an update error')

  const supported = await checkWithOfficialLatest('0.1.1')
  assert.strictEqual(supported.result.status, 'error', JSON.stringify(supported.result))
  assert.match(supported.result.error, /OSV/, 'a supported newer release must continue to the fail-closed security checks')
  assert.ok(supported.requests.includes(OSV_URL))

  console.log('[runtime-supported-gate] unsupported official Runtime is reported without download/probe; supported releases keep the full security chain')
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
