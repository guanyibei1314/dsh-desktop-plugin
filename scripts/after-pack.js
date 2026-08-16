'use strict'

const verifyRuntimeClosure = require('./verify-runtime-closure')
const verifyBundledSkins = require('./verify-bundled-skins')

module.exports = async function afterPack(context) {
  await verifyRuntimeClosure(context)
  await verifyBundledSkins(context)
}
