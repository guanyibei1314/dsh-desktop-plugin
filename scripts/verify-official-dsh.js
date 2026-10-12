'use strict'

const fs = require('fs')
const path = require('path')
const {
  PACKAGE_NAME,
  REGISTRY_URL,
  evaluateBundledRuntime,
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

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  const deps = pkg.dependencies || {}
  // The bundled version must be official and the newest one this Desktop build
  // supports; a newer latest that needs the new web auth/API is only reported.
  const { status, latest, bundled } = evaluateBundledRuntime(metadata, deps[PACKAGE_NAME])
  const mismatches = Object.entries(deps)
    .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
    .filter(([, version]) => version !== bundled.version)
  if (mismatches.length) {
    throw new Error(`bundled DSH family is not version-coherent: ${JSON.stringify(mismatches)}`)
  }
  if (status === 'latest-unsupported') {
    console.log(`[official-dsh] NOTICE official latest=${latest.version} requires DSH web auth/API integration not in this Desktop build; keeping supported bundled=${bundled.version}`)
  }
  console.log(`[official-dsh] latest=${latest.version} bundled=${bundled.version} integrity=${bundled.integrity}`)
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exitCode = 1
})
