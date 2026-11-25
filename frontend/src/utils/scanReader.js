// Read scanned rubrics printed with Print rubric (see printSheets.js).
// Per page: find the QR code (which print sheet), the four corner markers (where
// the paper is in the image, also when photographed at an angle or upside down),
// straighten the page, and measure how much ink is in each tick box.
// Everything happens in the browser.
import jsQR from 'jsqr'
import { SHEET, QR_PREFIX, markerCentres } from './printSheets.js'
import { solveHomography, applyHomography } from './homography.js'

export const RECT_PX_PER_MM = 5
const LONG_SIDE_PX = 2200    // render resolution of a scanned page (about 190 dpi for A4)

// ── Loading pages ─────────────────────────────────────────────────────────────

function blankCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  return { c, ctx }
}

let pdfjsPromise = null
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.js?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })
  }
  return pdfjsPromise
}

export const isPdf = file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

// Number of pages in a file (PDF) or 1 (photo).
export async function openScan(file) {
  if (!isPdf(file)) return { pages: 1, render: async () => renderImage(file) }
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise
  return {
    pages: doc.numPages,
    render: async n => {
      const page = await doc.getPage(n)
      const vp1 = page.getViewport({ scale: 1 })
      const scale = LONG_SIDE_PX / Math.max(vp1.width, vp1.height)
      const vp = page.getViewport({ scale })
      const { c, ctx } = blankCanvas(vp.width, vp.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      page.cleanup()
      return c
    },
    close: () => doc.destroy(),
  }
}

async function renderImage(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, LONG_SIDE_PX / Math.max(bmp.width, bmp.height))
  const { c, ctx } = blankCanvas(bmp.width * scale, bmp.height * scale)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toGray(data, n) {
  const g = new Uint8Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8
  return g
}

// Brightness of the paper: the 90th percentile of the grey values.
function paperLevel(gray) {
  const hist = new Uint32Array(256)
  const step = Math.max(1, Math.floor(gray.length / 200000))
  let n = 0
  for (let i = 0; i < gray.length; i += step) { hist[gray[i]]++; n++ }
  let acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.9) return Math.max(v, 80) }
  return 255
}

// Solid dark squares in one corner region of the image: returns the best candidate
// for the corner marker (centre in image px), or null.
function findMarker(gray, w, h, region, corner, expectedSide) {
  const [x0, y0, x1, y1] = region
  const rw = x1 - x0, rh = y1 - y0
  const seen = new Uint8Array(rw * rh)
  const dark = (x, y) => gray[y * w + x] < region.threshold
  const stack = []
  const found = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const li = (y - y0) * rw + (x - x0)
      if (seen[li] || !dark(x, y)) continue
      // flood fill this component
      let area = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y
      stack.push(x, y)
      seen[li] = 1
      while (stack.length) {
        const cy = stack.pop(), cx = stack.pop()
        area++; sx += cx; sy += cy
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue
          const ni = (ny - y0) * rw + (nx - x0)
          if (seen[ni] || !dark(nx, ny)) continue
          seen[ni] = 1
          stack.push(nx, ny)
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1
      const side = Math.sqrt(area)
      if (side < expectedSide * 0.3 || side > expectedSide * 1.8) continue
      if (bw / bh < 0.75 || bw / bh > 1.33) continue
      if (area / (bw * bh) < 0.6) continue   // solid, unlike letters or the QR code's rings
      const cx = sx / area, cy = sy / area
      found.push({ x: cx, y: cy, area, dist: Math.hypot(cx - corner[0], cy - corner[1]) })
    }
  }
  if (!found.length) return null
  // The marker is the biggest solid square; of the ones about that size (a coloured-in
  // tick box can come close) take the one nearest the corner. This also skips the
  // small solid centres of the QR code's finder patterns.
  const biggest = Math.max(...found.map(f => f.area))
  return found.filter(f => f.area >= biggest * 0.6).reduce((a, b) => (b.dist < a.dist ? b : a))
}

function decodeQr(imageData) {
  const tryOne = img => {
    const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
    return res && res.data.startsWith(QR_PREFIX) ? res : null
  }
  let res = tryOne(imageData)
  if (res) return { id: parseInt(res.data.slice(QR_PREFIX.length)), at: centre(res.location) }
  // Retry at half size: helps with noisy, high-resolution scans
  const { c, ctx } = blankCanvas(imageData.width / 2, imageData.height / 2)
  const { c: full, ctx: fctx } = blankCanvas(imageData.width, imageData.height)
  fctx.putImageData(imageData, 0, 0)
  ctx.drawImage(full, 0, 0, c.width, c.height)
  res = tryOne(ctx.getImageData(0, 0, c.width, c.height))
  if (res) {
    const at = centre(res.location)
    return { id: parseInt(res.data.slice(QR_PREFIX.length)), at: [at[0] * 2, at[1] * 2] }
  }
  return null
}

const centre = loc => [
  (loc.topLeftCorner.x + loc.topRightCorner.x + loc.bottomLeftCorner.x + loc.bottomRightCorner.x) / 4,
  (loc.topLeftCorner.y + loc.topRightCorner.y + loc.bottomLeftCorner.y + loc.bottomRightCorner.y) / 4,
]

// ── One page ─────────────────────────────────────────────────────────────────

// Returns { sheetId, rect: ImageData of the straightened page (RECT_PX_PER_MM px/mm) }
// or { error } with a Dutch explanation. When the QR code can't be read but the four
// markers can, it returns { noQr: true, rect }: the teacher then says whose page it is.
export function analyzePage(canvas) {
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const img = ctx.getImageData(0, 0, w, h)
  const qr = decodeQr(img)
  const gray = toGray(img.data, w * h)
  const paper = paperLevel(gray)
  const threshold = paper * 0.5
  // Rough marker size if the paper fills the image; a photo may show it smaller
  const expectedSide = SHEET.markerMm * Math.min(w, h) / SHEET.widthMm
  const fw = Math.round(w * 0.3), fh = Math.round(h * 0.25)
  const regions = [
    [[0, 0, fw, fh], [0, 0]],
    [[w - fw, 0, w, fh], [w, 0]],
    [[w - fw, h - fh, w, h], [w, h]],
    [[0, h - fh, fw, h], [0, h]],
  ]
  const found = regions.map(([r, corner]) => {
    r.threshold = threshold
    return findMarker(gray, w, h, r, corner, expectedSide)
  })
  // A corner whose best square is much smaller than the others is not a marker
  // (for instance when that corner is cut off in the scan)
  const areas = found.filter(Boolean).map(m => m.area).sort((a, b) => a - b)
  const typical = areas.length ? areas[Math.floor(areas.length / 2)] : 0
  if (found.some(m => !m || m.area < typical * 0.7)) {
    if (!qr) return { error: 'Geen QR-code gevonden. Is dit een blad uit Print rubric?' }
    return { sheetId: qr.id, error: 'Niet alle vier de zwarte hoekjes zijn gevonden. Scan het hele blad, recht en zonder schaduw.' }
  }

  // Which corner of the image holds which corner of the paper: pick the rotation
  // that puts the QR code where it was printed.
  const mm = markerCentres()
  if (!qr) {
    const H = orientWithoutQr(gray, w, h, found, mm, threshold)
    if (!H) return { error: 'De QR-code is onleesbaar en het blad kon niet rechtgezet worden. Scan het opnieuw.' }
    return { noQr: true, rect: straighten(img, H) }
  }
  const qrMm = [SHEET.qr.x + SHEET.qr.size / 2, SHEET.qr.y + SHEET.qr.size / 2]
  let best = null
  for (let rot = 0; rot < 4; rot++) {
    const dst = mm.map((_, k) => [found[(k + rot) % 4].x, found[(k + rot) % 4].y])
    const H = solveHomography(mm, dst)
    if (!H) continue
    const Hinv = solveHomography(dst, mm)
    const q = applyHomography(Hinv, qr.at)
    const err = Math.hypot(q[0] - qrMm[0], q[1] - qrMm[1])
    if (!best || err < best.err) best = { H, err }
  }
  if (!best || best.err > 5) {
    return { sheetId: qr.id, error: 'Het blad kon niet goed rechtgezet worden. Scan het opnieuw, recht en zonder schaduw.' }
  }

  return { sheetId: qr.id, rect: straighten(img, best.H) }
}

// Without a QR code: the rotation that puts the most ink where the QR code is printed.
// A damaged QR code is still a dark patch; the other corners are nearly empty.
function orientWithoutQr(gray, w, h, found, mm, threshold) {
  const { x, y, size } = SHEET.qr
  const scores = []
  for (let rot = 0; rot < 4; rot++) {
    const dst = mm.map((_, k) => [found[(k + rot) % 4].x, found[(k + rot) % 4].y])
    const H = solveHomography(mm, dst)
    if (!H) continue
    let n = 0, t = 0
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
      const [ix, iy] = applyHomography(H, [x + (i + 0.5) * size / 24, y + (j + 0.5) * size / 24]).map(Math.round)
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue
      t++
      if (gray[iy * w + ix] < threshold) n++
    }
    scores.push({ H, dark: t ? n / t : 0 })
  }
  scores.sort((a, b) => b.dark - a.dark)
  if (!scores.length || scores[0].dark < 0.2) return null
  if (scores[1] && scores[1].dark * 1.5 > scores[0].dark) return null
  return scores[0].H
}

// Map the paper onto a fixed grid of RECT_PX_PER_MM pixels per mm.
function straighten(img, H) {
  const S = RECT_PX_PER_MM
  const W = Math.round(SHEET.widthMm * S), Hh = Math.round(SHEET.heightMm * S)
  const out = new ImageData(W, Hh)
  const src = img.data, sw = img.width, sh = img.height, o = out.data
  const [a, b, c, d, e, f, g, hh] = H
  for (let y = 0; y < Hh; y++) {
    const my = (y + 0.5) / S
    for (let x = 0; x < W; x++) {
      const mx = (x + 0.5) / S
      const den = g * mx + hh * my + 1
      const ix = Math.round((a * mx + b * my + c) / den)
      const iy = Math.round((d * mx + e * my + f) / den)
      const oi = (y * W + x) * 4
      if (ix < 0 || iy < 0 || ix >= sw || iy >= sh) { o[oi] = o[oi + 1] = o[oi + 2] = 255; o[oi + 3] = 255; continue }
      const si = (iy * sw + ix) * 4
      o[oi] = src[si]; o[oi + 1] = src[si + 1]; o[oi + 2] = src[si + 2]; o[oi + 3] = 255
    }
  }
  return out
}

// ── Reading the boxes ─────────────────────────────────────────────────────────

// Ink in each tick box and marker colour in each cell of a straightened page.
export function measure(rect, layout) {
  const S = RECT_PX_PER_MM
  const W = rect.width, Hh = rect.height, data = rect.data
  const gray = toGray(data, W * Hh)
  const paper = paperLevel(gray)
  const dark = paper * 0.65
  const area = ([x, y, w, h], shrink) => {
    const x0 = Math.max(0, Math.round((x + w * shrink) * S)), x1 = Math.min(W, Math.round((x + w * (1 - shrink)) * S))
    const y0 = Math.max(0, Math.round((y + h * shrink) * S)), y1 = Math.min(Hh, Math.round((y + h * (1 - shrink)) * S))
    return [x0, y0, x1, y1]
  }
  const ink = box => {
    const [x0, y0, x1, y1] = area(box, 0.27)
    let n = 0, t = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t++; if (gray[y * W + x] < dark) n++ }
    return t ? n / t : 0
  }
  const colour = cell => {
    const [x0, y0, x1, y1] = area(cell, 0.06)
    let n = 0, t = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      t++
      if (mx > 90 && (mx - mn) / mx > 0.2) n++
    }
    return t ? n / t : 0
  }
  // How much darker the cell's paper is than the page: a highlighter in a grey scan.
  const shade = cell => {
    const [x0, y0, x1, y1] = area(cell, 0.06)
    const hist = new Uint32Array(256)
    let t = 0
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { hist[gray[y * W + x]]++; t++ }
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t / 2) return Math.max(0, 1 - v / paper) }
    return 0
  }
  const boxes = {}
  for (const [key, ...r] of layout.boxes || []) boxes[key] = ink(r)
  const cells = {}
  const shades = {}
  for (const [key, ...r] of layout.cells || []) { cells[key] = colour(r); shades[key] = shade(r) }
  return { boxes, cells, shades }
}

const MARK = 0.08      // ink above the emptiest box in the row that counts as a cross
const BLACKED = 0.72   // a box coloured in completely: a cancelled answer
const HIGHLIGHT = 0.15 // marker colour above the palest cell
const SHADE = 0.07     // grey scan: cell paper this much darker than the lightest cell

// Pick one option from { option: ink }: { value, status } with status
// 'ok' (one clear cross), 'check' (unclear, look at it) or 'empty' (nothing ticked).
export function pickOne(inkByOption, colourByOption = null, shadeByOption = null) {
  const opts = Object.entries(inkByOption)
  if (!opts.length) return { value: null, status: 'empty' }
  const base = Math.min(...opts.map(([, v]) => v))
  const crosses = opts.filter(([, v]) => v - base >= MARK && v < BLACKED)
  const blacked = opts.filter(([, v]) => v >= BLACKED)
  const top = list => list.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  if (crosses.length === 1) return { value: crosses[0][0], status: 'ok' }
  if (crosses.length > 1) return { value: top(crosses), status: 'check', reason: 'Meer dan één hokje aangekruist' }
  if (blacked.length === 1 && opts.length > 1) return { value: blacked[0][0], status: 'check', reason: 'Hokje helemaal ingekleurd' }
  if (colourByOption) {
    const cols = Object.entries(colourByOption)
    const cb = Math.min(...cols.map(([, v]) => v))
    const marked = cols.filter(([, v]) => v - cb >= HIGHLIGHT)
    if (marked.length === 1) return { value: marked[0][0], status: 'ok' }
    if (marked.length > 1) return { value: top(marked), status: 'check', reason: 'Meer dan één hokje gemarkeerd' }
  }
  if (shadeByOption) {
    const sh = Object.entries(shadeByOption)
    const sb = Math.min(...sh.map(([, v]) => v))
    const marked = sh.filter(([, v]) => v - sb >= SHADE)
    // Without colour a grey shade is less certain: always let the teacher look
    if (marked.length >= 1) return { value: top(marked), status: 'check', reason: 'Lijkt gemarkeerd (scan zonder kleur)' }
  }
  return { value: null, status: 'empty', reason: 'Niets aangekruist' }
}

// Readings for one page: { itemId: { value, status, reason } }.
// Toets: itemId = question id, value = points. Grote opdracht: itemId = criterion id, value = level.
export function readPage(rect, layout) {
  const { boxes, cells, shades } = measure(rect, layout)
  const groups = {}
  for (const [key, v] of Object.entries(boxes)) {
    const [kind, id, opt] = key.split(':')
    ;(groups[`${kind}:${id}`] ||= { kind, id, ink: {}, colour: null }).ink[opt] = v
  }
  for (const [key, v] of Object.entries(cells)) {
    const [kind, id, opt] = key.split(':')
    const g = groups[`${kind}:${id}`]
    if (g) { (g.colour ||= {})[opt] = v; (g.shade ||= {})[opt] = shades[key] }
  }
  const out = {}
  for (const g of Object.values(groups)) {
    const r = pickOne(g.ink, g.colour, g.shade)
    out[g.id] = { ...r, value: g.kind === 'q' && r.value !== null ? parseInt(r.value) : r.value, kind: g.kind }
  }
  return out
}

// Straightened page (or a part of it, in mm) as a JPEG data URL for the check screen.
export function rectToDataUrl(rect, crop = null, quality = 0.7) {
  const S = RECT_PX_PER_MM
  const { c: full, ctx: fctx } = blankCanvas(rect.width, rect.height)
  fctx.putImageData(rect, 0, 0)
  if (!crop) return full.toDataURL('image/jpeg', quality)
  const [x, y, w, h] = crop.map(v => Math.round(v * S))
  const { c, ctx } = blankCanvas(w, h)
  ctx.drawImage(full, x, y, w, h, 0, 0, w, h)
  return c.toDataURL('image/jpeg', quality)
}
