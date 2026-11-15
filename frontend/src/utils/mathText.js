// Formulas in rubric text: `$...$` inside a sentence, `$$...$$` on its own line.
// The text is stored exactly as typed; this only decides how it is shown.

// Split text into plain parts and formulas. `\$` is a literal dollar sign and a
// `$` without a partner stays a dollar sign.
export function splitMath(text) {
  const src = text == null ? '' : String(text)
  const parts = []
  let plain = ''
  const flush = () => { if (plain) { parts.push({ type: 'text', value: plain }); plain = '' } }

  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\' && src[i + 1] === '$') { plain += '$'; i += 2; continue }
    if (ch !== '$') { plain += ch; i++; continue }

    const display = src[i + 1] === '$'
    const open = display ? 2 : 1
    const end = findClose(src, i + open, display)
    const body = end === -1 ? '' : src.slice(i + open, end)
    if (end === -1 || !body.trim()) { plain += ch; i++; continue }

    flush()
    parts.push({ type: display ? 'display' : 'inline', value: body })
    i = end + open
  }
  flush()
  return parts
}

function findClose(src, from, display) {
  for (let j = from; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue }
    if (src[j] !== '$') continue
    if (!display) return j
    if (src[j + 1] === '$') return j
  }
  return -1
}

export const hasMath = text => splitMath(text).some(p => p.type !== 'text')

// Two deviations from strict LaTeX that fit how a Dutch teacher types:
// `%` is a percent sign (not the start of a comment), and a comma directly
// between two digits is a decimal comma (no gap after it).
export function prepareLatex(latex) {
  let out = ''
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i]
    if (ch === '\\') { out += ch + (latex[i + 1] ?? ''); i++; continue }
    if (ch === '%') { out += '\\%'; continue }
    if (ch === ',' && /\d/.test(latex[i - 1] ?? '') && /\d/.test(latex[i + 1] ?? '')) { out += '{,}'; continue }
    out += ch
  }
  return out
}
