import katex from 'katex'
import {
  parseGraph, compileFunction, samplePieces, gridValues, formatNumber, GRAPH_COLORS, GRAPH_SIZES,
} from '../utils/graph.js'
import { prepareLatex } from '../utils/mathText.js'

// Inline attributes and styles only: html2canvas draws the SVG as an image for
// the PDF exports, and stylesheet classes do not reach it there.

const PAD = { left: 10, right: 14, top: 14, bottom: 10 }
const MAX_LABELS = 12

// Viewbox units are pixels at the chosen size; text stays readable when small.

// Show "f(x) = 2x + 1" with KaTeX where the typed text allows it.
function functionLabelHtml(text) {
  const latex = String(text)
    .replace(/\bsqrt\s*\(([^()]*)\)/gi, '\\sqrt{$1}')
    .replace(/\bwortel\s*\(([^()]*)\)/gi, '\\sqrt{$1}')
    .replace(/\*/g, '\\cdot ')
    .replace(/\b(sin|cos|tan|ln|log)\b/g, '\\$1')
    .replace(/\babs\s*\(([^()]*)\)/gi, '|$1|')
  try {
    return katex.renderToString(prepareLatex(latex), { throwOnError: true, output: 'html' })
  } catch {
    return null
  }
}

let clipCounter = 0

export default function FunctionGraph({ body, showErrors = false }) {
  const spec = parseGraph(body)
  if (spec.errors.length) {
    return (
      <span
        style={{ display: 'block', color: showErrors ? '#b91c1c' : undefined, fontSize: '0.9em', margin: '4px 0' }}
        title={showErrors ? 'Deze grafiek bevat een fout' : undefined}
      >
        {showErrors ? `Grafiek: ${spec.errors.join(', ')}` : `[grafiek${body}]`}
      </span>
    )
  }

  const { xmin, xmax, ymin, ymax, step } = spec
  const WIDTH = GRAPH_SIZES[spec.size] || GRAPH_SIZES.normaal
  const fns = spec.functions.map(compileFunction)

  // Keep the grid squares square where that gives a sensible shape.
  const ratio = Math.min(1.4, Math.max(0.45, (ymax - ymin) / (xmax - xmin)))
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = Math.round(plotW * ratio)
  const height = plotH + PAD.top + PAD.bottom
  const sx = x => PAD.left + ((x - xmin) / (xmax - xmin)) * plotW
  const sy = y => PAD.top + ((ymax - y) / (ymax - ymin)) * plotH

  const xs = gridValues(xmin, xmax, step)
  const ys = gridValues(ymin, ymax, step)
  // Numbers along the axes: every grid line, thinned out when crowded.
  const maxLabels = Math.round(MAX_LABELS * WIDTH / GRAPH_SIZES.normaal)
  const every = n => Math.max(1, Math.ceil(n / maxLabels))
  const xEvery = every(xs.length); const yEvery = every(ys.length)
  const labelled = (v, k) => Math.abs(Math.round(v / step)) % k === 0

  // Axes sit at 0, or along the edge when 0 is outside the window.
  const axisY = sy(Math.min(ymax, Math.max(ymin, 0)))
  const axisX = sx(Math.min(xmax, Math.max(xmin, 0)))
  const clipId = `graph-clip-${++clipCounter}`

  const fontSize = 10
  const labelColor = '#475569'

  return (
    <span style={{ display: 'block', margin: '8px 0', textAlign: 'left' }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${WIDTH} ${height}`}
        width={WIDTH}
        height={height}
        style={{ display: 'block', maxWidth: '100%', height: 'auto', background: '#ffffff' }}
        role="img"
        aria-label={`Grafiek van ${spec.functions.join(', ')}`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Grid */}
        {xs.map(v => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={PAD.top} y2={PAD.top + plotH} stroke="#e2e8f0" strokeWidth="0.8" />)}
        {ys.map(v => <line key={`gy${v}`} y1={sy(v)} y2={sy(v)} x1={PAD.left} x2={PAD.left + plotW} stroke="#e2e8f0" strokeWidth="0.8" />)}
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="none" stroke="#cbd5e1" strokeWidth="0.8" />

        {/* Axes with arrow heads */}
        <line x1={PAD.left} x2={PAD.left + plotW + 8} y1={axisY} y2={axisY} stroke="#334155" strokeWidth="1.1" />
        <path d={`M${PAD.left + plotW + 10},${axisY} l-6,-3 v6 z`} fill="#334155" />
        <line x1={axisX} x2={axisX} y1={PAD.top + plotH} y2={PAD.top - 8} stroke="#334155" strokeWidth="1.1" />
        <path d={`M${axisX},${PAD.top - 10} l-3,6 h6 z`} fill="#334155" />
        <text x={PAD.left + plotW + 4} y={axisY - 5} fontSize="10" fontStyle="italic" fill="#334155" textAnchor="end" fontFamily="Georgia, serif">x</text>
        <text x={axisX + 5} y={PAD.top - 2} fontSize="10" fontStyle="italic" fill="#334155" fontFamily="Georgia, serif">y</text>

        {/* Numbers along the axes */}
        {xs.filter(v => v !== 0 && labelled(v, xEvery) && v < xmax).map(v => (
          <g key={`lx${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={axisY - 2} y2={axisY + 2} stroke="#334155" strokeWidth="0.8" />
            <text
              x={sx(v)} y={axisY + (axisY > PAD.top + plotH - 12 ? -4 : fontSize + 3)}
              fontSize={fontSize} fill={labelColor} textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif"
            >{formatNumber(v).replace('-', '−')}</text>
          </g>
        ))}
        {ys.filter(v => v !== 0 && labelled(v, yEvery) && v < ymax).map(v => (
          <g key={`ly${v}`}>
            <line x1={axisX - 2} x2={axisX + 2} y1={sy(v)} y2={sy(v)} stroke="#334155" strokeWidth="0.8" />
            <text
              x={axisX + (axisX < PAD.left + 24 ? 4 : -4)} y={sy(v) + 3}
              fontSize={fontSize} fill={labelColor} textAnchor={axisX < PAD.left + 24 ? 'start' : 'end'} fontFamily="Helvetica, Arial, sans-serif"
            >{formatNumber(v).replace('-', '−')}</text>
          </g>
        ))}
        {xmin < 0 && xmax > 0 && ymin < 0 && ymax > 0 && (
          <text x={axisX - 4} y={axisY + fontSize + 3} fontSize={fontSize} fill={labelColor} textAnchor="end" fontFamily="Helvetica, Arial, sans-serif">0</text>
        )}

        {/* The functions */}
        <g clipPath={`url(#${clipId})`}>
          {fns.map((f, i) => samplePieces(f.fn, xmin, xmax, ymin, ymax).map((piece, j) => (
            <polyline
              key={`${i}-${j}`}
              points={piece.map(([x, y]) => `${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(' ')}
              fill="none" stroke={GRAPH_COLORS[i % GRAPH_COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            />
          )))}
        </g>
      </svg>

      {/* Which line is which, once there is more than one */}
      {fns.length > 1 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4, fontSize: '0.9em' }}>
          {fns.map((f, i) => {
            const html = functionLabelHtml(f.text)
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 16, height: 3, borderRadius: 2, background: GRAPH_COLORS[i % GRAPH_COLORS.length] }} />
                {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span>{f.text}</span>}
              </span>
            )
          })}
        </span>
      )}
    </span>
  )
}
