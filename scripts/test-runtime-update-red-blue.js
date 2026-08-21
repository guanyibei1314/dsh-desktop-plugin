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
const {
  normalizeOfficialGitHubRelease,
  normalizeOfficialSourcePackage,
} = require('../runtime-publisher-auth')

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

function ghRelease() {
  return {
    tag_name: 'dsh-v0.1.0-rc.7',
    draft: false,
    immutable: true,
    published_at: '2026-08-21T12:35:00Z',
    html_url: 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.7',
  }
}

function ghSource(pkg = {}) {
  const body = Object.assign({
    name: PACKAGE_NAME,
    version: '0.1.0-rc.7',
    repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
  }, pkg)
  return { type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify(body)).toString('base64') }
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

const badTag = ghRelease(); badTag.tag_name = 'dsh-v0.1.0-rc.8'
assert.throws(() => normalizeOfficialGitHubRelease(badTag, '0.1.0-rc.7'), /tag mismatch/)
const draft = ghRelease(); draft.draft = true
assert.throws(() => normalizeOfficialGitHubRelease(draft, '0.1.0-rc.7'), /must not be a draft/)
const mutable = ghRelease(); mutable.immutable = false
assert.throws(() => normalizeOfficialGitHubRelease(mutable, '0.1.0-rc.7'), /not immutable/)
const unpub = ghRelease(); unpub.published_at = null
assert.throws(() => normalizeOfficialGitHubRelease(unpub, '0.1.0-rc.7'), /not published/)
const evilReleaseUrl = ghRelease(); evilReleaseUrl.html_url = 'https://github.com.evil.example/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.7'
assert.throws(() => normalizeOfficialGitHubRelease(evilReleaseUrl, '0.1.0-rc.7'), /URL identity/)
assert.throws(() => normalizeOfficialSourcePackage(ghSource({ name: '@attacker/dsh' }), '0.1.0-rc.7'), /identity\/version/)
assert.throws(() => normalizeOfficialSourcePackage(ghSource({ version: '0.1.0-rc.8' }), '0.1.0-rc.7'), /identity\/version/)
assert.throws(() => normalizeOfficialSourcePackage(ghSource({ repository: 'https://github.com/attacker/fake' }), '0.1.0-rc.7'), /repository identity/)
assert.throws(() => normalizeOfficialSourcePackage({ type: 'file', encoding: 'base64', content: '***' }, '0.1.0-rc.7'), /malformed/)
assert.throws(() => normalizeOfficialSourcePackage({ type: 'symlink', encoding: 'base64', content: 'e30=' }, '0.1.0-rc.7'), /base64 file/)

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

console.log('[runtime-update-red-blue] npm provenance and immutable GitHub publisher fallback adversarial cases passed')
