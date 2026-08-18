'use strict'

const fs = require('fs')
const path = require('path')
const {
  PACKAGE_NAME,
  REGISTRY_URL,
  normalizeRegistryRelease,
} = require('../runtime-update-core')

const MAX_BYTES = 6 * 1024 * 1024

async function main() {
  const response = await fetch(REGISTRY_URL, {
    method: 'GET',
    redirect: 'error',
    headers: { accept: 'application/json', 'user-agent': 'DSH-Desktop-Release-Gate/0.7' },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`official npm registry returned HTTP ${response.status}`)
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_BYTES) throw new Error('official registry metadata exceeds size limit')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) throw new Error('official registry metadata exceeds size limit')
  const metadata = JSON.parse(new TextDecoder().decode(bytes))
  const release = normalizeRegistryRelease(metadata, 'stable')

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  const deps = pkg.dependencies || {}
  if (deps[PACKAGE_NAME] !== release.version) {
    throw new Error(`bundled ${PACKAGE_NAME}=${deps[PACKAGE_NAME]} but official latest=${release.version}`)
  }
  const mismatches = Object.entries(deps)
    .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
    .filter(([, version]) => version !== release.version)
  if (mismatches.length) {
    throw new Error(`bundled DSH family is not version-coherent: ${JSON.stringify(mismatches)}`)
  }
  console.log(`[official-dsh] latest=${release.version} bundled=${deps[PACKAGE_NAME]} integrity=${release.integrity}`)
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exitCode = 1
})
