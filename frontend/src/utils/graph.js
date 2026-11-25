// Function graphs in rubric text. Typed (or inserted by the editor) as
//   [[grafiek: y = x^2 - 3; x: -5 tot 5; y: -4 tot 6; stap: 1]]
// Several functions are allowed: `f(x) = 2x + 1; g(x) = x^2; ...`.
// The text is stored exactly as typed; this only decides how it is shown.

export const GRAPH_OPEN = '[[grafiek'
export const GRAPH_CLOSE = ']]'
export const MAX_FUNCTIONS = 4
export const GRAPH_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea']

export const GRAPH_SIZES = { klein: 200, normaal: 280, groot: 380 }
export const DEFAULT_GRAPH = { functions: ['y = x^2 - 3'], xmin: -5, xmax: 5, ymin: -5, ymax: 5, step: 1, size: 'normaal' }

// ── Numbers ────────────────────────────────────────────────────────────────

// "2,5", "-3", "1.5", "−2" (typographic minus) → number, or NaN.
export function parseNumber(str) {
  const s = String(str ?? '').trim().replace(/−/g, '-').replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN
  return Number(s)
}

// Shown the Dutch way: decimal comma, no trailing zeros, no "-0".
export function formatNumber(n) {
  if (!Number.isFinite(n)) return ''
  const r = Math.round(n * 1e6) / 1e6
  return String(Object.is(r, -0) ? 0 : r).replace('.', ',')
}

// ── Expressions ────────────────────────────────────────────────────────────

const FUNCS = {
  sqrt: Math.sqrt, wortel: Math.sqrt,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  ln: Math.log, log: Math.log10, abs: Math.abs,
}
const CONSTS = { pi: Math.PI, e: Math.E }

function tokenize(src) {
  const s = src
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times|[·×]/g, '*')
    .replace(/\\div|:/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'pi')
  const tokens = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) { i++; continue }
    const num = /^(\d+([.,]\d+)?|[.,]\d+)/.exec(s.slice(i))
    if (num) { tokens.push({ t: 'num', v: Number(num[0].replace(',', '.')) }); i += num[0].length; continue }
    if (ch === '\\') {
      const cmd = /^\\([a-zA-Z]+)/.exec(s.slice(i))
      if (!cmd) throw new Error('onbekend teken')
      const name = cmd[1].toLowerCase()
      if (name === 'frac') tokens.push({ t: 'frac' })
      else if (FUNCS[name]) tokens.push({ t: 'fn', v: name })
      else if (CONSTS[name]) tokens.push({ t: 'num', v: CONSTS[name] })
      else throw new Error(`onbekend: \\${cmd[1]}`)
      i += cmd[0].length
      continue
    }
    if (/[a-zA-Z]/.test(ch)) {
      const word = /^[a-zA-Z]+/.exec(s.slice(i))[0].toLowerCase()
      // A run of letters like "xsin" or "pix" is split into known pieces.
      let j = 0
      while (j < word.length) {
        const fn = Object.keys(FUNCS).sort((a, b) => b.length - a.length).find(f => word.startsWith(f, j))
        if (fn) { tokens.push({ t: 'fn', v: fn }); j += fn.length; continue }
        if (word.startsWith('pi', j)) { tokens.push({ t: 'num', v: Math.PI }); j += 2; continue }
        if (word[j] === 'e') { tokens.push({ t: 'num', v: Math.E }); j++; continue }
        if (word[j] === 'x') { tokens.push({ t: 'x' }); j++; continue }
        throw new Error(`onbekend: ${word[j]}`)
      }
      i += word.length
      continue
    }
    if ('+-*/^()'.includes(ch)) { tokens.push({ t: ch }); i++; continue }
    if (ch === '{' || ch === '[') { tokens.push({ t: '(' }); i++; continue }
    if (ch === '}' || ch === ']') { tokens.push({ t: ')' }); i++; continue }
    if (ch === '|') { tokens.push({ t: '|' }); i++; continue }
    throw new Error(`onbekend teken: ${ch}`)
  }
  return tokens
}

// Recursive descent: sum → product → unary → power → atom. Implicit
// multiplication ("2x", "3(x+1)", "x sin x") binds like `*`.
function parse(tokens) {
  let pos = 0
  let absDepth = 0
  const peek = () => tokens[pos]
  const take = t => {
    if (peek()?.t !== t) throw new Error(t === ')' ? 'haakje sluiten mist' : `${t} verwacht`)
    return tokens[pos++]
  }
  const startsAtom = tok => tok && (['num', 'x', 'fn', 'frac', '('].includes(tok.t) || (tok.t === '|' && absDepth === 0))

  function sum() {
    let left = product()
    while (peek()?.t === '+' || peek()?.t === '-') {
      const op = tokens[pos++].t
      const right = product()
      const l = left
      left = op === '+' ? x => l(x) + right(x) : x => l(x) - right(x)
    }
    return left
  }
  function product() {
    let left = unary()
    for (;;) {
      const tok = peek()
      if (tok?.t === '*' || tok?.t === '/') {
        pos++
        const right = unary()
        const l = left
        left = tok.t === '*' ? x => l(x) * right(x) : x => l(x) / right(x)
      } else if (startsAtom(tok)) {
        const right = power()
        const l = left
        left = x => l(x) * right(x)
      } else return left
    }
  }
  function unary() {
    if (peek()?.t === '-') { pos++; const f = unary(); return x => -f(x) }
    if (peek()?.t === '+') { pos++; return unary() }
    return power()
  }
  function power() {
    const base = atom()
    if (peek()?.t === '^') {
      pos++
      const exp = unary() // right-associative, allows x^-1
      return x => pow(base(x), exp(x))
    }
    return base
  }
  function atom() {
    const tok = tokens[pos++]
    if (!tok) throw new Error('formule is niet af')
    if (tok.t === 'num') return () => tok.v
    if (tok.t === 'x') return x => x
    if (tok.t === '(') { const f = sum(); take(')'); return f }
    if (tok.t === '|') { absDepth++; const f = sum(); absDepth--; take('|'); return x => Math.abs(f(x)) }
    if (tok.t === 'frac') {
      take('('); const a = sum(); take(')')
      take('('); const b = sum(); take(')')
      return x => a(x) / b(x)
    }
    if (tok.t === 'fn') {
      const g = FUNCS[tok.v]
      // "sin x" or "sqrt(x)"; without brackets the argument is one power term.
      const arg = peek()?.t === '(' ? atom() : power()
      return x => g(arg(x))
    }
    throw new Error(`onverwacht: ${tok.t}`)
  }

  const f = sum()
  if (pos < tokens.length) throw new Error(tokens[pos].t === ')' ? 'te veel haakjes sluiten' : 'formule klopt niet')
  return f
}

// x^(1/3) of a negative x is the real cube root, as on a graphing calculator.
function pow(b, e) {
  if (b < 0 && !Number.isInteger(e)) {
    for (const q of [3, 5, 7]) {
      const p = e * q
      if (Math.abs(p - Math.round(p)) < 1e-9) {
        const r = Math.pow(-b, e)
        return Math.round(p) % 2 === 0 ? r : -r
      }
    }
  }
  return Math.pow(b, e)
}

// "y = x^2 - 3", "f(x) = ...", or just "x^2 - 3" → { label, expr, fn }.
export function compileFunction(text) {
  const raw = String(text ?? '').trim()
  if (!raw) throw new Error('geen formule')
  const m = /^([a-zA-Z](?:_?\w)?(?:\s*\(\s*x\s*\))?)\s*=\s*(.*)$/s.exec(raw)
  const label = m ? m[1].replace(/\s+/g, '') : ''
  const expr = m ? m[2] : raw
  if (!expr.trim()) throw new Error('geen formule')
  const fn = parse(tokenize(expr))
  return { label, expr: expr.trim(), text: raw, fn }
}

// ── The [[grafiek ...]] block ─────────────────────────────────────────────

// Body is everything after "[[grafiek" and before "]]".
export function parseGraph(body) {
  const spec = { functions: [], xmin: NaN, xmax: NaN, ymin: NaN, ymax: NaN, step: NaN, size: 'normaal' }
  const errors = []
  const parts = String(body ?? '').replace(/^\s*:/, '').split(';').map(p => p.trim()).filter(Boolean)
  for (const part of parts) {
    const range = /^([xy])\s*(?::|van|=)?\s*(.+?)\s*(?:tot|t\/m|\.\.|…)\s*(.+)$/i.exec(part)
    if (range) {
      const a = parseNumber(range[2]); const b = parseNumber(range[3])
      if (Number.isNaN(a) || Number.isNaN(b)) { errors.push(`bereik ${range[1]} klopt niet`); continue }
      spec[`${range[1].toLowerCase()}min`] = a
      spec[`${range[1].toLowerCase()}max`] = b
      continue
    }
    const step = /^stap(?:grootte)?\s*(?::|=)?\s*(.+)$/i.exec(part)
    if (step) {
      spec.step = parseNumber(step[1])
      if (Number.isNaN(spec.step)) errors.push('stapgrootte klopt niet')
      continue
    }
    const size = /^grootte\s*(?::|=)?\s*(\w+)$/i.exec(part)
    if (size) {
      const v = size[1].toLowerCase()
      if (GRAPH_SIZES[v]) spec.size = v
      else errors.push('grootte is klein, normaal of groot')
      continue
    }
    spec.functions.push(part)
  }
  return { ...spec, errors: errors.concat(validateGraph(spec)) }
}

export function validateGraph(spec) {
  const errors = []
  if (!spec.functions.length) errors.push('geen functie')
  if (spec.functions.length > MAX_FUNCTIONS) errors.push(`hoogstens ${MAX_FUNCTIONS} functies`)
  for (const f of spec.functions) {
    try { compileFunction(f) } catch (e) { errors.push(`${f}: ${e.message}`) }
  }
  const { xmin, xmax, ymin, ymax, step } = spec
  if (![xmin, xmax].every(Number.isFinite)) errors.push('xmin en xmax ontbreken')
  else if (xmin >= xmax) errors.push('xmin moet kleiner zijn dan xmax')
  if (![ymin, ymax].every(Number.isFinite)) errors.push('ymin en ymax ontbreken')
  else if (ymin >= ymax) errors.push('ymin moet kleiner zijn dan ymax')
  if (!Number.isFinite(step) || step <= 0) errors.push('stapgrootte moet groter dan 0 zijn')
  else if (Number.isFinite(xmax - xmin) && Number.isFinite(ymax - ymin)
    && ((xmax - xmin) / step > 200 || (ymax - ymin) / step > 200)) errors.push('stapgrootte is te klein voor dit bereik')
  return errors
}

// The text the editor inserts for a graph.
export function formatGraph(spec) {
  const fs = spec.functions.map(f => f.trim()).filter(Boolean)
  return `${GRAPH_OPEN}: ${fs.join('; ')}; x: ${formatNumber(spec.xmin)} tot ${formatNumber(spec.xmax)}; `
    + `y: ${formatNumber(spec.ymin)} tot ${formatNumber(spec.ymax)}; stap: ${formatNumber(spec.step)}`
    + `${spec.size && spec.size !== 'normaal' ? `; grootte: ${spec.size}` : ''}${GRAPH_CLOSE}`
}

// Every graph block in a text, with where it sits (for editing one in place).
export function findGraphs(text) {
  const src = String(text ?? '')
  const out = []
  let from = 0
  for (;;) {
    const start = src.toLowerCase().indexOf(GRAPH_OPEN, from)
    if (start === -1) break
    const end = src.indexOf(GRAPH_CLOSE, start + GRAPH_OPEN.length)
    if (end === -1) break
    out.push({ start, end: end + GRAPH_CLOSE.length, body: src.slice(start + GRAPH_OPEN.length, end) })
    from = end + GRAPH_CLOSE.length
  }
  return out
}

// ── Drawing ────────────────────────────────────────────────────────────────

// Sample a function into polyline pieces (in graph units). The line is broken
// where the function is undefined or jumps across the whole window (asymptote).
export function samplePieces(fn, xmin, xmax, ymin, ymax, samples = 600) {
  const pieces = []
  let cur = []
  const span = ymax - ymin
  const lo = ymin - span * 2; const hi = ymax + span * 2
  let prev = null
  for (let i = 0; i <= samples; i++) {
    const x = xmin + ((xmax - xmin) * i) / samples
    let y
    try { y = fn(x) } catch { y = NaN }
    if (!Number.isFinite(y)) { if (cur.length > 1) pieces.push(cur); cur = []; prev = null; continue }
    if (prev != null && Math.abs(y - prev) > span * 3 && (y > ymax || y < ymin || prev > ymax || prev < ymin)) {
      if (cur.length > 1) pieces.push(cur)
      cur = []
    }
    cur.push([x, Math.max(lo, Math.min(hi, y))])
    prev = y
  }
  if (cur.length > 1) pieces.push(cur)
  return pieces
}

// Grid values from min to max at multiples of step.
export function gridValues(min, max, step) {
  const out = []
  const first = Math.ceil(min / step - 1e-9)
  for (let k = first; k * step <= max + step * 1e-9; k++) out.push(Math.round(k * step * 1e9) / 1e9)
  return out
}
