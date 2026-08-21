'use strict'

const assert = require('assert')
const {
  assessNormalizedMetadata,
  assessPackageSecurity,
  npmMetadataUrl,
} = require('../plugin-security')

const NOW = Date.parse('2026-08-17T00:00:00Z')

function npmPayload(options = {}) {
  const version = options.version || '1.2.3'
  const deps = {}
  for (let i = 0; i < (options.dependencies || 2); i++) deps[`dep-${i}`] = '1.0.0'
  return {
    'dist-tags': { latest: version },
    versions: {
      [version]: {
        scripts: options.scripts || {},
        dependencies: deps,
        dist: options.integrity === false ? {} : {
          integrity: 'sha512-safe',
          shasum: '0123456789abcdef0123456789abcdef01234567',
          tarball: `https://registry.npmjs.org/%40example%2Fsafe/-/safe-${version}.tgz`,
        },
        repository: options.repository === false ? undefined : { url: 'https://github.com/example/plugin.git' },
        deprecated: options.deprecated || '',
      },
    },
    maintainers: options.maintainers === false ? [] : [{ name: 'maintainer' }],
    time: { [version]: options.publishedAt || '2026-01-01T00:00:00Z' },
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function main() {
  const safeMetadata = {
    packageName: '@example/safe', latestVersion: '1.2.3', publishedAt: '2026-01-01T00:00:00Z',
    maintainers: 2, dependencies: 3, lifecycleScripts: [], integrity: 'sha512-safe', shasum: '',
    tarball: 'https://registry.npmjs.org/%40example%2Fsafe/-/safe-1.2.3.tgz',
    repository: 'https://github.com/example/safe', deprecated: '',
  }
  const safe = assessNormalizedMetadata(safeMetadata, [], NOW)
  assert.equal(safe.level, 'low')
  assert.equal(safe.blocked, false)

  const criticalMetadata = {
    packageName: 'danger-plugin', latestVersion: '9.9.9', publishedAt: '2026-08-16T12:00:00Z',
    maintainers: 0, dependencies: 300, lifecycleScripts: ['preinstall', 'postinstall'], integrity: '', shasum: '',
    tarball: '', repository: '', deprecated: '',
  }
  const critical = assessNormalizedMetadata(criticalMetadata, [
    { id: 'GHSA-1' }, { id: 'GHSA-2' }, { id: 'GHSA-3' },
  ], NOW)
  assert.equal(critical.level, 'critical')
  assert.equal(critical.blocked, true)
  assert.ok(critical.score >= 70)

  assert.equal(npmMetadataUrl('@scope/pkg'), 'https://registry.npmjs.org/%40scope%2Fpkg')
  assert.throws(() => npmMetadataUrl('https://evil.invalid/x'), /非法 npm 包名/)
  assert.throws(() => npmMetadataUrl('pkg;calc.exe'), /非法 npm 包名/)

  const calls = []
  const safeFetch = async (url, options) => {
    calls.push({ url, options })
    if (url.startsWith('https://registry.npmjs.org/')) return jsonResponse(npmPayload())
    if (url === 'https://api.osv.dev/v1/query') return jsonResponse({ vulns: [] })
    throw new Error(`unexpected URL ${url}`)
  }
  const live = await assessPackageSecurity('@example/safe', { fetchImpl: safeFetch, now: NOW })
  assert.equal(live.ok, true)
  assert.equal(live.assessment.blocked, false)
  assert.ok(live.installationPlan)
  assert.equal(live.installationPlan.spec, '@example/safe@1.2.3')
  assert.equal(live.installationPlan.registry, 'https://registry.npmjs.org/')
  assert.equal(live.installationPlan.integrity, 'sha512-safe')
  assert.equal(calls.length, 2)
  assert.ok(calls.every((call) => call.options.redirect === 'manual'))

  const osvOutageFetch = async (url) => {
    if (url.startsWith('https://registry.npmjs.org/')) {
      return jsonResponse(npmPayload({ scripts: { install: 'node install.js' } }))
    }
    if (url === 'https://api.osv.dev/v1/query') throw new Error('osv offline')
    throw new Error(`unexpected URL ${url}`)
  }
  const osvOutage = await assessPackageSecurity('@example/safe', { fetchImpl: osvOutageFetch, now: NOW })
  assert.equal(osvOutage.ok, true)
  assert.equal(osvOutage.assessment.score, 100)
  assert.equal(osvOutage.assessment.level, 'unknown')
  assert.equal(osvOutage.assessment.blocked, true)
  assert.equal(osvOutage.assessment.requiresConfirmation, false)
  assert.equal(osvOutage.installationPlan, null)
  assert.ok(osvOutage.assessment.reasons.some((reason) => reason.includes('fail-closed')))
  assert.ok(!osvOutage.assessment.positives.some((item) => item.startsWith('OSV 未发现')))

  const unavailable = await assessPackageSecurity('@example/safe', {
    fetchImpl: async () => { throw new Error('offline') },
    now: NOW,
  })
  assert.equal(unavailable.ok, false)
  assert.equal(unavailable.assessment.level, 'unknown')
  assert.equal(unavailable.assessment.blocked, true)
  assert.equal(unavailable.installationPlan, null)

  console.log('[plugin-security] safe, critical, immutable-plan and OSV fail-closed tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
