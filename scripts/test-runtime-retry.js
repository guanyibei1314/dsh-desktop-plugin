'use strict'
/**
 * Behavior tests: Runtime update checks under GitHub rate limits and outages.
 * Publisher checks run before anything is installed, transient failures retry
 * at the time the service asked for (bounded) instead of a full day later, and
 * real verification failures keep the daily cadence. Real runtime-manager on a
 * temp runtime root with a stubbed registry, OSV and GitHub API.
 */
const assert = require('assert')
const { createSign, generateKeyPairSync } = require('crypto')
const fs = require('fs')
const path = require('path')
const { withDesktop } = require('./behavior-harness')
const { OSV_URL, PACKAGE_NAME, REGISTRY_URL } = require('../runtime-update-core')
const { REGISTRY_KEYS_URL, officialReleaseApiUrl } = require('../runtime-publisher-auth')

const VERSION = '0.1.1-rc.3'
const INTEGRITY = `sha512-${Buffer.from('retry-fixture').toString('base64')}`
const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const KEY_ID = 'SHA256:UmV0cnlUZXN0UmVnaXN0cnlLZXk='

function signature() {
  const signer = createSign('SHA256')
  signer.end(`${PACKAGE_NAME}@${VERSION}:${INTEGRITY}`)
  return signer.sign(keyPair.privateKey).toString('base64')
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: Object.assign({ 'content-type': 'application/json' }, headers) })
}

function registry() {
  return {
    name: PACKAGE_NAME,
    'dist-tags': { latest: VERSION },
    versions: {
      [VERSION]: {
        name: PACKAGE_NAME,
        version: VERSION,
        repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
        dist: {
          integrity: INTEGRITY,
          tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${VERSION}.tgz`,
          signatures: [{ keyid: KEY_ID, sig: signature() }],
        },
      },
    },
  }
}

const KEYS = {
  keys: [{
    keyid: KEY_ID,
    keytype: 'ecdsa-sha2-nistp256',
    scheme: 'ecdsa-sha2-nistp256',
    key: keyPair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    expires: null,
  }],
}

/** Registry/OSV/keys succeed; the GitHub release lookup answers with `github`. */
function services(github, requests, seen = []) {
  return async (url, init) => {
    requests.push(url)
    seen.push({ url, headers: Object.assign({}, init && init.headers) })
    if (url === REGISTRY_URL) return json(registry())
    if (url === OSV_URL) return json({})
    if (url === REGISTRY_KEYS_URL) return json(KEYS)
    if (url === officialReleaseApiUrl(VERSION)) return github()
    throw new TypeError(`unexpected request ${url}`)
  }
}

function minutesUntil(iso) {
  return (Date.parse(iso) - Date.now()) / 60000
}

const scenarios = []
function scenario(name, run) {
  scenarios.push({ name, run })
}

scenario('A GitHub rate limit fails before any install and retries at the reset time', () => {
  const requests = []
  const reset = Math.floor(Date.now() / 1000) + 20 * 60
  const github = () => json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) })
  return withDesktop({ env: { DSH_RUNTIME_AUTO_UPDATE: '1' }, fetch: services(github, requests) }, async (h) => {
    const manager = h.require('runtime-manager.js')

    const first = await manager.checkAndStageUpdate({ silent: true })
    assert.strictEqual(first.status, 'error', JSON.stringify(first))
    assert.match(first.error, /api\.github\.com 请求被限流（HTTP 403）/)
    assert.strictEqual(h.processes.children.length, 0, 'a rate-limited publisher check must stop before pnpm downloads anything')
    assert.ok(Math.abs(minutesUntil(first.retryAt) - 20) < 1, `retry follows X-RateLimit-Reset, got ${first.retryAt}`)
    assert.strictEqual(manager.loadState().retryAt, first.retryAt)
    assert.ok(!fs.existsSync(path.join(process.env.DSH_DESKTOP_RUNTIME_ROOT, 'versions', VERSION)), 'no version directory is created')

    const asked = requests.length
    const early = await manager.checkAndStageUpdate({ silent: true })
    assert.strictEqual(early.status, 'deferred', 'automatic checks wait for the retry time')
    assert.strictEqual(requests.length, asked, 'a deferred check makes no requests')

    // Once the retry time has passed, the next automatic check runs even though
    // the last check was minutes ago (the daily interval does not apply).
    const state = manager.loadState()
    state.retryAt = new Date(Date.now() - 1000).toISOString()
    fs.writeFileSync(manager.stateFile(), JSON.stringify(state))
    const retried = await manager.checkAndStageUpdate({ silent: true })
    assert.strictEqual(retried.status, 'error', JSON.stringify(retried))
    assert.ok(requests.length > asked, 'the retry contacts the services again')
  })
})

scenario('Network errors and outages retry within the bounded default', () => {
  const requests = []
  const github = () => { throw new TypeError('fetch failed: ECONNRESET') }
  return withDesktop({ env: { DSH_RUNTIME_AUTO_UPDATE: '1' }, fetch: services(github, requests) }, async (h) => {
    const result = await h.require('runtime-manager.js').checkAndStageUpdate({ silent: true })
    assert.strictEqual(result.status, 'error')
    assert.match(result.error, /暂时无法访问/)
    assert.ok(Math.abs(minutesUntil(result.retryAt) - 60) < 1, `default transient retry is one hour, got ${result.retryAt}`)
  })
})

scenario('A huge Retry-After is clamped; a tiny one waits at least 15 minutes', async () => {
  for (const [retryAfter, expectedMinutes] of [['86400', 360], ['5', 15]]) {
    const requests = []
    const github = () => json({ message: 'slow down' }, 429, { 'retry-after': retryAfter })
    await withDesktop({ env: { DSH_RUNTIME_AUTO_UPDATE: '1' }, fetch: services(github, requests) }, async (h) => {
      const result = await h.require('runtime-manager.js').checkAndStageUpdate({ silent: true })
      assert.ok(Math.abs(minutesUntil(result.retryAt) - expectedMinutes) < 1, `Retry-After ${retryAfter}s -> ${result.retryAt}`)
    })
  }
})

scenario('A CI GitHub token goes only to api.github.com and leaves the inherited environment', async () => {
  for (const token of ['ci-read-only-token', undefined]) {
    const requests = []
    const seen = []
    const github = () => json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' })
    const env = { DSH_RUNTIME_AUTO_UPDATE: '1', DSH_RUNTIME_GITHUB_TOKEN: token }
    await withDesktop({ env, fetch: services(github, requests, seen) }, async (h) => {
      const manager = h.require('runtime-manager.js')
      assert.strictEqual(process.env.DSH_RUNTIME_GITHUB_TOKEN, undefined, 'DSH Runtime, pnpm and npm children must not inherit the token')
      await manager.checkAndStageUpdate({ silent: true })
      const githubRequests = seen.filter(({ url }) => new URL(url).origin === 'https://api.github.com')
      assert.ok(githubRequests.length > 0, 'the publisher check reaches api.github.com')
      for (const { headers } of githubRequests) {
        assert.strictEqual(headers.authorization, token ? `Bearer ${token}` : undefined)
      }
      for (const { url, headers } of seen.filter((request) => !githubRequests.includes(request))) {
        assert.ok(!('authorization' in headers), `no credential is sent to ${url}`)
      }
    })
  }
})

scenario('A real verification failure keeps the daily cadence', () => {
  const requests = []
  const github = () => json({ tag_name: `dsh-v${VERSION}`, draft: false, immutable: false, published_at: '2026-10-01T00:00:00Z', html_url: `https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${VERSION}` })
  return withDesktop({ env: { DSH_RUNTIME_AUTO_UPDATE: '1' }, fetch: services(github, requests) }, async (h) => {
    const manager = h.require('runtime-manager.js')
    const result = await manager.checkAndStageUpdate({ silent: true })
    assert.strictEqual(result.status, 'error')
    assert.match(result.error, /not immutable/)
    assert.strictEqual(result.retryAt, null, 'non-transient failures are not retried early')
    assert.strictEqual((await manager.checkAndStageUpdate({ silent: true })).status, 'fresh')
    assert.strictEqual(h.processes.children.length, 0)
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
  console.log(`[runtime-retry] ${scenarios.length} behavior scenarios passed: publisher checks before install, bounded transient retry, CI token scoped to api.github.com, daily cadence for real failures`)
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
