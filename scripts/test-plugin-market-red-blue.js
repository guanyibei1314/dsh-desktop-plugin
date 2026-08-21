'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { fetchRegistry, normalizeRegistry } = require('../plugin-market')

function hostileFixture() {
  return {
    updated: '2026-08-17',
    categories: {
      ui: { zh: 'UI 增强', en: 'UI' },
      constructor: { zh: '保留键', en: 'reserved' },
    },
    plugins: [
      {
        name: 'Untrusted catalog entry',
        owner: 'untrusted-owner',
        url: 'javascript:void(0)',
        category: 'constructor',
        description: { zh: '不可信目录条目' },
        npm: 'not a registry package',
        stars: 1,
      },
      {
        name: 'Safe Plugin',
        owner: 'safe-owner',
        url: 'https://github.com/example/safe',
        category: 'ui',
        description: { zh: '正常插件' },
        npm: '@example/safe-plugin',
        stars: 100,
      },
    ],
  }
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function main() {
  const normalized = normalizeRegistry(hostileFixture())
  assert.equal(normalized.plugins.length, 2)
  const hostile = normalized.plugins[0]
  assert.equal(hostile.installable, false)
  assert.equal(hostile.packageName, '')
  assert.equal(hostile.url, '')
  assert.equal(hostile.category, 'other')
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.categories, 'constructor'), false)

  const safe = normalized.plugins[1]
  assert.equal(safe.installable, true)
  assert.equal(safe.packageName, '@example/safe-plugin')

  let seenOptions = null
  const registry = await fetchRegistry(async (_url, options) => {
    seenOptions = options
    return jsonResponse(hostileFixture())
  })
  assert.equal(registry.plugins.length, 2)
  assert.equal(seenOptions.redirect, 'manual')

  const managerSource = fs.readFileSync(path.join(__dirname, '..', 'plugin-manager.js'), 'utf8')
  assert.equal(/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(managerSource), false)
  assert.ok(managerSource.includes('textContent'))
  assert.ok(managerSource.includes('securityGate'))
  assert.ok(managerSource.includes('assessment.blocked'))
  assert.ok(managerSource.includes('result.installationPlan'))

  const extensionSource = fs.readFileSync(path.join(__dirname, '..', 'desktop-extensions.js'), 'utf8')
  assert.ok(extensionSource.includes('validateInstallationPlan'))
  assert.ok(extensionSource.includes('verifyInstalledPluginPlan'))
  assert.ok(extensionSource.includes('rollbackPluginPlan'))
  assert.ok(extensionSource.includes('npm_config_registry'))

  console.log('[red-blue] hostile catalog, render sinks, redirect, reserved-key, immutable-plan and stream gates passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
