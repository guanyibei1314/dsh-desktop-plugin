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
const SKINS_DIR = path.join(MODULES, '@linxin666', 'dsh-skins')

for (const target of [APP, DSH_BIN, PNPM_BIN, path.join(SKINS_DIR, 'package.json')]) {
  if (!fs.existsSync(target)) throw new Error(`packaged plugin runtime missing: ${target}`)
}

const skinsPackage = JSON.parse(fs.readFileSync(path.join(SKINS_DIR, 'package.json'), 'utf8'))
if (skinsPackage.name !== '@linxin666/dsh-skins' || skinsPackage.version !== '0.1.18') {
  throw new Error('packaged bundled skin version mismatch')
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
  npm_config_offline: 'true',
  npm_config_prefer_offline: 'true',
})

function runDsh(args, timeout = 120000) {
  const result = spawnSync(APP, ['--expose-internals', DSH_BIN, ...args], {
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`packaged DSH command failed (${result.status}): ${args.join(' ')}\n${result.stdout || ''}\n${result.stderr || ''}`)
  }
  return result
}

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

  runDsh(['plugin', '--profile', 'web', 'list', '--depth', '0'])
  process.stdout.write('[plugin-runtime] dsh plugin --profile web list succeeded\n')

  const normalizedSkinsDir = SKINS_DIR.replace(/\\/g, '/')
  const linkSpec = `link:${normalizedSkinsDir}`
  const addResult = runDsh(['plugin', '--profile', 'web', 'add', linkSpec], 180000)
  process.stdout.write('[plugin-runtime] offline bundled skin link succeeded\n')
  if (addResult.stdout) process.stdout.write(String(addResult.stdout).slice(-3000))

  const profilePackageFile = path.join(dshHome, 'profiles', 'web', 'package.json')
  if (!fs.existsSync(profilePackageFile)) throw new Error('web profile package.json was not created')
  const profilePackage = JSON.parse(fs.readFileSync(profilePackageFile, 'utf8'))
  const dependency = profilePackage.dependencies && profilePackage.dependencies['@linxin666/dsh-skins']
  if (typeof dependency !== 'string' || !dependency.startsWith('link:')) {
    throw new Error(`bundled skin was not reconciled as a local link: ${String(dependency)}`)
  }

  const finalList = runDsh(['plugin', '--profile', 'web', 'list', '--depth', '0'])
  const combined = `${finalList.stdout || ''}\n${finalList.stderr || ''}`
  if (!combined.includes('@linxin666/dsh-skins')) {
    throw new Error('bundled skin package is absent from final plugin list')
  }
  process.stdout.write('[plugin-runtime] bundled skin is active in isolated web profile without registry access\n')
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
