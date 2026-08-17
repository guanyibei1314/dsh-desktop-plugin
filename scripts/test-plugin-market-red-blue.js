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
      __proto__: { zh: '污染', en: 'pollute' },
      constructor: { zh: '污染2', en: 'pollute2' },
    },
    plugins: [
      {
        name: '<img src=x onerror=alert(1)>',
        owner: '<script>alert(1)</script>',
        url: 'javascript:alert(1)',
        category: '__proto__',
        description: { zh: '<svg onload=alert(1)>' },
        npm: 'pkg;calc.exe',
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

async function main() {
  const normalized = normalizeRegistry(hostileFixture())
  assert.equal(normalized.plugins.length, 2)
  const hostile = normalized.plugins[0]
  assert.equal(hostile.installable, false)
  assert.equal(hostile.packageName, '')
  assert.equal(hostile.url, '')
  assert.equal(hostile.category, 'other')
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.categories, '__proto__'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.categories, 'constructor'), false)

  const safe = normalized.plugins[1]
  assert.equal(safe.installable, true)
  assert.equal(safe.packageName, '@example/safe-plugin')

  let seenOptions = null
  const registry = await fetchRegistry(async (_url, options) => {
    seenOptions = options
    return { ok: true, status: 200, text: async () => JSON.stringify(hostileFixture()) }
  })
  assert.equal(registry.plugins.length, 2)
  assert.equal(seenOptions.redirect, 'manual')

  const managerSource = fs.readFileSync(path.join(__dirname, '..', 'plugin-manager.js'), 'utf8')
  assert.equal(/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(managerSource), false)
  assert.ok(managerSource.includes('textContent'))
  assert.ok(managerSource.includes('securityGate'))
  assert.ok(managerSource.includes('assessment.blocked'))

  const extensionSource = fs.readFileSync(path.join(__dirname, '..', 'desktop-extensions.js'), 'utf8')
  assert.ok(extensionSource.includes('parseInstallSpec'))
  assert.ok(extensionSource.includes("/[\\0\\r\\n&|<>^%!`$;]/"))

  console.log('[red-blue] hostile catalog, XSS sink, redirect, prototype-pollution and install-gate tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
