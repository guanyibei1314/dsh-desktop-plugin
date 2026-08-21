'use strict'

function contentLength(response) {
  if (!response || !response.headers || typeof response.headers.get !== 'function') return 0
  const raw = response.headers.get('content-length')
  if (!raw) return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

async function readBytesLimited(response, maxBytes, label = 'response') {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('invalid response byte limit')
  const declared = contentLength(response)
  if (declared > maxBytes) throw new Error(`${label} exceeds size limit`)
  if (!response || !response.body || typeof response.body.getReader !== 'function') {
    throw new Error(`${label} body is not stream-readable`)
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      total += chunk.length
      if (total > maxBytes) {
        try { await reader.cancel('size limit exceeded') } catch (_) { /* ignore */ }
        throw new Error(`${label} exceeds size limit`)
      }
      chunks.push(chunk)
    }
  } finally {
    try { reader.releaseLock() } catch (_) { /* ignore */ }
  }
  return Buffer.concat(chunks, total)
}

async function readJsonLimited(response, maxBytes, options = {}) {
  const label = options.label || 'JSON response'
  if (!response || !response.ok) {
    throw new Error(`${label} failed (HTTP ${response ? response.status : 'unknown'})`)
  }
  if (options.requireJsonContentType !== false) {
    const type = response.headers && typeof response.headers.get === 'function'
      ? (response.headers.get('content-type') || '')
      : ''
    if (!/application\/(?:json|[^;]+\+json)/i.test(type)) {
      throw new Error(`${label} has unexpected content type`)
    }
  }
  const bytes = await readBytesLimited(response, maxBytes, label)
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} returned invalid JSON`)
    throw error
  }
}

module.exports = {
  contentLength,
  readBytesLimited,
  readJsonLimited,
}
