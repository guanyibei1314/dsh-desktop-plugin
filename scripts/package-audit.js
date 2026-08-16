'use strict'

const fs = require('fs')
const path = require('path')

const DIST = path.join(__dirname, '..', 'dist')
const UNPACKED_MODULES = path.join(DIST, 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules')

function walkSize(target) {
  let stat
  try { stat = fs.lstatSync(target) } catch (error) { return 0 }
  if (stat.isSymbolicLink()) return 0
  if (stat.isFile()) return stat.size
  if (!stat.isDirectory()) return 0
  let total = 0
  for (const name of fs.readdirSync(target)) total += walkSize(path.join(target, name))
  return total
}

function mib(bytes) {
  return bytes / 1024 / 1024
}

function packageBuckets() {
  if (!fs.existsSync(UNPACKED_MODULES)) return []
  const buckets = []
  for (const name of fs.readdirSync(UNPACKED_MODULES)) {
    const target = path.join(UNPACKED_MODULES, name)
    if (name.startsWith('@') && fs.statSync(target).isDirectory()) {
      for (const child of fs.readdirSync(target)) {
        const childPath = path.join(target, child)
        buckets.push({ name: `${name}/${child}`, bytes: walkSize(childPath) })
      }
    } else {
      buckets.push({ name, bytes: walkSize(target) })
    }
  }
  return buckets.sort((a, b) => b.bytes - a.bytes)
}

function findInstaller() {
  if (!fs.existsSync(DIST)) return null
  const names = fs.readdirSync(DIST).filter((name) => /^DSH-Desktop-Setup-.*\.exe$/i.test(name))
  if (names.length === 0) return null
  names.sort((a, b) => fs.statSync(path.join(DIST, b)).mtimeMs - fs.statSync(path.join(DIST, a)).mtimeMs)
  return path.join(DIST, names[0])
}

const installer = findInstaller()
if (!installer) throw new Error('package audit: Windows installer not found')
const bytes = fs.statSync(installer).size
console.log(`[package-audit] installer: ${path.basename(installer)} = ${bytes} bytes (${mib(bytes).toFixed(2)} MiB)`)

const buckets = packageBuckets()
if (buckets.length > 0) {
  console.log('[package-audit] largest unpacked runtime packages:')
  for (const item of buckets.slice(0, 20)) console.log(`  ${mib(item.bytes).toFixed(2).padStart(8)} MiB  ${item.name}`)
}

const max = Number(process.env.DSH_MAX_INSTALLER_MIB || 0)
if (Number.isFinite(max) && max > 0 && mib(bytes) > max) {
  throw new Error(`package audit: installer ${mib(bytes).toFixed(2)} MiB exceeds budget ${max.toFixed(2)} MiB`)
}

const baseline = Number(process.env.DSH_BASELINE_INSTALLER_BYTES || 0)
const maxGrowthMiB = Number(process.env.DSH_MAX_INSTALLER_GROWTH_MIB || 0)
if (Number.isFinite(baseline) && baseline > 0) {
  const delta = bytes - baseline
  console.log(`[package-audit] delta vs baseline ${baseline} bytes: ${delta >= 0 ? '+' : ''}${delta} bytes (${delta >= 0 ? '+' : ''}${mib(delta).toFixed(2)} MiB)`)
  if (Number.isFinite(maxGrowthMiB) && maxGrowthMiB > 0 && delta > maxGrowthMiB * 1024 * 1024) {
    throw new Error(`package audit: installer grew ${mib(delta).toFixed(2)} MiB, exceeding allowed growth ${maxGrowthMiB.toFixed(2)} MiB`)
  }
}
