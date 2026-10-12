'use strict'

const assert = require('assert')
const { createSign, generateKeyPairSync } = require('crypto')
const {
  EXPECTED_REPOSITORY,
  FIRST_UNSUPPORTED_DSH_VERSION,
  PACKAGE_NAME,
  compareVersions,
  evaluateBundledRuntime,
  firstPartyOverridesYaml,
  isDshBinArgument,
  isSafeVersion,
  isSupportedRuntimeVersion,
  lockedFirstPartyDrift,
  normalizeAttestations,
  normalizeOsvResponse,
  normalizeRegistryRelease,
  normalizeRegistryVersion,
  normalizeRepository,
  selectRegistryTag,
  shouldCheck,
} = require('../runtime-update-core')
const {
  REGISTRY_KEYS_URL,
  expectedReleaseTag,
  officialReleaseApiUrl,
  officialSourcePackageApiUrl,
  normalizeOfficialGitHubRelease,
  normalizeOfficialSourcePackage,
  normalizeRegistryKeys,
  verifyNpmRegistrySignature,
} = require('../runtime-publisher-auth')

const registryKeyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const registryPublicKey = registryKeyPair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const registryKeyId = 'SHA256:VGVzdFJlZ2lzdHJ5U2lnbmluZ0tleQ=='

function signRelease(version, integrity) {
  const signer = createSign('SHA256')
  signer.end(`${PACKAGE_NAME}@${version}:${integrity}`)
  return signer.sign(registryKeyPair.privateKey).toString('base64')
}

function registryKeysFixture(expires = null) {
  return {
    keys: [{
      expires,
      keyid: registryKeyId,
      keytype: 'ecdsa-sha2-nistp256',
      scheme: 'ecdsa-sha2-nistp256',
      key: registryPublicKey,
    }],
  }
}

function versionFixture(version, integrity) {
  return {
    name: PACKAGE_NAME,
    version,
    repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
    dist: {
      integrity,
      tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${version}.tgz`,
      signatures: [{ keyid: registryKeyId, sig: signRelease(version, integrity) }],
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
assert.strictEqual(release.signatures.length, 1)
assert.strictEqual(REGISTRY_KEYS_URL, 'https://registry.npmjs.org/-/npm/v1/keys')
assert.strictEqual(normalizeRegistryKeys(registryKeysFixture()).length, 1)
const registryVerification = verifyNpmRegistrySignature(release, registryKeysFixture())
assert.strictEqual(registryVerification.keyid, registryKeyId)
assert.strictEqual(registryVerification.message, `${PACKAGE_NAME}@0.1.0-rc.7:sha512-QUJDREVGR0g=`)

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

// Desktop drives only the pre-auth DSH web Runtime (DSH 0.1.2 added launch-token
// cookies; 0.2 replaced the HTTP RPC surface).
assert.strictEqual(FIRST_UNSUPPORTED_DSH_VERSION, '0.1.2-0')
for (const version of ['0.1.0-rc.8', '0.1.1-rc.2', '0.1.1']) assert.strictEqual(isSupportedRuntimeVersion(version), true, version)
for (const version of ['0.1.2-alpha.2', '0.1.2-rc.1', '0.1.5-rc.2', '0.1.7-rc.2', '0.2.0-rc.2', '1.0.0', 'not-a-version']) {
  assert.strictEqual(isSupportedRuntimeVersion(version), false, version)
}

function gateFixture(latest, versions) {
  const metadata = { name: PACKAGE_NAME, 'dist-tags': { latest }, versions: {} }
  for (const [index, version] of versions.entries()) {
    metadata.versions[version] = versionFixture(version, `sha512-${Buffer.from(`gate-${index}`).toString('base64')}`)
  }
  return metadata
}
const exact = normalizeRegistryVersion(gateFixture('0.2.0-rc.2', ['0.1.1-rc.2', '0.2.0-rc.2']), '0.1.1-rc.2')
assert.strictEqual(exact.version, '0.1.1-rc.2')
assert.throws(() => normalizeRegistryVersion(gateFixture('0.2.0-rc.2', ['0.2.0-rc.2']), '0.1.1-rc.2'), /registry version metadata mismatch/)
assert.throws(() => normalizeRegistryVersion({ name: 'evil', versions: {} }, '0.1.1-rc.2'), /package mismatch/)
assert.throws(() => normalizeRegistryVersion(gateFixture('0.1.1-rc.2', ['0.1.1-rc.2']), '0.1.1;calc'), /version is invalid/)

assert.strictEqual(evaluateBundledRuntime(gateFixture('0.1.1-rc.2', ['0.1.1-rc.2']), '0.1.1-rc.2').status, 'current')
const unsupportedLatest = evaluateBundledRuntime(gateFixture('0.2.0-rc.2', ['0.1.1-rc.2', '0.2.0-rc.2']), '0.1.1-rc.2')
assert.strictEqual(unsupportedLatest.status, 'latest-unsupported', 'a newer latest that needs the new web auth must not fail the gate')
assert.strictEqual(unsupportedLatest.latest.version, '0.2.0-rc.2')
assert.throws(
  () => evaluateBundledRuntime(gateFixture('0.1.1', ['0.1.1-rc.2', '0.1.1']), '0.1.1-rc.2'),
  /official latest=0\.1\.1 is supported/,
  'a newer supported latest must still be bundled',
)
assert.throws(
  () => evaluateBundledRuntime(gateFixture('0.2.0-rc.2', ['0.2.0-rc.2']), '0.2.0-rc.2'),
  /not supported by this Desktop build/,
  'bundling an unsupported Runtime must fail the gate',
)
assert.throws(
  () => evaluateBundledRuntime(gateFixture('0.2.0-rc.2', ['0.2.0-rc.2']), '0.1.1-rc.2'),
  /registry version metadata mismatch/,
  'the bundled version must be an official published release',
)

// Reinstalling the bundled Runtime pins the first-party family it ships; caret
// ranges otherwise resolve untested newer packages (cordis 4.0.4 broke boot).
const pins = { '@deepseek-ai/cordis': '4.0.1', '@deepseek-ai/dsh': '0.1.1-rc.2' }
assert.strictEqual(
  firstPartyOverridesYaml(Object.assign({ 'left-pad': '1.0.0', '@deepseek-ai/evil': '1.0.0\n  inject: 1' }, pins)),
  'overrides:\n  "@deepseek-ai/cordis": "4.0.1"\n  "@deepseek-ai/dsh": "0.1.1-rc.2"\n',
  'only valid first-party pins are written, quoted, in stable order',
)
assert.throws(() => firstPartyOverridesYaml({ 'left-pad': '1.0.0' }), /no valid first-party pins/)
const pinnedLock = [
  "lockfileVersion: '9.0'",
  '',
  'importers:',
  '  .:',
  '    dependencies:',
  "      '@deepseek-ai/dsh':",
  '        version: 0.1.1-rc.2',
  '',
  'packages:',
  '',
  "  '@deepseek-ai/cordis@4.0.1':",
  '    resolution: {integrity: sha512-AAAA}',
  '',
  "  '@deepseek-ai/dsh-authorization@0.1.1-rc.2':",
  '    resolution: {integrity: sha512-BBBB}',
  '',
  "  '@deepseek-ai/dsh@0.1.1-rc.2':",
  '    resolution: {integrity: sha512-CCCC}',
  '',
  '  commander@15.0.0:',
  '    resolution: {integrity: sha512-DDDD}',
  '',
  'snapshots:',
  '',
  "  '@deepseek-ai/cordis@4.0.4':",
  '    dependencies: {}',
  '',
].join('\n')
assert.deepStrictEqual(lockedFirstPartyDrift(pinnedLock, pins, '0.1.1-rc.2'), [], 'pinned packages and same-release peers pass; only the packages section counts')
assert.deepStrictEqual(
  lockedFirstPartyDrift(pinnedLock.replace("'@deepseek-ai/cordis@4.0.1':", "'@deepseek-ai/cordis@4.0.4':"), pins, '0.1.1-rc.2'),
  ['@deepseek-ai/cordis@4.0.4 (expected 4.0.1)'],
)
assert.deepStrictEqual(
  lockedFirstPartyDrift(pinnedLock.replace("'@deepseek-ai/dsh-authorization@0.1.1-rc.2':", "'@deepseek-ai/dsh-authorization@0.1.7-rc.2':"), pins, '0.1.1-rc.2'),
  ['@deepseek-ai/dsh-authorization@0.1.7-rc.2 (expected 0.1.1-rc.2)'],
  'an unpinned first-party peer must carry the release version',
)
assert.deepStrictEqual(lockedFirstPartyDrift('lockfileVersion: 9.0\n', pins, '0.1.1-rc.2'), ['pnpm lock has no packages section'])
assert.deepStrictEqual(lockedFirstPartyDrift('packages:\n\n  left-pad@1.0.0:\n    x: 1\n', pins, '0.1.1-rc.2'), ['pnpm lock lists no first-party packages'])

console.log('[runtime-update] functional exact npm Registry signature + provenance/immutable GitHub identity tests passed')
