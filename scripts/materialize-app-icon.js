'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'assets', 'icon-source.b64')
const OUTPUT = path.join(ROOT, 'assets', 'icon.png')
const EXPECTED_SHA256 = '887e81d4e37e06395e26b989ddc1fad898ae3b82222b41711452b0b9743afd95'
const EXPECTED_SIZE = 13365
const EXPECTED_DIMENSION = 256

function fail(message) {
  throw new Error(`[icon] ${message}`)
}

const encoded = fs.readFileSync(SOURCE, 'utf8').replace(/\s+/g, '')
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail('source is not valid base64 text')

const png = Buffer.from(encoded, 'base64')
if (png.length !== EXPECTED_SIZE) fail(`unexpected byte size ${png.length}; expected ${EXPECTED_SIZE}`)

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
if (!png.subarray(0, 8).equals(signature)) fail('decoded icon is not a PNG')

const width = png.readUInt32BE(16)
const height = png.readUInt32BE(20)
if (width !== EXPECTED_DIMENSION || height !== EXPECTED_DIMENSION) {
  fail(`unexpected PNG dimensions ${width}x${height}; expected ${EXPECTED_DIMENSION}x${EXPECTED_DIMENSION}`)
}

const sha256 = crypto.createHash('sha256').update(png).digest('hex')
if (sha256 !== EXPECTED_SHA256) fail(`SHA-256 mismatch: ${sha256}`)

fs.writeFileSync(OUTPUT, png)
process.stdout.write(`[icon] materialized ${path.relative(ROOT, OUTPUT)} (${png.length} bytes, sha256=${sha256})\n`)
