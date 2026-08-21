'use strict'

const assert = require('assert')
const {
  EXPECTED_REPOSITORY,
  PACKAGE_NAME,
  compareVersions,
  isDshBinArgument,
  isSafeVersion,
  normalizeAttestations,
  normalizeOsvResponse,
  normalizeRegistryRelease,
  normalizeRepository,
  selectRegistryTag,
  shouldCheck,
} = require('../runtime-update-core')

function versionFixture(version, integrity) {
  return {
    name: PACKAGE_NAME,
    version,
    repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
    dist: {
      integrity,
      tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${version}.tgz`,
      attestations: {
        url: `https://registry.npmjs.org/-/npm/v1/attestations/@deepseek-ai%2fdsh@${version}`,
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
      },
    },
  }
}

function fixture() {
  return {
    name: PACKAGE_NAME,
    'dist-tags': { latest: '0.1.0-rc.7', next: '0.1.0-rc.8' },
    versions: {
      '0.1.0-rc.7': versionFixture('0.1.0-rc.7', 'sha512-QUJDREVGR0g='),
      '0.1.0-rc.8': versionFixture('0.1.0-rc.8', 'sha512-SElKS0xNTk8='),
    },
    time: {
      '0.1.0-rc.7': '2026-08-18T00:00:00.000Z',
      '0.1.0-rc.8': '2026-08-19T00:00:00.000Z',
    },
  }
}

assert.strictEqual(compareVersions('0.1.0-rc.6', '0.1.0-rc.7'), -1)
assert.strictEqual(compareVersions('0.1.0-rc.10', '0.1.0-rc.7'), 1)
assert.strictEqual(compareVersions('0.1.0', '0.1.0-rc.99'), 1)
assert.strictEqual(compareVersions('1.0.0', '0.99.99'), 1)
assert.strictEqual(isSafeVersion('0.1.0-rc.7'), true)
assert.strictEqual(isSafeVersion('0.1.0-rc.7;calc.exe'), false)

assert.strictEqual(normalizeRepository('git+https://github.com/deepseek-ai/deepseek-harness.git'), EXPECTED_REPOSITORY)
assert.strictEqual(normalizeRepository({ url: 'https://github.com/deepseek-ai/deepseek-harness/' }), EXPECTED_REPOSITORY)
assert.strictEqual(normalizeRepository('https://evil.example/deepseek-ai/deepseek-harness'), '')
assert.strictEqual(normalizeAttestations(versionFixture('0.1.0-rc.7', 'sha512-QUJDREVGR0g=').dist).predicateType, 'https://slsa.dev/provenance/v1')

assert.strictEqual(selectRegistryTag(fixture(), 'stable'), '0.1.0-rc.7')
assert.strictEqual(selectRegistryTag(fixture(), 'latest'), '0.1.0-rc.8')
const release = normalizeRegistryRelease(fixture(), 'stable')
assert.strictEqual(release.packageName, PACKAGE_NAME)
assert.strictEqual(release.version, '0.1.0-rc.7')
assert.strictEqual(release.repository, EXPECTED_REPOSITORY)
assert.strictEqual(release.attestations.predicateType, 'https://slsa.dev/provenance/v1')
assert.strictEqual(release.lifecycleScripts, false)
assert.ok(release.integrity.startsWith('sha512-'))

assert.deepStrictEqual(normalizeOsvResponse({ vulns: [{ id: 'GHSA-test' }, { id: 'GHSA-test' }, { id: 'OSV-2', withdrawn: '2026-01-01' }] }), ['GHSA-test'])
assert.strictEqual(isDshBinArgument('C:\\app\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'), true)
assert.strictEqual(isDshBinArgument('/tmp/node_modules/@deepseek-ai/dsh/lib/bin.js'), true)
assert.strictEqual(isDshBinArgument('/tmp/node_modules/not-dsh/lib/bin.js'), false)
assert.strictEqual(shouldCheck(null, Date.now()), true)
assert.strictEqual(shouldCheck(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), Date.now()), true)
assert.strictEqual(shouldCheck(new Date().toISOString(), Date.now()), false)

console.log('[runtime-update] functional publisher identity/provenance metadata tests passed')
