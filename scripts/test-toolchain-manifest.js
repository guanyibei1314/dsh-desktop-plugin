'use strict'

const fs = require('fs')
const path = require('path')
const assert = require('assert')

const root = path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'toolchain-manifest.json'), 'utf8'))
assert.strictEqual(manifest.schema, 1)
assert.ok(manifest.windowsX64)

function assertSha(value, name) {
  assert.match(value, /^[0-9a-f]{64}$/i, `${name} sha256 must be 64 hex chars`)
}

const node = manifest.windowsX64.node
assert.strictEqual(node.kind, 'msi')
assert.match(node.version, /^\d+\.\d+\.\d+$/)
assert.strictEqual(node.file, `node-v${node.version}-x64.msi`)
assertSha(node.sha256, 'node')
{
  const url = new URL(node.url)
  assert.strictEqual(url.protocol, 'https:')
  assert.strictEqual(url.username, '')
  assert.strictEqual(url.password, '')
  assert.strictEqual(url.hostname, 'nodejs.org')
  assert.strictEqual(url.pathname, `/download/release/v${node.version}/${node.file}`)
}

const git = manifest.windowsX64.git
assert.strictEqual(git.kind, 'exe')
assert.match(git.version, /^\d+\.\d+\.\d+\.\d+$/)
assert.strictEqual(git.file, `Git-${git.version}-64-bit.exe`)
assertSha(git.sha256, 'git')
{
  const [major, minor, patch, windowsPatch] = git.version.split('.')
  const url = new URL(git.url)
  assert.strictEqual(url.protocol, 'https:')
  assert.strictEqual(url.username, '')
  assert.strictEqual(url.password, '')
  assert.strictEqual(url.hostname, 'github.com')
  assert.strictEqual(
    url.pathname,
    `/git-for-windows/git/releases/download/v${major}.${minor}.${patch}.windows.${windowsPatch}/${git.file}`,
  )
}

assert.notStrictEqual(node.sha256.toLowerCase(), git.sha256.toLowerCase())
console.log(`[toolchain-manifest] Node ${node.version} + Git for Windows ${git.version} pinned source/hash checks passed`)
