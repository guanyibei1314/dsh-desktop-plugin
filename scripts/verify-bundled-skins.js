'use strict'

const fs = require('fs')
const path = require('path')

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { return null }
}

module.exports = async function verifyBundledSkins(context) {
  const modules = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules')
  const skinsRoot = path.join(modules, '@linxin666', 'dsh-skins')
  const pkg = readJson(path.join(skinsRoot, 'package.json'))
  if (!pkg || pkg.name !== '@linxin666/dsh-skins' || pkg.version !== '0.1.18') {
    throw new Error('bundled skins missing or not pinned to @linxin666/dsh-skins@0.1.18')
  }
  if (!fs.existsSync(path.join(skinsRoot, 'cordis.patch.yml'))) {
    throw new Error('bundled skins cordis.patch.yml is missing')
  }
  const skinsDir = path.join(skinsRoot, 'skins')
  const skinIds = fs.existsSync(skinsDir)
    ? fs.readdirSync(skinsDir).filter((name) => {
      try { return fs.statSync(path.join(skinsDir, name)).isDirectory() } catch (err) { return false }
    })
    : []
  if (skinIds.length < 5) {
    throw new Error(`bundled skin assets look incomplete: found ${skinIds.length} skin directories`)
  }

  const skinCenterCandidates = [
    path.join(modules, '@linxin666', 'dsh-client-ui-skin-center', 'package.json'),
    path.join(skinsRoot, 'node_modules', '@linxin666', 'dsh-client-ui-skin-center', 'package.json'),
  ]
  if (!skinCenterCandidates.some((file) => fs.existsSync(file))) {
    throw new Error('bundled skin-center runtime dependency is missing')
  }

  process.stdout.write(`[bundled-skins] verified @linxin666/dsh-skins@0.1.18 with ${skinIds.length} bundled skins\n`)
}
