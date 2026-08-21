'use strict'

const assert = require('assert')
const {
  PACKAGE_NAME,
  isDshBinArgument,
  isHttpsRegistryTarball,
  isSafeVersion,
  normalizeRegistryRelease,
  selectRegistryTag,
} = require('../runtime-update-core')

function good() {
  return {
    name: PACKAGE_NAME,
    'dist-tags': { latest: '0.1.0-rc.7' },
    versions: {
      '0.1.0-rc.7': {
        name: PACKAGE_NAME,
        version: '0.1.0-rc.7',
        repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
        dist: {
          integrity: 'sha512-QUJDREVGR0g=',
          tarball: 'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.7.tgz',
          attestations: {
            url: 'https://registry.npmjs.org/-/npm/v1/attestations/@deepseek-ai%2fdsh@0.1.0-rc.7',
            provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
          },
        },
      },
    },
  }
}

function expectReject(mutator, message) {
  const value = good()
  mutator(value)
  assert.throws(() => normalizeRegistryRelease(value, 'stable'), message)
}

expectReject((m) => { m.name = '@attacker/dsh' }, /package mismatch/)
expectReject((m) => { m['dist-tags'].latest = '0.1.0-rc.7;calc.exe' }, /latest tag/)
expectReject((m) => { m.versions['0.1.0-rc.7'].name = '@attacker/dsh' }, /version metadata mismatch/)
expectReject((m) => { m.versions['0.1.0-rc.7'].repository = 'https://github.com/attacker/fake-dsh' }, /repository identity/)
expectReject((m) => { m.versions['0.1.0-rc.7'].repository = 'git+ssh://git@github.com/deepseek-ai/deepseek-harness.git' }, /repository identity/)
expectReject((m) => { m.versions['0.1.0-rc.7'].dist.integrity = 'sha1-deadbeef' }, /sha512 integrity/)
expectReject((m) => { m.versions['0.1.0-rc.7'].dist.tarball = 'http://registry.npmjs.org/evil.tgz' }, /tarball URL/)
expectReject((m) => { m.versions['0.1.0-rc.7'].dist.tarball = 'https://registry.npmjs.org.evil.example/evil.tgz' }, /tarball URL/)
expectReject((m) => { m.versions['0.1.0-rc.7'].dist.tarball = 'https://user:pass@registry.npmjs.org/evil.tgz' }, /tarball URL/)

const missingProvenance = good()
delete missingProvenance.versions['0.1.0-rc.7'].dist.attestations
assert.strictEqual(normalizeRegistryRelease(missingProvenance).attestations, null)

const forgedProvenance = good()
forgedProvenance.versions['0.1.0-rc.7'].dist.attestations = {
  url: 'https://evil.example/attestations',
  provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
}
assert.strictEqual(normalizeRegistryRelease(forgedProvenance).attestations, null)

const wrongPredicate = good()
wrongPredicate.versions['0.1.0-rc.7'].dist.attestations.provenance.predicateType = 'https://example.invalid/not-provenance'
assert.strictEqual(normalizeRegistryRelease(wrongPredicate).attestations, null)

const scripted = good()
scripted.versions['0.1.0-rc.7'].scripts = { postinstall: 'powershell -enc AAAA' }
assert.strictEqual(normalizeRegistryRelease(scripted).lifecycleScripts, true)

const polluted = JSON.parse(JSON.stringify(good()))
polluted.__proto__ = { polluted: true }
assert.strictEqual(normalizeRegistryRelease(polluted).version, '0.1.0-rc.7')
assert.strictEqual({}.polluted, undefined)

const downgradeNext = good()
downgradeNext['dist-tags'].next = '0.1.0-rc.6'
assert.strictEqual(selectRegistryTag(downgradeNext, 'latest'), '0.1.0-rc.7')

for (const payload of [
  '../evil',
  '0.1.0 && calc',
  '0.1.0\npostinstall',
  'v0.1.0',
  '',
]) assert.strictEqual(isSafeVersion(payload), false)

assert.strictEqual(isHttpsRegistryTarball('https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.7.tgz'), true)
assert.strictEqual(isHttpsRegistryTarball('https://evil.example/@deepseek-ai/dsh.tgz'), false)
assert.strictEqual(isDshBinArgument('C:\\tmp\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js && calc.exe'), false)
assert.strictEqual(isDshBinArgument('C:\\tmp\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'), true)

console.log('[runtime-update-red-blue] publisher identity, provenance metadata and adversarial cases passed')
