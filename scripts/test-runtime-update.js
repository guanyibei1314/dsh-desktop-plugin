'use strict'

const assert = require('assert')
const {
  PACKAGE_NAME,
  compareVersions,
  isDshBinArgument,
  isSafeVersion,
  normalizeOsvResponse,
  normalizeRegistryRelease,
  selectRegistryTag,
  shouldCheck,
} = require('../runtime-update-core')

function fixture() {
  return {
    name: PACKAGE_NAME,
    'dist-tags': { latest: '0.1.0-rc.7', next: '0.1.0-rc.8' },
    versions: {
      '0.1.0-rc.7': {
        name: PACKAGE_NAME,
        version: '0.1.0-rc.7',
        dist: {
          integrity: 'sha512-QUJDREVGR0g=',
          tarball: 'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.7.tgz',
        },
      },
      '0.1.0-rc.8': {
        name: PACKAGE_NAME,
        version: '0.1.0-rc.8',
        dist: {
          integrity: 'sha512-SElKS0xNTk8=',
          tarball: 'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.8.tgz',
        },
      },
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

assert.strictEqual(selectRegistryTag(fixture(), 'stable'), '0.1.0-rc.7')
assert.strictEqual(selectRegistryTag(fixture(), 'latest'), '0.1.0-rc.8')
const release = normalizeRegistryRelease(fixture(), 'stable')
assert.strictEqual(release.packageName, PACKAGE_NAME)
assert.strictEqual(release.version, '0.1.0-rc.7')
assert.strictEqual(release.lifecycleScripts, false)
assert.ok(release.integrity.startsWith('sha512-'))

assert.deepStrictEqual(normalizeOsvResponse({ vulns: [{ id: 'GHSA-test' }, { id: 'GHSA-test' }, { id: 'OSV-2', withdrawn: '2026-01-01' }] }), ['GHSA-test'])
assert.strictEqual(isDshBinArgument('C:\\app\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'), true)
assert.strictEqual(isDshBinArgument('/tmp/node_modules/@deepseek-ai/dsh/lib/bin.js'), true)
assert.strictEqual(isDshBinArgument('/tmp/node_modules/not-dsh/lib/bin.js'), false)
assert.strictEqual(shouldCheck(null, Date.now()), true)
assert.strictEqual(shouldCheck(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), Date.now()), true)
assert.strictEqual(shouldCheck(new Date().toISOString(), Date.now()), false)

console.log('[runtime-update] functional tests passed')
