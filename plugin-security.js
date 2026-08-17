'use strict'

const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const OSV_QUERY_URL = 'https://api.osv.dev/v1/query'
const FETCH_TIMEOUT_MS = 6000
const MAX_METADATA_BYTES = 4 * 1024 * 1024
const MAX_OSV_BYTES = 2 * 1024 * 1024

function packageNamePattern() {
  const atom = '[a-z0-9][a-z0-9._-]*'
  return new RegExp(`^(?:@${atom}/${atom}|${atom})$`, 'i')
}

function isPackageName(value) {
  return typeof value === 'string' && value.length <= 214 && packageNamePattern().test(value)
}

function cleanText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeHttpsUrl(value) {
  const raw = cleanText(value, 1500)
  if (!raw) return ''
  try {
    const parsed = new URL(raw.replace(/^git\+/, ''))
    return parsed.protocol === 'https:' ? parsed.href : ''
  } catch (_) {
    return ''
  }
}

function npmMetadataUrl(packageName) {
  if (!isPackageName(packageName)) throw new Error('非法 npm 包名。')
  return `${NPM_REGISTRY_ORIGIN}/${encodeURIComponent(packageName)}`
}

async function requestJson(url, options = {}, limits = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('当前运行时不支持安全评估网络请求。')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs || FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: options.method || 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: Object.assign({
        accept: 'application/json',
        'user-agent': 'DSH-Desktop-Plugin-Security',
      }, options.headers || {}),
      body: options.body,
    })
    if (!response || !response.ok) {
      throw new Error(`安全评估请求失败（HTTP ${response ? response.status : 'unknown'}）。`)
    }
    const body = await response.text()
    const maxBytes = limits.maxBytes || MAX_METADATA_BYTES
    if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error('安全评估响应过大。')
    return JSON.parse(body)
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('安全评估请求超时。')
    if (error instanceof SyntaxError) throw new Error('安全评估服务返回了无效 JSON。')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function normalizeNpmMetadata(packageName, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('npm 元数据无效。')
  const distTags = payload['dist-tags'] && typeof payload['dist-tags'] === 'object' ? payload['dist-tags'] : {}
  const latestVersion = cleanText(distTags.latest, 120)
  const versions = payload.versions && typeof payload.versions === 'object' ? payload.versions : {}
  const version = latestVersion && versions[latestVersion] && typeof versions[latestVersion] === 'object'
    ? versions[latestVersion]
    : null
  if (!version) throw new Error('npm 元数据缺少 latest 版本。')

  const scripts = version.scripts && typeof version.scripts === 'object' && !Array.isArray(version.scripts)
    ? version.scripts
    : {}
  const lifecycleScripts = ['preinstall', 'install', 'postinstall'].filter((key) => typeof scripts[key] === 'string' && scripts[key].trim())
  const maintainers = Array.isArray(payload.maintainers) ? payload.maintainers : []
  const dependencies = version.dependencies && typeof version.dependencies === 'object' && !Array.isArray(version.dependencies)
    ? Object.keys(version.dependencies).length
    : 0
  const time = payload.time && typeof payload.time === 'object' ? payload.time : {}
  const publishedAt = cleanText(time[latestVersion] || time.modified, 80)
  const repositoryValue = version.repository && typeof version.repository === 'object'
    ? version.repository.url
    : version.repository
  const dist = version.dist && typeof version.dist === 'object' ? version.dist : {}

  return {
    packageName,
    latestVersion,
    publishedAt,
    maintainers: maintainers.length,
    dependencies,
    lifecycleScripts,
    integrity: cleanText(dist.integrity, 500),
    shasum: cleanText(dist.shasum, 100),
    repository: safeHttpsUrl(repositoryValue),
    deprecated: cleanText(version.deprecated, 500),
  }
}

function normalizeOsv(payload) {
  const vulns = payload && Array.isArray(payload.vulns) ? payload.vulns : []
  return vulns.slice(0, 20).map((item) => ({
    id: cleanText(item && item.id, 120),
    summary: cleanText(item && item.summary, 300),
    aliases: Array.isArray(item && item.aliases)
      ? item.aliases.slice(0, 8).map((value) => cleanText(value, 120)).filter(Boolean)
      : [],
  })).filter((item) => item.id)
}

async function fetchNpmMetadata(packageName, fetchImpl) {
  const payload = await requestJson(npmMetadataUrl(packageName), { fetchImpl }, { maxBytes: MAX_METADATA_BYTES })
  return normalizeNpmMetadata(packageName, payload)
}

async function fetchOsv(packageName, version, fetchImpl) {
  if (!isPackageName(packageName) || !version) return []
  const payload = await requestJson(OSV_QUERY_URL, {
    fetchImpl,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: { ecosystem: 'npm', name: packageName }, version }),
  }, { maxBytes: MAX_OSV_BYTES })
  return normalizeOsv(payload)
}

function daysSince(value, now = Date.now()) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, (now - timestamp) / 86400000)
}

function assessNormalizedMetadata(metadata, vulnerabilities = [], now = Date.now()) {
  let score = 0
  const reasons = []
  const positives = []

  if (metadata.lifecycleScripts.length) {
    score += 35
    reasons.push(`包含安装期脚本：${metadata.lifecycleScripts.join(' / ')}`)
  } else {
    positives.push('未声明 preinstall/install/postinstall 脚本')
  }

  const ageDays = daysSince(metadata.publishedAt, now)
  if (ageDays !== null && ageDays < 3) {
    score += 30
    reasons.push('latest 版本发布不足 3 天')
  } else if (ageDays !== null && ageDays < 14) {
    score += 20
    reasons.push('latest 版本发布不足 14 天')
  } else if (ageDays !== null && ageDays < 45) {
    score += 10
    reasons.push('latest 版本发布时间较新')
  } else if (ageDays !== null) {
    positives.push('latest 版本已发布超过 45 天')
  }

  if (metadata.maintainers < 1) {
    score += 15
    reasons.push('npm 元数据未提供维护者')
  } else {
    positives.push(`npm 维护者 ${metadata.maintainers} 人`)
  }

  if (!metadata.integrity && !metadata.shasum) {
    score += 20
    reasons.push('缺少发布包完整性摘要')
  } else {
    positives.push('发布包包含完整性摘要')
  }

  if (!metadata.repository) {
    score += 8
    reasons.push('未提供可验证的 HTTPS 代码仓库地址')
  } else {
    positives.push('提供 HTTPS 代码仓库地址')
  }

  if (metadata.dependencies > 250) {
    score += 20
    reasons.push(`直接依赖数量异常偏高：${metadata.dependencies}`)
  } else if (metadata.dependencies > 100) {
    score += 10
    reasons.push(`直接依赖数量较高：${metadata.dependencies}`)
  }

  if (metadata.deprecated) {
    score += 25
    reasons.push(`npm 已标记弃用：${metadata.deprecated}`)
  }

  if (vulnerabilities.length >= 3) {
    score += 60
    reasons.push(`OSV 命中 ${vulnerabilities.length} 个已知漏洞`)
  } else if (vulnerabilities.length === 2) {
    score += 45
    reasons.push('OSV 命中 2 个已知漏洞')
  } else if (vulnerabilities.length === 1) {
    score += 35
    reasons.push('OSV 命中 1 个已知漏洞')
  } else {
    positives.push('OSV 未发现该版本的已知漏洞')
  }

  score = Math.min(100, score)
  const level = score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low'
  return {
    score,
    level,
    blocked: level === 'critical',
    requiresConfirmation: level === 'high',
    reasons,
    positives,
    vulnerabilities,
  }
}

async function assessPackageSecurity(packageName, options = {}) {
  if (!isPackageName(packageName)) throw new Error('非法 npm 包名。')
  try {
    const metadata = await fetchNpmMetadata(packageName, options.fetchImpl)
    let vulnerabilities = []
    let osvError = ''
    try {
      vulnerabilities = await fetchOsv(packageName, metadata.latestVersion, options.fetchImpl)
    } catch (error) {
      osvError = error && error.message ? error.message : String(error)
    }
    const assessment = assessNormalizedMetadata(metadata, vulnerabilities, options.now || Date.now())
    if (osvError) {
      assessment.score = Math.min(100, assessment.score + 20)
      assessment.reasons.push(`OSV 漏洞查询不可用：${osvError}`)
      if (assessment.level === 'low') assessment.level = 'medium'
    }
    return {
      ok: true,
      checkedAt: Date.now(),
      metadata,
      assessment,
      osvError,
    }
  } catch (error) {
    return {
      ok: false,
      checkedAt: Date.now(),
      metadata: null,
      assessment: {
        score: 100,
        level: 'unknown',
        blocked: true,
        requiresConfirmation: false,
        reasons: [`无法完成实时安全评估：${error && error.message ? error.message : String(error)}`],
        positives: [],
        vulnerabilities: [],
      },
      error: error && error.message ? error.message : String(error),
    }
  }
}

module.exports = {
  NPM_REGISTRY_ORIGIN,
  OSV_QUERY_URL,
  assessNormalizedMetadata,
  assessPackageSecurity,
  fetchNpmMetadata,
  fetchOsv,
  isPackageName,
  normalizeNpmMetadata,
  normalizeOsv,
  npmMetadataUrl,
  requestJson,
}
