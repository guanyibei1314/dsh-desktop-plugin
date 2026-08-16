'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const APP = path.join(ROOT, 'dist', 'win-unpacked', 'DSH Desktop.exe')
const MODULES = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules')
const DSH_BIN = path.join(MODULES, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const PNPM_BIN = path.join(MODULES, 'pnpm', 'bin', 'pnpm.mjs')

for (const target of [APP, DSH_BIN, PNPM_BIN]) {
  if (!fs.existsSync(target)) throw new Error(`packaged plugin runtime missing: ${target}`)
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-desktop-plugin-runtime-'))
const dshHome = path.join(tempRoot, 'dsh-home')
const runtimeBin = path.join(tempRoot, 'runtime-bin')
fs.mkdirSync(dshHome, { recursive: true })
fs.mkdirSync(runtimeBin, { recursive: true })

function cmdQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

fs.writeFileSync(
  path.join(runtimeBin, 'node.cmd'),
  `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n${cmdQuote(APP)} %*\r\n`,
  'utf8',
)
fs.writeFileSync(
  path.join(runtimeBin, 'pnpm.cmd'),
  `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n${cmdQuote(APP)} ${cmdQuote(PNPM_BIN)} %*\r\n`,
  'utf8',
)

const env = Object.assign({}, process.env, {
  ELECTRON_RUN_AS_NODE: '1',
  DSH_HOME: dshHome,
  DSH_TELEMETRY_DISABLED: '1',
  CI: 'true',
  PATH: `${runtimeBin}${path.delimiter}${process.env.PATH || ''}`,
})

try {
  const pnpmCheck = spawnSync(APP, [PNPM_BIN, '--version'], {
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  })
  if (pnpmCheck.error) throw pnpmCheck.error
  if (pnpmCheck.status !== 0) {
    throw new Error(`packaged pnpm failed (${pnpmCheck.status}):\n${pnpmCheck.stdout || ''}\n${pnpmCheck.stderr || ''}`)
  }
  process.stdout.write(`[plugin-runtime] pnpm ${String(pnpmCheck.stdout || '').trim()}\n`)

  const dshCheck = spawnSync(
    APP,
    ['--expose-internals', DSH_BIN, 'plugin', '--profile', 'web', 'list', '--depth', '0'],
    {
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
    },
  )
  if (dshCheck.error) throw dshCheck.error
  if (dshCheck.status !== 0) {
    throw new Error(`packaged DSH plugin runtime failed (${dshCheck.status}):\n${dshCheck.stdout || ''}\n${dshCheck.stderr || ''}`)
  }
  process.stdout.write('[plugin-runtime] dsh plugin --profile web list succeeded\n')
  if (dshCheck.stdout) process.stdout.write(String(dshCheck.stdout).slice(-4000))
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
