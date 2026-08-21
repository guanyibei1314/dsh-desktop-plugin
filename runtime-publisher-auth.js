'use strict'

const { EXPECTED_REPOSITORY, PACKAGE_NAME, isSafeVersion, normalizeRepository } = require('./runtime-update-core')

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_REPOSITORY = 'deepseek-ai/deepseek-harness'
const GITHUB_RELEASE_ORIGIN = 'https://github.com'
const RELEASE_TAG_PREFIX = 'dsh-v'

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

module.exports = {
  GITHUB_API_ORIGIN,
  GITHUB_REPOSITORY,
  RELEASE_TAG_PREFIX,
  expectedReleaseTag,
  officialReleaseApiUrl,
  officialSourcePackageApiUrl,
  normalizeOfficialGitHubRelease,
  normalizeOfficialSourcePackage,
}
