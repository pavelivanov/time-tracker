// Generates the tray template icons and the app icon from a signed-distance-field
// stopwatch glyph. No dependencies: PNGs are encoded with node:zlib.
//
//   node scripts/make-icons.mjs [--preview <dir>]
import { crc32, deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// --- PNG encoding -----------------------------------------------------------

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(8 + data.length + 4)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// --- Signed distance functions (negative = inside) ---------------------------

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r
const ring = (cx, cy, r, w) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w / 2
const capsule = (ax, ay, bx, by, r) => (x, y) => {
  const pax = x - ax
  const pay = y - ay
  const bax = bx - ax
  const bay = by - ay
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
  return Math.hypot(pax - bax * h, pay - bay * h) - r
}
const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r)
  const qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const union =
  (...shapes) =>
  (x, y) => {
    let d = Infinity
    for (const s of shapes) d = Math.min(d, s(x, y))
    return d
  }

// Stopwatch on a 16×16 unit grid (half-unit precision → crisp at @2x).
const stopwatch = union(
  ring(8, 9, 5.5, 1.5), // dial
  roundRect(6.25, 0.75, 9.75, 2.25, 0.5), // crown button
  roundRect(7.25, 1.5, 8.75, 3.75, 0), // crown stem
  capsule(12.2, 4.8, 13.2, 3.8, 0.75), // side button
  capsule(8, 9, 8, 5.5, 0.75), // hand
  circle(8, 9, 1.1) // hub
)

// Fraction of the pixel covered by `shape`, supersampled n×n.
function coverage(shape, px, py, unitsPerPx, n, ox = 0, oy = 0) {
  let inside = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (px + (i + 0.5) / n - ox) * unitsPerPx
      const y = (py + (j + 0.5) / n - oy) * unitsPerPx
      if (shape(x, y) <= 0) inside++
    }
  }
  return inside / (n * n)
}

// --- Renderers ---------------------------------------------------------------

function trayTemplate(size) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const a = coverage(stopwatch, px, py, 16 / size, 8)
      rgba[(py * size + px) * 4 + 3] = Math.round(a * 255) // black + alpha
    }
  }
  return encodePng(size, size, rgba)
}

function appIcon(size) {
  const s = size / 1024
  // macOS icon grid: 824×824 body centered on a 1024 canvas.
  const body = roundRect(100 * s, 100 * s, 924 * s, 924 * s, 185 * s)
  const glyphPx = 560 * s // glyph's 16 units rendered at this size
  const unitsPerPx = 16 / glyphPx
  const glyphOrigin = size / 2 - glyphPx / 2
  const top = [0xb5, 0x4b, 0xc4]
  const bottom = [0x6f, 0x2a, 0x8a]
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    const t = py / (size - 1)
    const bg = top.map((c, k) => c + (bottom[k] - c) * t)
    for (let px = 0; px < size; px++) {
      const a = coverage(body, px, py, 1, 4)
      if (a === 0) continue
      const g = coverage(stopwatch, px, py, unitsPerPx, 4, glyphOrigin, glyphOrigin)
      const o = (py * size + px) * 4
      for (let k = 0; k < 3; k++) rgba[o + k] = Math.round(bg[k] + (255 - bg[k]) * g)
      rgba[o + 3] = Math.round(a * 255)
    }
  }
  return encodePng(size, size, rgba)
}

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
  console.log('wrote', path)
}

write(join(root, 'resources/tray/stopwatchTemplate.png'), trayTemplate(16))
write(join(root, 'resources/tray/stopwatchTemplate@2x.png'), trayTemplate(32))
write(join(root, 'build/icon.png'), appIcon(1024))

const previewIdx = process.argv.indexOf('--preview')
if (previewIdx !== -1) {
  const dir = process.argv[previewIdx + 1]
  write(join(dir, 'tray-preview-256.png'), trayTemplate(256))
  write(join(dir, 'icon-preview-256.png'), appIcon(256))
}
