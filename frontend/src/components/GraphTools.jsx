import { useState } from 'react'
import FunctionGraph from './FunctionGraph.jsx'
import {
  DEFAULT_GRAPH, MAX_FUNCTIONS, GRAPH_SIZES, findGraphs, parseGraph, formatGraph, validateGraph, parseNumber, formatNumber,
} from '../utils/graph.js'

const FIELDS = [
  ['xmin', 'xmin'], ['xmax', 'xmax'], ['ymin', 'ymin'], ['ymax', 'ymax'], ['step', 'Stapgrootte'],
]

function toForm(spec) {
  const f = { functions: spec.functions.join('\n'), size: spec.size || 'normaal' }
  for (const [k] of FIELDS) f[k] = formatNumber(spec[k])
  return f
}

function fromForm(form) {
  const spec = { functions: form.functions.split('\n').map(s => s.trim()).filter(Boolean), size: form.size }
  for (const [k] of FIELDS) spec[k] = parseNumber(form[k])
  return spec
}

function GraphDialog({ initial, isNew, onSave, onDelete, onCancel }) {
  const [form, setForm] = useState(() => toForm(initial))
  const spec = fromForm(form)
  const errors = validateGraph(spec)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 640, width: '100%', margin: 0, maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>{isNew ? 'Grafiek invoegen' : 'Grafiek bewerken'}</h2>
        <div className="graph-dialog">
          <div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Functie <span className="text-muted" style={{ fontWeight: 400 }}>(één per regel, hoogstens {MAX_FUNCTIONS})</span></label>
              <textarea
                rows={3} autoFocus value={form.functions}
                onChange={e => set('functions', e.target.value)}
                placeholder={'y = x^2 - 3\ng(x) = 2x + 1'}
                style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13 }}
              />
            </div>
            <div className="graph-dialog-numbers">
              {FIELDS.map(([k, label]) => (
                <div key={k} className="field">
                  <label>{label}</label>
                  <input type="text" inputMode="decimal" value={form[k]} onChange={e => set(k, e.target.value)} style={{ width: '100%' }} />
                </div>
              ))}
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Grootte</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {Object.keys(GRAPH_SIZES).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400, cursor: 'pointer' }}>
                    <input type="radio" name="graph-size" checked={form.size === k} onChange={() => set('size', k)} />
                    {k[0].toUpperCase() + k.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className="math-hint" style={{ marginTop: 8, lineHeight: 1.6 }}>
              Schrijf bijvoorbeeld <code>2x + 1</code>, <code>x^2</code>, <code>sqrt(x)</code>, <code>1/x</code>, <code>sin(x)</code>, <code>2^x</code>, <code>|x|</code> of <code>\frac{'{1}{2}'}x</code>.
              Kommagetallen mogen met een komma. De stapgrootte bepaalt de rasterlijnen en de getallen langs de assen.
            </div>
          </div>
          <div>
            <span className="math-preview-label">Voorbeeld</span>
            {errors.length
              ? <div className="math-error" style={{ fontFamily: 'inherit', fontSize: 13 }}>{errors.join(', ')}</div>
              : <FunctionGraph body={formatGraph(spec).slice('[[grafiek'.length, -2)} />}
          </div>
        </div>
        <div className="gap-8" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <div>{!isNew && <button className="btn btn-danger" onClick={onDelete}>Verwijderen</button>}</div>
          <div className="gap-8">
            <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
            <button className="btn btn-primary" disabled={errors.length > 0} onClick={() => onSave(formatGraph(spec))}>
              {isNew ? 'Invoegen' : 'Opslaan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Under a text field in the editors: insert a graph, or edit one that is
// already in the text, without having to type the [[grafiek ...]] code.
export default function GraphTools({ text, onChange }) {
  const [editing, setEditing] = useState(null) // 'new' | index of a graph in the text
  const value = text ?? ''
  const graphs = findGraphs(value)

  function save(code) {
    if (editing === 'new') {
      const sep = value && !value.endsWith('\n') ? '\n' : ''
      onChange(value + sep + code)
    } else {
      const g = graphs[editing]
      onChange(value.slice(0, g.start) + code + value.slice(g.end))
    }
    setEditing(null)
  }

  function remove() {
    const g = graphs[editing]
    let end = g.end
    if (value[end] === '\n') end++
    onChange((value.slice(0, g.start) + value.slice(end)).replace(/\n$/, ''))
    setEditing(null)
  }

  let initial = DEFAULT_GRAPH
  if (typeof editing === 'number') {
    const parsed = parseGraph(graphs[editing].body)
    initial = { ...DEFAULT_GRAPH, ...Object.fromEntries(Object.entries(parsed).filter(([k, v]) => k === 'size' || (Array.isArray(v) ? v.length : Number.isFinite(v)))) }
  }

  return (
    <div className="graph-tools">
      <button type="button" className="graph-tools-btn" onClick={() => setEditing('new')}>+ Grafiek invoegen</button>
      {graphs.map((_, i) => (
        <button key={i} type="button" className="graph-tools-btn" onClick={() => setEditing(i)}>
          {graphs.length > 1 ? `Grafiek ${i + 1} bewerken` : 'Grafiek bewerken'}
        </button>
      ))}
      {editing != null && (
        <GraphDialog
          initial={initial} isNew={editing === 'new'}
          onSave={save} onDelete={remove} onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
