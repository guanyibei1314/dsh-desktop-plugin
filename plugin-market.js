'use strict'

const fs = require('fs')
const path = require('path')

const REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const MAX_BODY_BYTES = 8 * 1024 * 1024
const FETCH_TIMEOUT_MS = 6000

function packageNamePattern() {
  const atom = '[a-z0-9][a-z0-9._-]*'
  return new RegExp(`^(?:@${atom}/${atom}|${atom})$`, 'i')
}

function isPackageName(value) {
  return typeof value === 'string' && value.length <= 214 && packageNamePattern().test(value)
}

function text(value, max = 800) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function safeHttpsUrl(value) {
  const raw = text(value, 1200)
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' ? parsed.href : ''
  } catch (_) {
    return ''
  }
}

function localized(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { zh: '', en: '' }
  return {
    zh: text(value.zh || value['zh-CN']),
    en: text(value.en || value['en-US']),
  }
}

function normalizeRegistry(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.plugins)) {
    throw new Error('插件目录格式无效。')
  }

  const categories = {}
  if (payload.categories && typeof payload.categories === 'object' && !Array.isArray(payload.categories)) {
    for (const [key, value] of Object.entries(payload.categories)) {
      const id = text(key, 80)
      if (!id) continue
      const label = localized(value)
      categories[id] = { zh: label.zh || id, en: label.en || id }
    }
  }

  const plugins = []
  const seen = new Set()
  for (const raw of payload.plugins.slice(0, 5000)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const name = text(raw.name, 180)
    if (!name) continue
    const npm = text(raw.npm || raw.packageName, 214)
    const packageName = isPackageName(npm) ? npm : ''
    const owner = text(raw.owner, 120)
    const key = `${name}\n${packageName}\n${owner}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const description = localized(raw.description)
    const starsNumber = Number(raw.stars)
    plugins.push({
      name,
      packageName,
      owner,
      url: safeHttpsUrl(raw.url),
      category: text(raw.category, 80) || 'other',
      description,
      stars: Number.isFinite(starsNumber) && starsNumber >= 0 ? Math.floor(starsNumber) : null,
      added: text(raw.added, 40),
      deprecated: raw.deprecated === true,
      replacement: text(raw.replacement, 180),
      installable: !!packageName,
    })
  }

  if (plugins.length === 0) throw new Error('插件目录为空。')

  return {
    updated: text(payload.updated, 80),
    count: plugins.length,
    categories,
    plugins,
  }
}

function readCache(cachePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || !parsed.registry) return null
    return {
      savedAt: Number(parsed.savedAt) || 0,
      registry: normalizeRegistry(parsed.registry),
    }
  } catch (_) {
    return null
  }
}

function writeCache(cachePath, registry) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    const temp = `${cachePath}.tmp-${process.pid}`
    fs.writeFileSync(temp, JSON.stringify({ savedAt: Date.now(), registry }), 'utf8')
    fs.renameSync(temp, cachePath)
  } catch (_) {
    // Cache failure must never block the live market.
  }
}

async function fetchRegistry(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('当前运行时不支持网络目录请求。')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'DSH-Desktop-Plugin-Market',
      },
    })
    if (!response || !response.ok) {
      throw new Error(`插件目录请求失败（HTTP ${response ? response.status : 'unknown'}）。`)
    }
    const body = await response.text()
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw new Error('插件目录响应过大。')
    return normalizeRegistry(JSON.parse(body))
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('插件目录请求超时。')
    if (error instanceof SyntaxError) throw new Error('插件目录返回了无效 JSON。')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function loadPluginCatalog(cachePath, options = {}) {
  const cache = readCache(cachePath)
  try {
    const registry = await fetchRegistry(options.fetchImpl)
    writeCache(cachePath, registry)
    return {
      ok: true,
      source: 'live',
      sourceUrl: REGISTRY_URL,
      fetchedAt: Date.now(),
      registry,
      error: '',
    }
  } catch (error) {
    if (cache) {
      return {
        ok: true,
        source: 'cache',
        sourceUrl: REGISTRY_URL,
        fetchedAt: cache.savedAt,
        registry: cache.registry,
        error: error && error.message ? error.message : String(error),
      }
    }
    return {
      ok: false,
      source: 'unavailable',
      sourceUrl: REGISTRY_URL,
      fetchedAt: 0,
      registry: { updated: '', count: 0, categories: {}, plugins: [] },
      error: error && error.message ? error.message : String(error),
    }
  }
}

function extractInstalledPackages(output) {
  const source = String(output || '')
  const found = new Set()
  const scoped = /(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)(?=@|\s|$)/ig
  const plain = /(?:^|[\s├└─+`|])([a-z0-9][a-z0-9._-]*)(?=@\d|\s|$)/ig
  let match
  while ((match = scoped.exec(source))) found.add(match[1])
  while ((match = plain.exec(source))) {
    const name = match[1]
    if (isPackageName(name) && !['dependencies', 'devdependencies', 'optionaldependencies'].includes(name.toLowerCase())) {
      found.add(name)
    }
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b))
}

module.exports = {
  REGISTRY_URL,
  extractInstalledPackages,
  fetchRegistry,
  isPackageName,
  loadPluginCatalog,
  normalizeRegistry,
  readCache,
}
