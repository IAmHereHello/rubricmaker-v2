import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import * as api from '../api.js'
import MathText from '../components/MathText.jsx'
import TeacherNameDialog from '../components/TeacherNameDialog.jsx'
import { pyramidLabel } from '../constants.js'
import { exportPDF } from '../utils/exportPDF.js'
import { readJsonFile, safeFileName } from '../utils/shareFiles.js'

const ROUTES = ['oranje', 'geel', 'blauw']
const CATEGORY_COLORS = { in_ontwikkeling: '#e57373', beheerst: '#ffb74d', expert: '#66bb6a' }
const CATEGORY_LABELS = { in_ontwikkeling: 'In ontwikkeling', beheerst: 'Beheerst', expert: 'Expert' }
const BUCKET_COLORS = { '<5,5': '#e57373', '5,5-6,9': '#ffb74d', '7,0-7,9': '#aed581', '8+': '#66bb6a' }
const LEVEL_COLORS = { niet: '#e57373', voldoende: '#ffb74d', goed: '#66bb6a' }
const LEVEL_LABELS = { niet: 'Niet', voldoende: 'Voldoende', goed: 'Goed' }
const PYRAMID_COLORS = { reproductie: '#4e79a7', verbinding: '#f28e2b', reflectie: '#59a14f' }

function pctClass(pct) {
  if (pct === null || pct === undefined) return 'cell-empty'
  if (pct >= 75) return 'cell-green'
  if (pct >= 55) return 'cell-orange'
  return 'cell-red'
}

function PctCell({ value }) {
  return <td className={pctClass(value)} style={{ textAlign: 'center', fontWeight: 600 }}>{value === null || value === undefined ? '-' : `${value}%`}</td>
}

function rowName(r) {
  return `${r.teacher_name} · ${r.label}`
}

function RowLabel({ r }) {
  return (
    <td style={{ whiteSpace: 'nowrap', fontWeight: r.is_total ? 700 : 400 }}>
      {r.teacher_name}{r.own ? ' (jij)' : ''}
      <span className="text-muted"> · {r.label}</span>
    </td>
  )
}

function distText(d) {
  if (!d) return '-'
  const parts = []
  if (d.categories) {
    parts.push(Object.entries(d.categories).map(([k, v]) => `${CATEGORY_LABELS[k]} ${v}`).join(' · '))
  }
  if (d.cijfer) {
    parts.push(`gem. ${Number(d.cijfer.avg).toFixed(1).replace('.', ',')} · ${d.cijfer.voldoende_pct}% voldoende`)
  }
  return parts.join(' | ') || '-'
}

function PctTable({ title, columns, rows, valueOf, note }) {
  if (!columns.length) return null
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>{title}</h3>
      {note && <p className="text-muted" style={{ marginBottom: 8 }}>{note}</p>}
      <table>
        <thead>
          <tr>
            <th>Docent · klas</th>
            {columns.map(c => <th key={c.key} title={c.title || ''} style={{ textAlign: 'center' }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <RowLabel r={r} />
              {columns.map(c => <PctCell key={c.key} value={valueOf(r, c.key)} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DistributionChart({ rows }) {
  const hasCategories = rows.some(r => r.distribution?.categories)
  const hasCijfer = rows.some(r => r.distribution?.cijfer)
  const toPct = (obj) => {
    const total = Object.values(obj || {}).reduce((a, b) => a + b, 0)
    return Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, total ? Math.round(v / total * 100) : 0]))
  }
  const charts = []
  if (hasCategories) {
    charts.push({
      title: 'Resultaten (% van de nagekeken leerlingen)',
      keys: Object.keys(CATEGORY_LABELS), labels: CATEGORY_LABELS, colors: CATEGORY_COLORS,
      data: rows.filter(r => r.distribution?.categories).map(r => ({ name: rowName(r), ...toPct(r.distribution.categories) })),
    })
  }
  if (hasCijfer) {
    charts.push({
      title: 'Cijfers (% van de nagekeken leerlingen)',
      keys: Object.keys(BUCKET_COLORS), labels: Object.fromEntries(Object.keys(BUCKET_COLORS).map(k => [k, k])), colors: BUCKET_COLORS,
      data: rows.filter(r => r.distribution?.cijfer).map(r => ({ name: rowName(r), ...toPct(r.distribution.cijfer.buckets) })),
    })
  }
  return charts.map(ch => (
    <div className="card" key={ch.title}>
      <h3 style={{ fontSize: 15, marginBottom: 8 }}>{ch.title}</h3>
      <ResponsiveContainer width="100%" height={Math.max(140, ch.data.length * 36 + 60)}>
        <BarChart data={ch.data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12 }} />
          <Tooltip formatter={v => `${v}%`} />
          <Legend itemSorter={null} />
          {ch.keys.map(k => <Bar key={k} dataKey={k} name={ch.labels[k]} stackId="a" fill={ch.colors[k]} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  ))
}

function PyramidChart({ rows, levels }) {
  if (!levels.length) return null
  const data = rows.map(r => ({ name: rowName(r), ...Object.fromEntries(levels.map(l => [l, r.pyramid?.[l] ?? null])) }))
  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 8 }}>Per pyramidelaag (% van de punten)</h3>
      <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 44 + 60)}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12 }} />
          <Tooltip formatter={v => (v === null ? '-' : `${v}%`)} />
          <Legend itemSorter={null} />
          {levels.map(l => <Bar key={l} dataKey={l} name={pyramidLabel(l)} fill={PYRAMID_COLORS[l]} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function LevelBar({ counts }) {
  const total = Object.values(counts || {}).reduce((a, b) => a + b, 0)
  if (!total) return <span className="text-muted">-</span>
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', marginBottom: 2 }}>
        {Object.keys(LEVEL_COLORS).map(lv => counts[lv] > 0 && (
          <div key={lv} style={{ width: `${counts[lv] / total * 100}%`, background: LEVEL_COLORS[lv] }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>
        N {counts.niet} · V {counts.voldoende} · G {counts.goed}
      </div>
    </div>
  )
}

function Warnings({ items, extra, noun }) {
  const blocked = items.filter(q => !q.comparable)
  if (!blocked.length && !extra.length) return null
  return (
    <div className="alert" style={{ background: '#fff7e6', color: '#7a4a00', border: '1px solid #f3d19c' }}>
      {blocked.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Niet vergeleken: {blocked.length} {blocked.length === 1 ? noun.one : noun.many}
          </div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            De rubrics verschillen hier. Dit wordt vergeleken zodra iedereen dezelfde versie heeft (deel de rubric opnieuw als update).
          </div>
          <ul style={{ margin: '0 0 6px 18px', fontSize: 13 }}>
            {blocked.map(q => <li key={q.key}><strong>{q.label}</strong>{q.description ? ` (${q.description.slice(0, 50)})` : ''}: {q.reasons.join('; ')}</li>)}
          </ul>
        </>
      )}
      {extra.length > 0 && (
        <div style={{ fontSize: 13 }}>
          Alleen bij een collega: {extra.map((e, i) => <span key={i}>{i > 0 && ', '}{e.description ? `"${e.description.slice(0, 40)}"` : '(naamloos)'} ({e.teacher_name})</span>)}
        </div>
      )}
    </div>
  )
}

function CompareDetail({ shareId }) {
  const [route, setRoute] = useState('')
  const [data, setData] = useState(null)
  const [families, setFamilies] = useState([])
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef(null)

  function load() {
    api.getComparison(shareId, route).then(setData).catch(e => setError(api.errorText(e, 'Vergelijking laden mislukt.')))
    api.getComparisons().then(setFamilies).catch(() => {})
  }
  useEffect(load, [shareId, route])

  const family = families.find(f => f.share_id === shareId)

  async function remove(imp) {
    if (!confirm(`De resultaten van ${imp.teacher_name} verwijderen uit deze vergelijking?`)) return
    try { await api.deleteComparisonImport(imp.id); load() } catch { setError('Verwijderen mislukt.') }
  }

  async function handleExport() {
    if (!reportRef.current) return
    setExporting(true)
    try { await exportPDF(reportRef.current, `vergelijking-${safeFileName(data?.name)}.pdf`) }
    finally { setExporting(false) }
  }

  if (!data) return <div className="page">{error ? <div className="alert alert-error">{error}</div> : 'Laden...'}</div>

  const rows = data.rows
  const isOpdracht = data.kind === 'opdracht'
  const items = isOpdracht ? data.criteria : data.questions
  const comparable = items.filter(q => q.comparable)

  return (
    <div className="page">
      <div className="page-header">
        <h1>Vergelijken: {data.name}</h1>
        <div className="gap-8">
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>{exporting ? 'Exporteren...' : 'Exporteer PDF'}</button>
          <Link to="/compare" className="btn btn-secondary">← Vergelijken</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <label className="gap-8">
          <span style={{ fontWeight: 600 }}>Route</span>
          <select value={route} onChange={e => setRoute(e.target.value)}>
            <option value="">Alle routes</option>
            {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Docenten:</span>
          {data.participants.map(p => {
            const imp = family?.imports.find(i => i.id === p.id)
            return (
              <span key={p.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#f0f3f8', borderRadius: 14, padding: '2px 4px 2px 10px', fontSize: 13 }}>
                {p.teacher_name}{p.own ? ' (jij)' : ''}
                {imp && <span className="text-muted" style={{ fontSize: 11 }}>geïmporteerd {new Date(imp.imported_at).toLocaleDateString('nl-NL')}</span>}
                {imp && <button className="btn btn-danger btn-sm" style={{ padding: '0 7px' }} onClick={() => remove(imp)} title="Verwijder deze resultaten">×</button>}
              </span>
            )
          })}
        </div>
      </div>

      <div ref={reportRef} style={{ background: '#f5f7fa', padding: 2 }}>
        <h2 style={{ fontSize: 17, margin: '6px 0 10px' }}>
          {data.name}{route ? ` · route ${route}` : ''}
        </h2>

        <Warnings items={items} extra={data.extra_questions} noun={isOpdracht ? { one: 'onderdeel', many: 'onderdelen' } : { one: 'vraag', many: 'vragen' }} />

        <div className="card" style={{ overflowX: 'auto' }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Overzicht</h3>
          <table>
            <thead>
              <tr>
                <th>Docent · klas</th>
                <th style={{ textAlign: 'center' }}>Nagekeken</th>
                <th style={{ textAlign: 'center' }}>{route ? `Leerlingen ${route}` : 'In vergelijking'}</th>
                <th style={{ textAlign: 'center' }}>Gem. score</th>
                <th>Resultaten</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <RowLabel r={r} />
                  <td style={{ textAlign: 'center' }}>{r.graded} van {r.total}</td>
                  <td style={{ textAlign: 'center' }}>{r.n}</td>
                  <PctCell value={r.total_pct} />
                  <td>
                    {distText(r.distribution)}
                    {r.other_normering && (
                      <span title="Deze docent gebruikt een andere normering; de resultaten zijn daarom niet één op één te vergelijken" style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, background: '#fdf0ef', color: '#c0392b', borderRadius: 4, padding: '1px 6px' }}>
                        andere normering
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted" style={{ marginTop: 8 }}>
            Alleen volledig nagekeken leerlingen tellen mee. Gem. score is over de {isOpdracht ? 'onderdelen' : 'vragen'} die iedereen hetzelfde heeft{isOpdracht ? ' (alle onderdelen van de docent)' : ''}.
          </p>
        </div>

        <DistributionChart rows={rows} />

        {!isOpdracht && (
          <>
            <PyramidChart rows={rows} levels={data.pyramid} />
            <PctTable
              title="Per vraag (% van de punten)"
              columns={comparable.map(q => ({ key: q.key, label: q.label, title: `${q.description} (max ${q.max_score})` }))}
              rows={rows}
              valueOf={(r, k) => r.questions[k]}
            />
            <div className="card" style={{ fontSize: 13 }}>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Vragen</h3>
              {comparable.map(q => (
                <div key={q.key} style={{ marginBottom: 3 }}>
                  <strong>{q.label}</strong> (max {q.max_score}, {pyramidLabel(q.pyramid_level)}{q.domain ? `, ${q.domain}` : ''}{q.learning_goal ? `, ${q.learning_goal}` : ''}): <MathText text={q.description} />
                </div>
              ))}
            </div>
            <PctTable title="Per leerdoel (% van de punten)" columns={data.goals.map(g => ({ key: g, label: g }))} rows={rows} valueOf={(r, k) => r.goals[k]} />
            <PctTable title="Per pyramidelaag (% van de punten)" columns={data.pyramid.map(l => ({ key: l, label: pyramidLabel(l) }))} rows={rows} valueOf={(r, k) => r.pyramid[k]} />
            <PctTable title="Per domein (% van de punten)" columns={data.domains.map(d => ({ key: d, label: d }))} rows={rows} valueOf={(r, k) => r.domains[k]} />
          </>
        )}

        {isOpdracht && comparable.length > 0 && (
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Per onderdeel (aantal leerlingen per niveau)</h3>
            <p className="text-muted" style={{ marginBottom: 8 }}>
              {Object.entries(LEVEL_LABELS).map(([k, v]) => <span key={k} style={{ marginRight: 10 }}><span style={{ display: 'inline-block', width: 10, height: 10, background: LEVEL_COLORS[k], marginRight: 4 }} />{v}</span>)}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Docent · klas</th>
                  {comparable.map(c => <th key={c.key} title={c.section}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <RowLabel r={r} />
                    {comparable.map(c => <td key={c.key}><LevelBar counts={r.levels[c.key]} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function CompareHome() {
  const [families, setFamilies] = useState([])
  const [settings, setSettings] = useState(null)
  const [editName, setEditName] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef(null)

  function load() {
    api.getComparisons().then(setFamilies).catch(() => setError('Laden mislukt.'))
    api.getShareSettings().then(setSettings).catch(() => {})
  }
  useEffect(load, [])

  async function chooseFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    setError(''); setNotice('')
    const done = [], failed = []
    for (const f of files) {
      try {
        const data = await readJsonFile(f)
        const r = await api.importResultsFile(data)
        done.push(`${r.teacher_name} (${r.test_name})${r.replaced ? ', oude versie vervangen' : ''}`)
      } catch (err) {
        failed.push(`${f.name}: ${api.errorText(err, err.message || 'importeren mislukt')}`)
      }
    }
    if (done.length) setNotice(`Geïmporteerd: ${done.join('; ')}.`)
    if (failed.length) setError(failed.join(' '))
    load()
  }

  async function saveName(name) {
    setEditName(false)
    try { setSettings(await api.saveShareSettings(name)) } catch { setError('Opslaan mislukt.') }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Vergelijken</h1>
        <div className="gap-8">
          <input ref={fileRef} type="file" multiple accept=".resultaten,application/json" style={{ display: 'none' }} onChange={chooseFiles} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Importeer resultaten</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {editName && <TeacherNameDialog initial={settings?.teacher_name || ''} onSave={saveName} onCancel={() => setEditName(false)} />}

      <div className="card text-muted" style={{ fontSize: 13 }}>
        Collega's maken bij Toetsen een resultatenbestand met <strong>Exporteer resultaten</strong> (zonder leerlingnamen) en sturen het naar jou.
        Importeer hier hun bestanden; je eigen resultaten komen er automatisch bij. Een nieuw bestand van dezelfde collega vervangt het oude.
        <div style={{ marginTop: 8 }}>
          Jouw naam in resultatenbestanden: <strong>{settings?.teacher_name || '(nog niet ingesteld)'}</strong>{' '}
          <button className="btn btn-secondary btn-sm" onClick={() => setEditName(true)}>Wijzigen</button>
        </div>
      </div>

      {families.length === 0 ? (
        <div className="card text-muted">Nog geen resultaten van collega's geïmporteerd.</div>
      ) : families.map(f => (
        <div key={f.share_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{f.name}</div>
            <div className="text-muted" style={{ marginTop: 2 }}>
              {f.own_test_id ? 'Jij + ' : 'Niet in je eigen Toetsen · '}
              {f.imports.map(i => `${i.teacher_name} (${i.graded} lln)`).join(', ')}
            </div>
          </div>
          <Link to={`/compare/${f.share_id}`} className="btn btn-secondary btn-sm">Vergelijken →</Link>
        </div>
      ))}
    </div>
  )
}

export default function Compare() {
  const { shareId } = useParams()
  return shareId ? <CompareDetail shareId={shareId} /> : <CompareHome />
}
