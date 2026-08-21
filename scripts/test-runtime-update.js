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
const {
  expectedReleaseTag,
  officialReleaseApiUrl,
  officialSourcePackageApiUrl,
  normalizeOfficialGitHubRelease,
  normalizeOfficialSourcePackage,
} = require('../runtime-publisher-auth')

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

function githubReleaseFixture(version = '0.1.0-rc.7') {
  return {
    tag_name: `dsh-v${version}`,
    draft: false,
    immutable: true,
    published_at: '2026-08-21T12:35:00Z',
    html_url: `https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${version}`,
  }
}

function githubSourceFixture(version = '0.1.0-rc.7') {
  const pkg = {
    name: PACKAGE_NAME,
    version,
    repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
  }
  return {
    type: 'file',
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(pkg)).toString('base64'),
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

assert.strictEqual(expectedReleaseTag('0.1.0-rc.7'), 'dsh-v0.1.0-rc.7')
assert.strictEqual(officialReleaseApiUrl('0.1.0-rc.7'), 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases/tags/dsh-v0.1.0-rc.7')
assert.strictEqual(officialSourcePackageApiUrl('0.1.0-rc.7'), 'https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/apps/cli/package.json?ref=dsh-v0.1.0-rc.7')
const ghRelease = normalizeOfficialGitHubRelease(githubReleaseFixture(), '0.1.0-rc.7')
assert.strictEqual(ghRelease.tag, 'dsh-v0.1.0-rc.7')
assert.strictEqual(ghRelease.immutable, true)
const ghPkg = normalizeOfficialSourcePackage(githubSourceFixture(), '0.1.0-rc.7')
assert.strictEqual(ghPkg.name, PACKAGE_NAME)
assert.strictEqual(ghPkg.version, '0.1.0-rc.7')
assert.strictEqual(ghPkg.repository, EXPECTED_REPOSITORY)

assert.deepStrictEqual(normalizeOsvResponse({ vulns: [{ id: 'GHSA-test' }, { id: 'GHSA-test' }, { id: 'OSV-2', withdrawn: '2026-01-01' }] }), ['GHSA-test'])
assert.strictEqual(isDshBinArgument('C:\\app\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'), true)
assert.strictEqual(isDshBinArgument('/tmp/node_modules/@deepseek-ai/dsh/lib/bin.js'), true)
assert.strictEqual(isDshBinArgument('/tmp/node_modules/not-dsh/lib/bin.js'), false)
assert.strictEqual(shouldCheck(null, Date.now()), true)
assert.strictEqual(shouldCheck(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), Date.now()), true)
assert.strictEqual(shouldCheck(new Date().toISOString(), Date.now()), false)

console.log('[runtime-update] functional npm provenance + immutable GitHub publisher identity tests passed')
