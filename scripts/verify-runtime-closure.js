'use strict'

const fs = require('fs')
const path = require('path')

const REQUIRED_UNPACKED = [
  ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
  ['pnpm', 'bin', 'pnpm.mjs'],
  ['node-pty', 'package.json'],
  ['@xterm', 'xterm', 'package.json'],
  ['@xterm', 'addon-fit', 'package.json'],
]

module.exports = async function verifyRuntimeClosure(context) {
  const root = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules')
  const missing = []
  for (const parts of REQUIRED_UNPACKED) {
    const target = path.join(root, ...parts)
    if (!fs.existsSync(target)) missing.push(parts.join('/'))
  }

  if (missing.length > 0) {
    throw new Error(`DSH Desktop packaged runtime closure is incomplete: ${missing.join(', ')}`)
  }

  const pnpmStat = fs.statSync(path.join(root, 'pnpm', 'bin', 'pnpm.mjs'))
  if (!pnpmStat.isFile() || pnpmStat.size < 1000) {
    throw new Error('DSH Desktop packaged pnpm entry is invalid or unexpectedly empty')
  }

  process.stdout.write(`[runtime-closure] verified ${REQUIRED_UNPACKED.length} physical runtime entries\n`)
}
