'use strict'
/**
 * Generate DSH Desktop icons (tray 32x32 + window/app 256x256) as PNG,
 * using signed-distance-field shapes with 4x supersampling. No dependencies.
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

// ---------- minimal PNG encoder ----------
let CRC_TABLE = null
function crc32(buf) {
  if (CRC_TABLE === null) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- signed distance fields ----------
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}
function sdDiamond(px, py, cx, cy, a) {
  const dx = px - cx
  const dy = py - cy
  const rx = (dx - dy) / Math.SQRT2
  const ry = (dx + dy) / Math.SQRT2
  const qx = Math.abs(rx) - a
  const qy = Math.abs(ry) - a
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}
function sdRing(px, py, cx, cy, hw, hh, r, width) {
  return Math.abs(sdRoundRect(px, py, cx, cy, hw, hh, r)) - width
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }

function blend(acc, rgb, cov) {
  if (cov <= 0) return
  const inv = 1 - cov
  acc[0] = acc[0] * inv + rgb[0] * cov
  acc[1] = acc[1] * inv + rgb[1] * cov
  acc[2] = acc[2] * inv + rgb[2] * cov
  acc[3] = acc[3] * inv + cov
}

function draw(size) {
  const SS = 4 // supersample factor
  const S = size * SS
  const BG = hex('#0d1117')
  const RING = hex('#3d4552')
  const AMBER = hex('#d9a441')
  const out = Buffer.alloc(size * size * 4)

  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      const acc = [0, 0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = ox * SS + sx + 0.5
          const py = oy * SS + sy + 0.5
          const margin = S * 0.10
          const half = (S - 2 * margin) / 2
          const radius = S * 0.20
          const cx = S / 2
          const cy = S / 2

          blend(acc, BG, clamp01(0.5 - sdRoundRect(px, py, cx, cy, half, half, radius)))
          blend(acc, RING, clamp01(0.5 - sdRing(px, py, cx, cy, half, half, radius, S * 0.014)))
          blend(acc, AMBER, clamp01(0.5 - sdDiamond(px, py, S * 0.40, cy, S * 0.21)))
        }
      }
      const i = (oy * size + ox) * 4
      out[i] = Math.round(acc[0])
      out[i + 1] = Math.round(acc[1])
      out[i + 2] = Math.round(acc[2])
      out[i + 3] = Math.round(acc[3] * 255)
    }
  }
  return out
}

const outDir = path.join(__dirname, '..', 'assets')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'tray.png'), encodePng(32, draw(32)))
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePng(256, draw(256)))
console.log('icons written to', outDir)
