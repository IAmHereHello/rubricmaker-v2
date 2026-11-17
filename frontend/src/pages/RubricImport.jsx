import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import * as api from '../api.js'
import BackButton from '../components/BackButton.jsx'
import MathText from '../components/MathText.jsx'
import { readJsonFile, resultLabel } from '../utils/shareFiles.js'

const ROUTES = ['oranje', 'geel', 'blauw']
const METHOD_LABELS = { points: 'Punten (%)', goals: 'Leerdoelen', cijfer: 'Cijfer', opdracht: 'Grote opdracht' }
const KIND_STYLE = {
  new: { label: 'Nieuw', bg: '#eafaf1', color: '#1a7a43' },
  changed: { label: 'Gewijzigd', bg: '#fff7e6', color: '#a05800' },
  removed: { label: 'Niet in het bestand', bg: '#fdf0ef', color: '#c0392b' },
  name: { label: 'Naam', bg: '#eef2f7', color: '#1e3a5f' },
  normering: { label: 'Normering', bg: '#eef2f7', color: '#1e3a5f' },
  structure: { label: 'Secties', bg: '#eef2f7', color: '#1e3a5f' },
}

function fmtValue(v) {
  if (v === null || v === undefined || v === '') return '(leeg)'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(geen)'
  return String(v)
}

function normeringText(n) {
  if (!n || !n.method) return 'Geen normering'
  const cfg = n.config || {}
  const method = METHOD_LABELS[n.method] || n.method
  if (n.method === 'cijfer') {
    const c = cfg.cijfer || {}
    return `${method}: punten / totaal × ${c.multiplier ?? 9} + ${c.offset ?? 1}`
  }
  const unit = n.method === 'points' ? '%' : n.method === 'goals' ? ' leerdoelen' : ' punten'
  const parts = ROUTES.filter(r => cfg[r]).map(r => `${r} ${cfg[r].beheerst ?? '-'}/${cfg[r].expert ?? '-'}${unit}`)
  return `${method}${parts.length ? `: Beheerst/Expert ${parts.join(', ')}` : ''}`
}

function Kind({ kind }) {
  const k = KIND_STYLE[kind] || KIND_STYLE.changed
  return <span style={{ fontSize: 11, fontWeight: 700, background: k.bg, color: k.color, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>{k.label}</span>
}

function ItemDetails({ item }) {
  if (item.kind === 'name') return <div>"{item.old}" wordt "{item.new}"</div>
  if (item.kind === 'normering') {
    return (
      <div>
        <div>Nu: {normeringText(item.old)}</div>
        <div>Wordt: {normeringText(item.new)}</div>
      </div>
    )
  }
  if (item.kind === 'structure') {
    const fmt = list => list.map(s => `${s.name || '(naamloos)'}${s.group ? ' (groep)' : ''}`).join(', ')
    return (
      <div>
        <div>Nu: {fmt(item.old)}</div>
        <div>Wordt: {fmt(item.new)}</div>
      </div>
    )
  }
  return (
    <div>
      {item.section && <div className="text-muted">Sectie: {item.section}</div>}
      {item.description && <div style={{ marginBottom: 4 }}><MathText text={item.description} /></div>}
      {item.kind === 'new' && item.max_score != null && <div className="text-muted">Maximumscore {item.max_score}</div>}
      {item.changes && (
        <ul style={{ margin: '4px 0 0 18px', fontSize: 13 }}>
          {item.changes.map(c => (
            <li key={c.field}><strong>{c.label}</strong>: {fmtValue(c.old)} → {fmtValue(c.new)}</li>
          ))}
        </ul>
      )}
      {item.fields && <div className="text-muted">{item.fields.includes('sectie') ? 'Verplaatst naar een andere sectie. ' : ''}{item.fields.includes('onderdeel') ? 'Beschrijvingen, punten of routes zijn aangepast.' : ''}</div>}
    </div>
  )
}

export default function RubricImport() {
  const location = useLocation()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [file, setFile] = useState(location.state?.file || null)
  const [fileName, setFileName] = useState(location.state?.fileName || '')
  const [info, setInfo] = useState(null)        // inspect result
  const [preview, setPreview] = useState(null)  // update preview
  const [accept, setAccept] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (!file) return
    setError(''); setInfo(null); setPreview(null); setAccept(null); setDone(null)
    api.inspectRubricFile(file)
      .then(setInfo)
      .catch(e => setError(api.errorText(e, 'Dit bestand kan niet gelezen worden.')))
  }, [file])

  // Recalculate the preview whenever the ticks or moves change
  useEffect(() => {
    if (!info || info.kind !== 'update' || done) return
    const id = ++reqId.current
    const t = setTimeout(() => {
      api.previewRubricUpdate(file, accept)
        .then(p => {
          if (id !== reqId.current) return
          setPreview(p)
          if (!accept) setAccept(p.accept)
        })
        .catch(e => id === reqId.current && setError(api.errorText(e, 'Het overzicht kon niet berekend worden.')))
    }, accept ? 250 : 0)
    return () => clearTimeout(t)
  }, [info, accept, file, done])

  async function chooseFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const data = await readJsonFile(f)
      setFileName(f.name)
      setFile(data)
    } catch (err) { setError(err.message) }
  }

  async function importNew() {
    setBusy(true)
    try {
      const r = await api.importRubricFile(file)
      navigate(`/tests/${r.test_id}/edit`)
    } catch (e) {
      setError(api.errorText(e, 'Importeren mislukt.'))
    } finally { setBusy(false) }
  }

  function toggle(itemId, value) {
    setAccept(a => {
      const next = { ...a, items: { ...a.items, [itemId]: value }, moves: { ...(a.moves || {}) } }
      if (!value) delete next.moves[itemId]
      return next
    })
  }

  function setMove(itemId, target) {
    setAccept(a => {
      const moves = { ...(a.moves || {}) }
      if (target) moves[itemId] = target
      else delete moves[itemId]
      return { ...a, moves }
    })
  }

  const items = preview?.items || []
  const isOpdracht = preview?.test?.grading_method === 'opdracht'
  const ticked = id => !!accept?.items?.[id]
  const deletions = useMemo(() => items.filter(it => it.kind === 'removed' && ticked(it.id) && !accept?.moves?.[it.id] && it.score_count > 0), [items, accept])

  async function apply() {
    const lost = deletions.reduce((n, it) => n + it.score_count, 0)
    if (lost > 0 && !confirm(`Let op: ${lost} ${lost === 1 ? 'score wordt' : 'scores worden'} definitief verwijderd. Doorgaan?`)) return
    setBusy(true)
    try {
      const r = await api.applyRubricUpdate(file, accept)
      setDone(r)
    } catch (e) {
      setError(api.errorText(e, 'De update kon niet worden toegepast.'))
    } finally { setBusy(false) }
  }

  const tickedCount = items.filter(it => ticked(it.id)).length

  return (
    <div className="page">
      <div className="page-header">
        <h1>Rubric importeren</h1>
        <div className="gap-8">
          <input ref={fileRef} type="file" accept=".rubric,application/json" style={{ display: 'none' }} onChange={chooseFile} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>{file ? 'Ander bestand kiezen' : 'Bestand kiezen'}</button>
          <BackButton fallback="/tests" />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!file && !error && (
        <div className="card text-muted">Kies een .rubric-bestand dat je van een collega hebt gekregen.</div>
      )}

      {info?.kind === 'new' && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>{info.summary.name}</h2>
          <p style={{ marginBottom: 6 }}>
            {info.summary.grading_method === 'opdracht'
              ? `Grote opdracht met ${info.summary.criterion_count || 0} onderdelen.`
              : `Toets met ${info.summary.question_count} vragen.`}
            {' '}Normering: {METHOD_LABELS[info.summary.grading_method] || 'nog niet ingesteld'}.
          </p>
          <p className="text-muted" style={{ marginBottom: 14 }}>
            Je krijgt een eigen kopie die je mag aanpassen. Vragen die je verandert worden niet vergeleken tot je collega's dezelfde wijziging hebben.
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={importNew}>Importeren</button>
        </div>
      )}

      {info?.kind === 'update' && done && (
        <div className="card">
          <div className="alert alert-success" style={{ marginBottom: 12 }}>
            De update is toegepast op "{preview?.test?.name || info.test_name}".
            {done.moved > 0 && ` ${done.moved} ${done.moved === 1 ? 'score is' : 'scores zijn'} verplaatst.`}
            {done.changes.length > 0 && ` ${done.changes.length} ${done.changes.length === 1 ? 'leerling staat' : 'leerlingen staan'} op "te controleren" in het rapport.`}
          </div>
          <div className="gap-8">
            <Link className="btn btn-primary" to={`/tests/${done.test_id}/edit`}>Toets bekijken</Link>
            <Link className="btn btn-secondary" to="/reports">Naar Rapporten</Link>
          </div>
        </div>
      )}

      {info?.kind === 'update' && !done && (
        <>
          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>Update voor "{info.test_name}"</h2>
            <p className="text-muted">
              Je hebt deze rubric al{fileName ? ` (bestand: ${fileName})` : ''}. Hieronder staat wat er anders is. Vink aan wat je wilt overnemen; niets wordt opgeslagen tot je op Update toepassen klikt.
            </p>
          </div>

          {preview && items.length === 0 && (
            <div className="card">Er zijn geen verschillen: je versie is gelijk aan dit bestand.</div>
          )}

          {items.length > 0 && accept && (
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Wijzigingen</h3>
              {items.map(it => (
                <div key={it.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid #eee' }}>
                  <input type="checkbox" checked={ticked(it.id)} onChange={e => toggle(it.id, e.target.checked)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div className="gap-8" style={{ marginBottom: 4 }}>
                      <Kind kind={it.kind} />
                      {it.label && <strong>{it.label}</strong>}
                    </div>
                    <ItemDetails item={it} />
                    {it.kind === 'changed' && it.score_count > 0 && (
                      <div className="text-muted" style={{ marginTop: 4 }}>Al {it.score_count} keer nagekeken; resultaten worden opnieuw berekend.</div>
                    )}
                    {it.kind === 'removed' && (
                      <div style={{ marginTop: 6 }}>
                        <div className="text-muted">
                          Staat niet in het bestand van je collega: verwijderd, of alleen bij jou toegevoegd. Aanvinken verwijdert {isOpdracht ? 'dit onderdeel' : 'deze vraag'} bij jou.
                        </div>
                        {ticked(it.id) && it.score_count > 0 && (
                          <div style={{ marginTop: 6, padding: 8, background: '#fdf0ef', borderRadius: 6 }}>
                            <div style={{ fontWeight: 600, color: '#c0392b', marginBottom: 6 }}>
                              {it.score_count} {it.score_count === 1 ? 'score' : 'scores'} op {isOpdracht ? 'dit onderdeel' : 'deze vraag'}.
                            </div>
                            <label className="gap-8" style={{ fontSize: 13 }}>
                              <span>Scores</span>
                              <select value={accept.moves?.[it.id] || ''} onChange={e => setMove(it.id, e.target.value)}>
                                <option value="">verwijderen</option>
                                {(preview.move_targets || []).map(t => (
                                  <option key={t.key} value={t.key}>
                                    verplaatsen naar {t.label}{t.description ? `: ${t.description.slice(0, 40)}` : ''}{t.max_score != null ? ` (max ${t.max_score})` : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {accept.moves?.[it.id] && !isOpdracht && (
                              <div className="text-muted" style={{ marginTop: 4 }}>
                                Scores hoger dan de nieuwe maximumscore worden afgetopt; die leerlingen komen op "te controleren".
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {preview && items.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Gevolgen voor resultaten</h3>
              {preview.changes.length === 0 ? (
                <p className="text-muted">Met deze keuzes verandert er geen resultaat van een leerling.</p>
              ) : (
                <>
                  <p className="text-muted" style={{ marginBottom: 8 }}>
                    Deze leerlingen komen na de update op "te controleren" in het rapport, tot je hun resultaat hebt bekeken.
                  </p>
                  <table>
                    <thead>
                      <tr><th>Klas</th><th>Leerling</th><th>Nu</th><th>Na update</th><th></th></tr>
                    </thead>
                    <tbody>
                      {preview.changes.map(c => (
                        <tr key={`${c.session_id}-${c.student_id}`}>
                          <td>{c.class_name}</td>
                          <td>{c.student_name}</td>
                          <td>{resultLabel(c.old)}</td>
                          <td style={{ fontWeight: 600 }}>{resultLabel(c.new)}</td>
                          <td className="text-muted">
                            {c.manual && `Handmatig gekozen, blijft staan (berekend wordt ${resultLabel(c.auto_new)}). `}
                            {c.capped && 'Score afgetopt. '}
                            {!c.manual && (c.new === null || c.new === undefined) && 'Nog niet alles nagekeken (bijv. een nieuw onderdeel).'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {deletions.length > 0 && (
                <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
                  Bij het toepassen worden {deletions.reduce((n, it) => n + it.score_count, 0)} scores verwijderd ({deletions.map(d => d.label).join(', ')}).
                </div>
              )}
              <div className="gap-8" style={{ marginTop: 14 }}>
                <button className="btn btn-primary" disabled={busy || tickedCount === 0} onClick={apply}>
                  {busy ? 'Bezig...' : `Update toepassen (${tickedCount})`}
                </button>
                <Link className="btn btn-secondary" to="/tests">Annuleren</Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
