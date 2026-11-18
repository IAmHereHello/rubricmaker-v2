import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import BackButton from '../components/BackButton.jsx'
import RouteBadge from '../components/RouteBadge.jsx'
import { readJsonFile, resultLabel } from '../utils/shareFiles.js'

const METHOD_LABELS = { points: 'punten', goals: 'leerdoelen', cijfer: 'cijfer', opdracht: 'grote opdracht' }

function dateNL(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Value({ line, value }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted">(leeg)</span>
  if (line.route) return <RouteBadge route={value} />
  if (line.grade) return <>{resultLabel(value)}</>
  return <>{value}</>
}

function Lines({ lines, isNew }) {
  if (!lines?.length) return null
  return (
    <ul className="ci-lines">
      {lines.map((l, i) => (
        <li key={i}>
          <strong>{l.label}</strong>:{' '}
          {isNew || (l.old === null || l.old === undefined) && l.label === 'Kleur'
            ? <Value line={l} value={l.new} />
            : <>jij <span className="ci-old"><Value line={l} value={l.old} /></span>, bestand <span className="ci-new"><Value line={l} value={l.new} /></span></>}
        </li>
      ))}
    </ul>
  )
}

function rubricNote(info) {
  if (!info) return ''
  if (info.action === 'copy') return `Jouw versie van deze rubric is anders, dus er komt een aparte kopie "${info.name}" in Toetsen.`
  if (info.action === 'new') return 'De rubric wordt toegevoegd aan Toetsen.'
  return `Resultaten komen bij jouw toets "${info.name}".`
}

export default function ClassImport() {
  const location = useLocation()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [file, setFile] = useState(location.state?.file || null)
  const [fileName, setFileName] = useState(location.state?.fileName || '')
  const [info, setInfo] = useState(null)
  const [choice, setChoice] = useState(null)      // { mode, target, new_name } once confirmed
  const [draft, setDraft] = useState({ mode: 'merge', target: '', new_name: '' })
  const [preview, setPreview] = useState(null)
  const [accept, setAccept] = useState(null)
  const [renames, setRenames] = useState({})
  const [letters, setLetters] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (!file) return
    setError(''); setInfo(null); setChoice(null); setPreview(null); setAccept(null); setRenames({}); setDone(null)
    api.inspectClassFile(file)
      .then(d => {
        setInfo(d)
        const top = d.candidates[0]
        if (d.kind === 'update') setChoice({ mode: 'update', target: d.target })
        else if (d.kind === 'new') setDraft({ mode: 'new', target: '', new_name: d.suggested_name })
        else {
          const likely = top && (top.name_matches * 2 >= d.summary.student_count || top.shared_tests > 0)
          setDraft({ mode: likely ? 'merge' : 'new', target: top?.class_name || '', new_name: d.suggested_name })
        }
      })
      .catch(e => setError(api.errorText(e, 'Dit bestand kan niet gelezen worden.')))
  }, [file])

  useEffect(() => {
    if (!choice || done) return
    const id = ++reqId.current
    const t = setTimeout(() => {
      api.previewClassImport({ file, ...choice, accept, renames })
        .then(p => {
          if (id !== reqId.current) return
          setPreview(p); setError('')
          if (!accept) setAccept(p.accept)
        })
        .catch(e => {
          if (id !== reqId.current) return
          setError(api.errorText(e, 'Het overzicht kon niet berekend worden.'))
          if (!preview) setChoice(null)
        })
    }, accept ? 200 : 0)
    return () => clearTimeout(t)
  }, [choice, accept, renames, file, done])

  async function chooseFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setFile(await readJsonFile(f)); setFileName(f.name) }
    catch (err) { setError(err.message) }
  }

  function confirmChoice() {
    if (draft.mode === 'new' && !draft.new_name.trim()) { setError('Vul een klasnaam in.'); return }
    if (draft.mode === 'merge' && !draft.target) { setError('Kies een klas.'); return }
    setError('')
    setChoice(draft.mode === 'new' ? { mode: 'new', new_name: draft.new_name.trim() } : { mode: 'merge', target: draft.target })
  }

  function applyLetters() {
    const next = { ...renames }
    for (const c of preview.clashes) {
      const l = (letters[c.key] || '').trim()
      if (!l) { setError(`Vul een achternaamletter in voor ${c.name}.`); return }
      next[c.key] = `${c.name} ${l}.`
    }
    setError(''); setLetters({}); setRenames(next)
  }

  async function doImport() {
    setBusy(true); setError('')
    try {
      const res = await api.applyClassImport({ file, ...choice, accept, renames })
      setDone(res)
    } catch (e) { setError(api.errorText(e, 'Importeren mislukt.')) }
    setBusy(false)
  }

  const groups = useMemo(() => {
    if (!preview) return []
    const out = [{ key: 'students', title: 'Leerlingen', items: preview.items.filter(i => i.group === 'students') }]
    for (const s of preview.sessions) {
      out.push({ key: s.key, title: s.name, session: s, items: preview.items.filter(i => i.group === s.key) })
    }
    return out.filter(g => g.items.length)
  }, [preview])

  const skippedStudents = useMemo(() => {
    if (!preview || !accept) return new Set()
    return new Set(preview.items.filter(i => i.id.startsWith('student:') && i.kind === 'new' && accept[i.id] === false).map(i => i.id.slice(8)))
  }, [preview, accept])

  const s = info?.summary
  const tickCount = accept ? Object.values(accept).filter(Boolean).length : 0

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-header">
        <h1>Klas importeren van collega</h1>
        <BackButton fallback="/students" />
      </div>
      <input ref={fileRef} type="file" accept=".klas,application/json" style={{ display: 'none' }} onChange={chooseFile} />

      {!file && (
        <div className="card">
          <p style={{ marginBottom: 12 }}>Kies het .klas-bestand dat je van je collega hebt gekregen.</p>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Bestand kiezen</button>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {s && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15 }}>Klas {s.class_name}{s.teacher_name ? ` van ${s.teacher_name}` : ''}</div>
          <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>
            {s.student_count} leerlingen, {s.sessions.length} {s.sessions.length === 1 ? 'toets' : 'toetsen'}
            {s.exported_at ? `, overgedragen op ${dateNL(s.exported_at)}` : ''}{fileName ? ` (${fileName})` : ''}
          </div>
          {!done && <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => fileRef.current?.click()}>Ander bestand</button>}
        </div>
      )}

      {info && !choice && !done && (
        <div className="card">
          {info.kind === 'choice' && (
            <>
              <h2 style={{ fontSize: 15, marginBottom: 8 }}>Lijkt op een klas die je al hebt</h2>
              {info.candidates.map(c => (
                <div key={c.class_name} className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  {c.name_matches} van {s.student_count} namen{c.shared_tests ? ` en ${c.shared_tests} ${c.shared_tests === 1 ? 'toets' : 'toetsen'}` : ''} komen overeen met jouw klas <strong>{c.class_name}</strong> ({c.student_count} leerlingen){c.same_name ? ', zelfde klasnaam' : ''}.
                </div>
              ))}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontWeight: 400, cursor: 'pointer' }}>
                <input type="radio" checked={draft.mode === 'merge'} onChange={() => setDraft(d => ({ ...d, mode: 'merge' }))} />
                Samenvoegen met
                <select value={draft.target} onChange={e => setDraft(d => ({ ...d, mode: 'merge', target: e.target.value }))}>
                  {info.candidates.map(c => <option key={c.class_name} value={c.class_name}>{c.class_name}</option>)}
                </select>
              </label>
              <div className="text-muted" style={{ fontSize: 12, margin: '2px 0 0 24px' }}>Leerlingen met dezelfde naam worden gekoppeld. Je ziet eerst alle wijzigingen.</div>
            </>
          )}
          {info.kind === 'new' && <h2 style={{ fontSize: 15, marginBottom: 8 }}>Nieuwe klas</h2>}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontWeight: 400, cursor: 'pointer', flexWrap: 'wrap' }}>
            {info.kind === 'choice' && <input type="radio" checked={draft.mode === 'new'} onChange={() => setDraft(d => ({ ...d, mode: 'new' }))} />}
            {info.kind === 'choice' ? 'Nieuwe klas met de naam' : 'Klasnaam'}
            <input type="text" value={draft.new_name} onFocus={() => setDraft(d => ({ ...d, mode: 'new' }))}
              onChange={e => setDraft(d => ({ ...d, mode: 'new', new_name: e.target.value }))} style={{ width: 200 }} />
          </label>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={confirmChoice}>Verder</button>
          </div>
        </div>
      )}

      {choice && preview && !done && (
        <>
          {preview.no_changes ? (
            <div className="card">
              <div className="alert alert-success">Eigen klas gevonden, geen wijzigingen.</div>
              <Link to="/students" className="btn btn-secondary">Naar Leerlingen</Link>
            </div>
          ) : (
            <>
              <div className="card">
                {choice.mode === 'update' && <p style={{ margin: 0 }}>Dit is jouw klas <strong>{preview.target}</strong>. Vink aan wat je wilt overnemen; aangevinkte dingen vervangen jouw versie. Er wordt nooit iets verwijderd.</p>}
                {choice.mode === 'merge' && <p style={{ margin: 0 }}>Samenvoegen met jouw klas <strong>{preview.target}</strong>. Vink aan wat je wilt overnemen; er wordt nooit iets verwijderd.</p>}
                {choice.mode === 'new' && (
                  <>
                    <p style={{ margin: '0 0 6px' }}>Nieuwe klas <strong>{preview.target}</strong> met alle leerlingen en:</p>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
                      {preview.sessions.map(se => (
                        <li key={se.key}>{se.name} <span className="text-muted">({METHOD_LABELS[se.grading_method] || 'toets'}, {se.graded} resultaten). {rubricNote(se.rubric)}</span></li>
                      ))}
                    </ul>
                  </>
                )}
                {preview.missing.length > 0 && (
                  <p className="text-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Niet in bestand (blijven gewoon staan): {preview.missing.join(', ')}</p>
                )}
              </div>

              {preview.clashes.length > 0 && (
                <div className="card">
                  <h2 style={{ fontSize: 15, marginBottom: 6 }}>Namen bestaan al</h2>
                  <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>Leerlingnamen moeten uniek zijn. Vul een achternaamletter in.</p>
                  {preview.clashes.map(c => (
                    <div key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ minWidth: 140 }}>{c.name}</span>
                      <input type="text" value={letters[c.key] || ''} maxLength={4} placeholder="B" style={{ width: 60 }}
                        onChange={e => setLetters(l => ({ ...l, [c.key]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && applyLetters()} />
                      <span className="text-muted">→ {c.name}{(letters[c.key] || '').trim() ? ` ${letters[c.key].trim()}.` : ' …'}</span>
                    </div>
                  ))}
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={applyLetters}>Doorgaan</button>
                </div>
              )}

              {groups.map(g => (
                <div className="card" key={g.key}>
                  <h2 style={{ fontSize: 15, marginBottom: 2 }}>{g.title}</h2>
                  {g.session && <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>{g.session.exists ? 'Deze toets heb je al bij deze klas.' : rubricNote(g.session.rubric)}</div>}
                  {g.items.map(it => {
                    const on = !!accept?.[it.id]
                    const skipped = it.student && skippedStudents.has(it.student)
                    return (
                      <label key={it.id} className={`ci-item${on && !skipped ? '' : ' off'}`} style={{ cursor: 'pointer', fontWeight: 400 }}>
                        <input type="checkbox" checked={on} disabled={skipped} style={{ marginTop: 3 }}
                          onChange={e => setAccept(a => ({ ...a, [it.id]: e.target.checked }))} />
                        <div style={{ flex: 1 }}>
                          {it.kind === 'link' && <div><strong>{it.name}</strong> is jouw <strong>{it.local_name}</strong> (klas {it.local_class}){!on && <span className="text-muted">: wordt een nieuwe leerling</span>}</div>}
                          {it.kind === 'new' && it.id.startsWith('student:') && <div>Nieuwe leerling: <strong>{it.name}</strong> <RouteBadge route={it.lines?.[0]?.new} /></div>}
                          {it.kind === 'new' && it.id.startsWith('session:') && <div>Nieuwe toets: <strong>{it.name}</strong> <span className="text-muted">({it.graded} resultaten)</span></div>}
                          {it.kind === 'changed' && <div><strong>{it.name}</strong>{skipped && <span className="text-muted"> (leerling wordt niet geïmporteerd)</span>}</div>}
                          {it.kind === 'changed' && <Lines lines={it.lines} />}
                        </div>
                      </label>
                    )
                  })}
                </div>
              ))}
            </>
          )}

          {!preview.no_changes && (
            <div className="gap-8" style={{ marginBottom: 24 }}>
              <button className="btn btn-primary" onClick={doImport} disabled={busy || preview.clashes.length > 0 || (choice.mode !== 'new' && tickCount === 0)}>
                {busy ? 'Bezig…' : 'Importeren'}
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/students')}>Annuleren</button>
              {preview.clashes.length > 0 && <span className="text-muted" style={{ alignSelf: 'center', fontSize: 13 }}>Vul eerst de achternaamletters in.</span>}
            </div>
          )}
        </>
      )}

      {done && (
        <div className="card">
          <div className="alert alert-success">Klas {done.class_name} is geïmporteerd.</div>
          <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 14 }}>
            {done.new_students > 0 && <li>{done.new_students} nieuwe {done.new_students === 1 ? 'leerling' : 'leerlingen'}</li>}
            {done.updated_students > 0 && <li>{done.updated_students} {done.updated_students === 1 ? 'leerling' : 'leerlingen'} bijgewerkt</li>}
            {done.new_sessions > 0 && <li>{done.new_sessions} {done.new_sessions === 1 ? 'toets' : 'toetsen'} toegevoegd</li>}
            {done.new_tests > 0 && <li>{done.new_tests} {done.new_tests === 1 ? 'rubric' : 'rubrics'} toegevoegd aan Toetsen</li>}
            {done.updated_results > 0 && <li>{done.updated_results} resultaten bijgewerkt</li>}
            {done.needs_check > 0 && <li>{done.needs_check} {done.needs_check === 1 ? 'resultaat is' : 'resultaten zijn'} veranderd en staan op "te controleren"</li>}
            {done.skipped_scores > 0 && <li>{done.skipped_scores} scores konden niet geplaatst worden (vraag bestaat niet in jouw rubric)</li>}
          </ul>
          <Link to="/students" className="btn btn-primary">Naar Leerlingen</Link>
        </div>
      )}
    </div>
  )
}
