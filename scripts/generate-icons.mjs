// Generates the PWA / Add-to-Home-Screen icons from a single SVG definition.
// Run: npm run icons   (regenerate after changing the design below)
//
// Deterministic and dependency-light: the icon is a dark rounded square with a
// green check. Maskable + apple variants are full-bleed with the mark pulled
// into the safe zone. Requires the `sharp` devDependency.
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const BG = '#0f172a'
const FG = '#22c55e'

/** Build the SVG string. size in px; maskable = full-bleed + mark in safe zone. */
function svg(size, { maskable }) {
  const s = size
  const shrink = maskable ? 0.8 : 1
  const c = s / 2
  // check points as fractions of the canvas, optionally shrunk toward centre
  const pts = [
    [0.28, 0.52],
    [0.44, 0.69],
    [0.74, 0.33],
  ].map(([x, y]) => [c + (x * s - c) * shrink, c + (y * s - c) * shrink])
  const w = s * 0.1 * shrink
  const bg = maskable
    ? `<rect width="${s}" height="${s}" fill="${BG}"/>`
    : `<rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${BG}"/>`
  const d = `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]} L${pts[2][0]} ${pts[2][1]}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${bg}<path d="${d}" fill="none" stroke="${FG}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
]

for (const t of targets) {
  await sharp(Buffer.from(svg(t.size, { maskable: t.maskable })))
    .png()
    .toFile(join(OUT, t.file))
  console.log('wrote', t.file, `(${t.size}x${t.size})`)
}
