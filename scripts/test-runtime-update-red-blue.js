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
        dist: {
          integrity: 'sha512-QUJDREVGR0g=',
          tarball: 'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.7.tgz',
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
expectReject((m) => { m.versions['0.1.0-rc.7'].dist.integrity = 'sha1-deadbeef' }, /sha512 integrity/)
expectReject((m) => { m.versions['0.1.0-rc.7'].dist.tarball = 'http://registry.npmjs.org/evil.tgz' }, /tarball URL/)
expectReject((m) => { m.versions['0.1.0-rc.7'].dist.tarball = 'https://registry.npmjs.org.evil.example/evil.tgz' }, /tarball URL/)
expectReject((m) => { m.versions['0.1.0-rc.7'].dist.tarball = 'https://user:pass@registry.npmjs.org/evil.tgz' }, /tarball URL/)

const scripted = good()
scripted.versions['0.1.0-rc.7'].scripts = { postinstall: 'powershell -enc AAAA' }
assert.strictEqual(normalizeRegistryRelease(scripted).lifecycleScripts, true)

const polluted = JSON.parse('{"name":"@deepseek-ai/dsh","dist-tags":{"latest":"0.1.0-rc.7"},"versions":{"0.1.0-rc.7":{"name":"@deepseek-ai/dsh","version":"0.1.0-rc.7","dist":{"integrity":"sha512-QUJDREVGR0g=","tarball":"https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.7.tgz"}}},"__proto__":{"polluted":true}}')
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

console.log('[runtime-update-red-blue] adversarial cases passed')
