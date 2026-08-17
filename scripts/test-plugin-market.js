'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  extractInstalledPackages,
  loadPluginCatalog,
  normalizeRegistry,
} = require('../plugin-market')

function fixture() {
  return {
    updated: '2026-08-17',
    count: 2,
    categories: {
      ui: { zh: 'UI 增强', en: 'UI Enhancements' },
    },
    plugins: [
      {
        name: 'Safe UI',
        owner: 'tester',
        url: 'https://github.com/example/safe-ui',
        category: 'ui',
        description: { zh: '安全测试插件', en: 'Safe test plugin' },
        npm: '@example/dsh-safe-ui',
        stars: 42,
        install: 'dsh plugin add @example/dsh-safe-ui',
        added: '2026-08-17',
      },
      {
        name: 'Git only',
        owner: 'tester',
        url: 'http://example.com/not-https',
        category: 'ui',
        description: { zh: '没有 npm 包', en: 'No npm package' },
        npm: 'github:https://example.com/repo',
        stars: 3,
        install: 'github:example/repo',
        added: '2026-08-16',
      },
    ],
  }
}

async function main() {
  const normalized = normalizeRegistry(fixture())
  assert.equal(normalized.count, 2)
  assert.equal(normalized.plugins[0].packageName, '@example/dsh-safe-ui')
  assert.equal(normalized.plugins[0].installable, true)
  assert.equal(normalized.plugins[1].packageName, '')
  assert.equal(normalized.plugins[1].installable, false)
  assert.equal(normalized.plugins[1].url, '')

  assert.deepEqual(
    extractInstalledPackages('dependencies:\n├── @example/dsh-safe-ui@1.2.3\n└── dsh-plain@2.0.0\n'),
    ['@example/dsh-safe-ui', 'dsh-plain'],
  )

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-market-test-'))
  const cachePath = path.join(dir, 'plugin-market-cache.json')
  const liveFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(fixture()),
  })
  const live = await loadPluginCatalog(cachePath, { fetchImpl: liveFetch })
  assert.equal(live.ok, true)
  assert.equal(live.source, 'live')
  assert.equal(live.registry.plugins.length, 2)
  assert.ok(fs.existsSync(cachePath))

  const offlineFetch = async () => { throw new Error('offline') }
  const cached = await loadPluginCatalog(cachePath, { fetchImpl: offlineFetch })
  assert.equal(cached.ok, true)
  assert.equal(cached.source, 'cache')
  assert.equal(cached.registry.plugins[0].name, 'Safe UI')
  assert.match(cached.error, /offline/)

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('[plugin-market] live normalization, install safety and cache fallback passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
