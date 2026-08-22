'use strict'

const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync(require.resolve('../desktop-extensions.js'), 'utf8')
const renderer = fs.readFileSync(require.resolve('../plugin-manager.js'), 'utf8')

const start = source.indexOf('function packageNamePattern()')
const end = source.indexOf('function terminateTree(')
if (start < 0 || end <= start) throw new Error('plugin installation-plan boundary not found')

const sandbox = { URL }
vm.createContext(sandbox)
vm.runInContext(`
const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'
${source.slice(start, end)}
this.validateInstallationPlan = validateInstallationPlan
this.pluginArgs = pluginArgs
`, sandbox)

const valid = {
  packageName: '@example/safe',
  version: '1.2.3',
  spec: '@example/safe@1.2.3',
  registry: 'https://registry.npmjs.org/',
  integrity: 'sha512-QUJDREVGR0g=',
  tarball: 'https://registry.npmjs.org/@example/safe/-/safe-1.2.3.tgz',
}

assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.validateInstallationPlan(valid))), valid)
assert.deepStrictEqual(Array.from(sandbox.pluginArgs('install', valid)), ['add', '@example/safe@1.2.3'])
assert.deepStrictEqual(Array.from(sandbox.pluginArgs('update', valid)), ['add', '@example/safe@1.2.3'])

for (const mutate of [
  (p) => { p.version = 'latest' },
  (p) => { p.spec = '@example/safe@latest' },
  (p) => { p.registry = 'https://evil.example/' },
  (p) => { p.integrity = 'sha1-deadbeef' },
  (p) => { p.tarball = 'https://registry.npmjs.org.evil.example/safe.tgz' },
  (p) => { p.tarball = 'https://user:pass@registry.npmjs.org/safe.tgz' },
  (p) => { p.packageName = '@example/safe;calc.exe' },
]) {
  const attacked = { ...valid }
  mutate(attacked)
  assert.throws(() => sandbox.validateInstallationPlan(attacked))
}

// The renderer must pass the immutable plan returned by the just-completed
// security preflight, not the original package name/dist-tag.
assert.match(renderer, /const plan = result && result\.installationPlan/)
assert.match(renderer, /return runAction\(action, plan\)/)

// The main process must verify the installed package identity + lock integrity
// and attempt rollback before reporting success if either differs.
assert.match(source, /verifyInstalledPluginPlan\(plan\)/)
assert.match(source, /lock\.includes\(plan\.integrity\)/)
assert.match(source, /await rollbackPluginPlan\(plan\)/)

console.log('[plugin-install-plan] exact version/registry/tarball/integrity binding and rollback paths passed')
