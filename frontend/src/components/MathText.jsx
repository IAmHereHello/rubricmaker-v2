import { useLayoutEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { splitMath, prepareLatex } from '../utils/mathText.js'
import FunctionGraph from './FunctionGraph.jsx'

function render(latex, displayMode) {
  try {
    return katex.renderToString(prepareLatex(latex), { displayMode, throwOnError: true, output: 'html' })
  } catch {
    return null
  }
}

// A `$$...$$` formula, centred on its own line. One that is wider than its box
// is scaled down so nothing is cut off on screen or in the PDF.
function DisplayMath({ html }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      const available = el.clientWidth
      const needed = el.scrollWidth
      if (available > 0 && needed > available) el.style.fontSize = `${Math.floor((available / needed) * 100)}%`
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(el.parentElement || el)
    return () => ro.disconnect()
  }, [html])
  return <span ref={ref} className="math-display" dangerouslySetInnerHTML={{ __html: html }} />
}

// Rubric text with its formulas rendered. A formula with a mistake is shown as
// the raw text; `showErrors` (the editor preview) colours it red.
export default function MathText({ text, showErrors = false }) {
  const parts = splitMath(text)
  if (parts.every(p => p.type === 'text')) return <>{parts.map(p => p.value).join('')}</>
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === 'text') return <span key={i}>{p.value}</span>
        if (p.type === 'graph') return <FunctionGraph key={i} body={p.value} showErrors={showErrors} />
        const display = p.type === 'display'
        const html = render(p.value, display)
        if (html == null) {
          const raw = display ? `$$${p.value}$$` : `$${p.value}$`
          return <span key={i} className={showErrors ? 'math-error' : undefined} title={showErrors ? 'Deze formule bevat een fout' : undefined}>{raw}</span>
        }
        return display
          ? <DisplayMath key={i} html={html} />
          : <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </>
  )
}

// Under a text field in the editors: what the text will look like, shown once
// it contains a formula.
export function MathPreview({ text }) {
  if (!text || !(text.includes('$') || text.includes('[[grafiek'))) return null
  return (
    <div className="math-preview">
      <span className="math-preview-label">Voorbeeld</span>
      <div><MathText text={text} showErrors /></div>
    </div>
  )
}

export function MathHint() {
  return <div className="math-hint">Formule: <code>$x^2$</code> in de zin, <code>$$...$$</code> op een eigen regel.</div>
}
