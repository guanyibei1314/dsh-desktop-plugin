'use strict'

const fs = require('fs')
const path = require('path')

const REQUIRED_UNPACKED = [
  ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
  ['pnpm', 'bin', 'pnpm.mjs'],
  ['pnpm', 'dist', 'pnpm.mjs'],
  ['node-pty', 'package.json'],
  ['node-pty', 'lib', 'index.js'],
  ['@xterm', 'xterm', 'package.json'],
  ['@xterm', 'addon-fit', 'package.json'],
]

function exists(root, parts) {
  return fs.existsSync(path.join(root, ...parts))
}

module.exports = async function verifyRuntimeClosure(context) {
  const root = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules')
  const missing = []
  for (const parts of REQUIRED_UNPACKED) {
    if (!exists(root, parts)) missing.push(parts.join('/'))
  }

  if (missing.length > 0) {
    throw new Error(`DSH Desktop packaged runtime closure is incomplete: ${missing.join(', ')}`)
  }

  const pnpmStat = fs.statSync(path.join(root, 'pnpm', 'bin', 'pnpm.mjs'))
  if (!pnpmStat.isFile() || pnpmStat.size < 1000) {
    throw new Error('DSH Desktop packaged pnpm entry is invalid or unexpectedly empty')
  }

  if (context.electronPlatformName === 'win32') {
    const ptyNativeCandidates = [
      ['node-pty', 'build', 'Release', 'conpty.node'],
      ['node-pty', 'prebuilds', 'win32-x64', 'conpty.node'],
    ]
    const consoleCandidates = [
      ['node-pty', 'build', 'Release', 'conpty', 'OpenConsole.exe'],
      ['node-pty', 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe'],
    ]
    if (!ptyNativeCandidates.some((parts) => exists(root, parts))) {
      throw new Error('DSH Desktop packaged x64 node-pty native module is missing')
    }
    if (!consoleCandidates.some((parts) => exists(root, parts))) {
      throw new Error('DSH Desktop packaged x64 OpenConsole runtime is missing')
    }

    const forbidden = [
      ['node-pty', 'prebuilds', 'win32-arm64'],
      ['node-pty', 'third_party'],
      ['pnpm', 'artifacts'],
    ]
    const retained = forbidden.filter((parts) => exists(root, parts)).map((parts) => parts.join('/'))
    if (retained.length > 0) {
      throw new Error(`DSH Desktop x64 package retained non-runtime payload: ${retained.join(', ')}`)
    }
  }

  process.stdout.write(`[runtime-closure] verified ${REQUIRED_UNPACKED.length} physical runtime entries and x64 PTY closure\n`)
}
