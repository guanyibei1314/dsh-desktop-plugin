'use strict'

const { createVerify } = require('crypto')
const { EXPECTED_REPOSITORY, PACKAGE_NAME, isSafeVersion, normalizeRepository } = require('./runtime-update-core')

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_REPOSITORY = 'deepseek-ai/deepseek-harness'
const GITHUB_RELEASE_ORIGIN = 'https://github.com'
const RELEASE_TAG_PREFIX = 'dsh-v'
const REGISTRY_KEYS_URL = 'https://registry.npmjs.org/-/npm/v1/keys'
const NPM_KEYTYPE = 'ecdsa-sha2-nistp256'

function expectedReleaseTag(version) {
  if (!isSafeVersion(version)) throw new Error('invalid DSH version for upstream release lookup')
  return `${RELEASE_TAG_PREFIX}${version}`
}

function officialReleaseApiUrl(version) {
  return `${GITHUB_API_ORIGIN}/repos/${GITHUB_REPOSITORY}/releases/tags/${encodeURIComponent(expectedReleaseTag(version))}`
}

function officialSourcePackageApiUrl(version) {
  const tag = expectedReleaseTag(version)
  return `${GITHUB_API_ORIGIN}/repos/${GITHUB_REPOSITORY}/contents/apps/cli/package.json?ref=${encodeURIComponent(tag)}`
}

function normalizeOfficialGitHubRelease(body, version) {
  const tag = expectedReleaseTag(version)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('official GitHub release response is invalid')
  if (body.tag_name !== tag) throw new Error('official GitHub release tag mismatch')
  if (body.draft !== false) throw new Error('official GitHub release must not be a draft')
  if (body.immutable !== true) throw new Error('official GitHub release is not immutable')
  if (typeof body.published_at !== 'string' || !Number.isFinite(Date.parse(body.published_at))) {
    throw new Error('official GitHub release is not published')
  }
  let html
  try { html = new URL(body.html_url) } catch (_) { throw new Error('official GitHub release URL is invalid') }
  if (html.protocol !== 'https:' || html.origin !== GITHUB_RELEASE_ORIGIN || html.pathname !== `/${GITHUB_REPOSITORY}/releases/tag/${tag}`) {
    throw new Error('official GitHub release URL identity mismatch')
  }
  return {
    tag,
    immutable: true,
    publishedAt: body.published_at,
    htmlUrl: html.href,
  }
}

function decodeGitHubContent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('official GitHub source response is invalid')
  if (body.type !== 'file' || body.encoding !== 'base64' || typeof body.content !== 'string') {
    throw new Error('official GitHub source response is not a base64 file')
  }
  const compact = body.content.replace(/\s+/g, '')
  if (compact.length === 0 || compact.length > 400000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error('official GitHub source payload is malformed')
  }
  return Buffer.from(compact, 'base64').toString('utf8')
}

function normalizeOfficialSourcePackage(body, version) {
  let pkg
  try { pkg = JSON.parse(decodeGitHubContent(body)) } catch (error) {
    if (/official GitHub/.test(error && error.message ? error.message : '')) throw error
    throw new Error('official GitHub source package.json is invalid')
  }
  if (!pkg || pkg.name !== PACKAGE_NAME || pkg.version !== version) {
    throw new Error('official GitHub source package identity/version mismatch')
  }
  const repository = normalizeRepository(pkg.repository)
  if (repository !== EXPECTED_REPOSITORY) throw new Error('official GitHub source repository identity mismatch')
  return { name: pkg.name, version: pkg.version, repository }
}

function normalizeRegistryKeys(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.keys)) throw new Error('npm Registry signing-key response is invalid')
  const keys = []
  for (const item of body.keys.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue
    const keyid = typeof item.keyid === 'string' ? item.keyid.trim() : ''
    const keytype = typeof item.keytype === 'string' ? item.keytype.trim() : ''
    const scheme = typeof item.scheme === 'string' ? item.scheme.trim() : ''
    const key = typeof item.key === 'string' ? item.key.replace(/\s+/g, '') : ''
    if (!/^SHA256:[A-Za-z0-9+/_=-]{8,180}$/.test(keyid)) continue
    if (keytype !== NPM_KEYTYPE || scheme !== NPM_KEYTYPE) continue
    if (key.length < 80 || key.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(key)) continue
    let expiresAt = null
    if (item.expires !== null && item.expires !== undefined) {
      if (typeof item.expires !== 'string') continue
      expiresAt = Date.parse(item.expires)
      if (!Number.isFinite(expiresAt) || expiresAt <= now) continue
    }
    if (!keys.some((entry) => entry.keyid === keyid)) keys.push({ keyid, key, expiresAt })
  }
  if (keys.length === 0) throw new Error('npm Registry did not return a usable unexpired signing key')
  return keys
}

function pemPublicKey(base64) {
  const lines = base64.match(/.{1,64}/g) || []
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

function verifyNpmRegistrySignature(release, keysBody, now = Date.now()) {
  if (!release || release.packageName !== PACKAGE_NAME || !isSafeVersion(release.version)) {
    throw new Error('npm Registry signature release identity is invalid')
  }
  if (typeof release.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/=]+$/.test(release.integrity)) {
    throw new Error('npm Registry signature release integrity is invalid')
  }
  if (!Array.isArray(release.signatures) || release.signatures.length === 0) {
    throw new Error('npm Registry signature is missing for the exact DSH release')
  }
  const keys = normalizeRegistryKeys(keysBody, now)
  const message = `${release.packageName}@${release.version}:${release.integrity}`
  for (const signature of release.signatures) {
    const key = keys.find((entry) => entry.keyid === signature.keyid)
    if (!key) continue
    try {
      const verifier = createVerify('SHA256')
      verifier.end(message)
      if (verifier.verify(pemPublicKey(key.key), signature.sig, 'base64')) {
        return { keyid: key.keyid, message }
      }
    } catch (_) {
      // Try another trusted matching signature/key; all failures remain fail-closed.
    }
  }
  throw new Error('npm Registry ECDSA signature verification failed for exact DSH version/integrity')
}

module.exports = {
  GITHUB_API_ORIGIN,
  GITHUB_REPOSITORY,
  RELEASE_TAG_PREFIX,
  REGISTRY_KEYS_URL,
  expectedReleaseTag,
  officialReleaseApiUrl,
  officialSourcePackageApiUrl,
  normalizeOfficialGitHubRelease,
  normalizeOfficialSourcePackage,
  normalizeRegistryKeys,
  verifyNpmRegistrySignature,
}
