'use strict'

const PACKAGE_NAME = '@deepseek-ai/dsh'
const REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const REGISTRY_URL = `${REGISTRY_ORIGIN}/@deepseek-ai%2Fdsh`
const OSV_URL = 'https://api.osv.dev/v1/query'

function isSafeVersion(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 80) return false
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)
}

function parseVersion(value) {
  if (!isSafeVersion(value)) return null
  const clean = value.split('+', 1)[0]
  const dash = clean.indexOf('-')
  const core = (dash === -1 ? clean : clean.slice(0, dash)).split('.').map(Number)
  const pre = dash === -1 ? [] : clean.slice(dash + 1).split('.')
  return { major: core[0], minor: core[1], patch: core[2], pre }
}

function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    if (a[i] === undefined) return -1
    if (b[i] === undefined) return 1
    if (a[i] === b[i]) continue
    const aNumeric = /^\d+$/.test(a[i])
    const bNumeric = /^\d+$/.test(b[i])
    if (aNumeric && bNumeric) return Number(a[i]) < Number(b[i]) ? -1 : 1
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    return a[i] < b[i] ? -1 : 1
  }
  return 0
}

function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) throw new Error('invalid semver')
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePrerelease(left.pre, right.pre)
}

function isHttpsRegistryTarball(value) {
  if (typeof value !== 'string' || value.length > 1000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'registry.npmjs.org' && url.username === '' && url.password === ''
  } catch (err) {
    return false
  }
}

function hasLifecycleScripts(pkg) {
  const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {}
  return ['preinstall', 'install', 'postinstall'].some((name) => typeof scripts[name] === 'string' && scripts[name].trim().length > 0)
}

function selectRegistryTag(metadata, channel = 'stable') {
  if (!metadata || metadata.name !== PACKAGE_NAME || typeof metadata['dist-tags'] !== 'object' || !metadata['dist-tags']) {
    throw new Error('registry metadata package mismatch')
  }
  const tags = metadata['dist-tags']
  const stable = tags.latest
  if (!isSafeVersion(stable)) throw new Error('registry latest tag is invalid')
  if (channel === 'latest' && isSafeVersion(tags.next) && compareVersions(tags.next, stable) > 0) return tags.next
  return stable
}

function normalizeRegistryRelease(metadata, channel = 'stable') {
  const version = selectRegistryTag(metadata, channel)
  const versions = metadata && typeof metadata.versions === 'object' && metadata.versions ? metadata.versions : {}
  const pkg = versions[version]
  if (!pkg || pkg.name !== PACKAGE_NAME || pkg.version !== version) throw new Error('registry version metadata mismatch')
  const dist = pkg.dist && typeof pkg.dist === 'object' ? pkg.dist : {}
  if (typeof dist.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/=]+$/.test(dist.integrity)) {
    throw new Error('registry package is missing sha512 integrity')
  }
  if (!isHttpsRegistryTarball(dist.tarball)) throw new Error('registry tarball URL is not trusted')
  const publishedAt = metadata.time && typeof metadata.time[version] === 'string' ? metadata.time[version] : null
  return {
    packageName: PACKAGE_NAME,
    version,
    integrity: dist.integrity,
    tarball: dist.tarball,
    publishedAt,
    deprecated: typeof pkg.deprecated === 'string' && pkg.deprecated.trim() ? pkg.deprecated.trim().slice(0, 500) : null,
    lifecycleScripts: hasLifecycleScripts(pkg),
  }
}

function normalizeOsvResponse(body) {
  const vulns = body && Array.isArray(body.vulns) ? body.vulns : []
  const ids = []
  for (const vuln of vulns) {
    if (!vuln || vuln.withdrawn) continue
    const id = typeof vuln.id === 'string' ? vuln.id.trim() : ''
    if (id && !ids.includes(id)) ids.push(id.slice(0, 120))
  }
  return ids.slice(0, 100)
}

function isDshBinArgument(value) {
  if (typeof value !== 'string') return false
  const normalized = value.replace(/\\/g, '/').toLowerCase()
  return normalized.endsWith('/node_modules/@deepseek-ai/dsh/lib/bin.js')
}

function shouldCheck(lastCheckedAt, now = Date.now(), intervalMs = 24 * 60 * 60 * 1000) {
  if (!lastCheckedAt) return true
  const parsed = Date.parse(lastCheckedAt)
  if (!Number.isFinite(parsed)) return true
  return now - parsed >= intervalMs
}

module.exports = {
  PACKAGE_NAME,
  REGISTRY_ORIGIN,
  REGISTRY_URL,
  OSV_URL,
  compareVersions,
  isDshBinArgument,
  isHttpsRegistryTarball,
  isSafeVersion,
  normalizeOsvResponse,
  normalizeRegistryRelease,
  parseVersion,
  selectRegistryTag,
  shouldCheck,
}
