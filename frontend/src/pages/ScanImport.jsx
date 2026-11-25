import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import MathText from '../components/MathText.jsx'
import BackButton from '../components/BackButton.jsx'
import { openScan, analyzePage, readPage, rectToDataUrl } from '../utils/scanReader.js'
import { groupPages, openItems } from '../utils/scanGroups.js'
import { computeGrade, withSessionRoutes } from '../utils/gradingLogic.js'
import { LEVELS, LEVEL_BY_KEY, allCriteria, partOf, partsPresent } from '../utils/opdracht.js'

const NEW = 'new'
const IMG_WIDTH = 520   // px of the scanned page on screen
const STATUS_STYLE = {
  ok: { background: '#dcfce7', color: '#166534' },
  check: { background: '#ffedd5', color: '#9a3412' },
  empty: { background: '#fee2e2', color: '#991b1b' },
}
const STATUS_TEXT = { ok: 'Herkend', check: 'Controleren', empty: 'Leeg' }

function dateNL(iso) {
  return iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// Importeer scans: read a PDF (or photos) of rubrics printed with Print rubric,
// let the teacher check every rubric, then store the points.
export default function ScanImport() {
  const [phase, setPhase] = useState('pick')   // pick | reading | check | saving | done
  const [progress, setProgress] = useState(null)
  const [failed, setFailed] = useState([])     // pages that could not be read
  const [rubrics, setRubrics] = useState([])
  const [tests, setTests] = useState({})
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [targets, setTargets] = useState({})   // `${testId}|${class}` → session id | NEW
  const [overwrite, setOverwrite] = useState(false)
  const [open, setOpen] = useState(new Set())
  const [error, setError] = useState('')
  const [result, setResult] = useState([])
  const fileRef = useRef(null)

  const studentById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students])

  async function readFiles(files) {
    setError('')
    setPhase('reading')
    const pages = []
    const bad = []
    const sheetCache = {}
    let index = 0
    try {
      const [studs, sess] = await Promise.all([api.getStudents(), api.getSessions()])
      setStudents(studs)
      setSessions(sess)
      for (const file of files) {
        const scan = await openScan(file)
        for (let n = 1; n <= scan.pages; n++) {
          index++
          setProgress({ file: file.name, page: n, pages: scan.pages })
          await new Promise(r => setTimeout(r, 0))   // let the progress text show
          const label = files.length > 1 ? `${file.name}, pagina ${n}` : `Pagina ${n}`
          try {
            const canvas = await scan.render(n)
            const res = analyzePage(canvas)
            if (res.error) {
              bad.push({ label, error: res.error, image: canvas.toDataURL('image/jpeg', 0.5) })
              continue
            }
            if (!(res.sheetId in sheetCache)) {
              const [sheet] = await api.getPrintSheets([res.sheetId])
              sheetCache[res.sheetId] = sheet || null
            }
            const sheet = sheetCache[res.sheetId]
            if (!sheet) {
              bad.push({ label, error: 'Dit blad is niet met deze Rubricmaker geprint.', image: canvas.toDataURL('image/jpeg', 0.5) })
              continue
            }
            pages.push({
              index, label, sheet,
              readings: readPage(res.rect, sheet.layout),
              image: rectToDataUrl(res.rect),
              nameImage: sheet.student_id == null && sheet.layout.name ? rectToDataUrl(res.rect, sheet.layout.name, 0.8) : null,
            })
          } catch {
            bad.push({ label, error: 'Deze pagina kon niet gelezen worden.' })
          }
        }
        scan.close?.()
      }
      const testIds = [...new Set(pages.map(p => p.sheet.test_id))]
      const loaded = {}
      for (const id of testIds) {
        try { loaded[id] = await api.getTest(id) } catch { /* deleted toets: shown as unknown */ }
      }
      const groups = groupPages(pages)
        .filter(r => loaded[r.testId])
        .map(r => ({ ...r, approved: !r.blank && openItems(r).length === 0 && !r.missingPages.length }))
      for (const p of pages) if (!loaded[p.sheet.test_id]) bad.push({ label: p.label, error: 'De toets van dit blad bestaat niet meer.' })
      setTests(loaded)
      setRubrics(groups)
      setFailed(bad)
      setOpen(new Set(groups.filter(r => !r.approved).map(r => r.key)))
      setPhase('check')
    } catch (e) {
      setError(api.errorText(e, 'Lezen van de scan mislukt.'))
      setPhase('pick')
    } finally {
      setProgress(null)
    }
  }

  function update(key, fn) {
    setRubrics(rs => rs.map(r => (r.key === key ? fn(r) : r)))
  }

  function setValue(key, itemId, value) {
    update(key, r => ({ ...r, items: { ...r.items, [itemId]: { ...r.items[itemId], value, status: 'ok', reason: null, edited: true } } }))
  }

  function toggleOpen(key) {
    setOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // Where each toets × klas is stored
  const saveGroups = useMemo(() => {
    const map = new Map()
    for (const r of rubrics) {
      if (!r.approved || !r.studentId) continue
      const st = studentById[r.studentId]
      if (!st) continue
      const k = `${r.testId}|${st.class_name}`
      if (!map.has(k)) {
        const options = sessions
          .filter(s => s.test_id === r.testId && s.class_name === st.class_name)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        map.set(k, { key: k, testId: r.testId, className: st.class_name, options, rubrics: [] })
      }
      map.get(k).rubrics.push(r)
    }
    return [...map.values()]
  }, [rubrics, sessions, studentById])

  const targetOf = g => targets[g.key] ?? (g.options[0]?.id ?? NEW)
  const approvedCount = saveGroups.reduce((n, g) => n + g.rubrics.length, 0)

  async function save() {
    setError('')
    setPhase('saving')
    const done = []
    try {
      for (const g of saveGroups) {
        const test = tests[g.testId]
        let sid = targetOf(g)
        if (sid === NEW) {
          const s = await api.createSession({ test_id: g.testId, class_name: g.className, grading_mode: 'vertical' })
          sid = s.id
          if (test.grading_method === 'opdracht') {
            const parts = partsPresent(test)
            await api.setOpdrachtState(sid, { mode: parts.length === 2 ? 'samen' : parts[0] })
          }
        } else sid = Number(sid)
        const count = test.grading_method === 'opdracht'
          ? await saveOpdracht(sid, test, g.rubrics)
          : await saveToets(sid, test, g.rubrics)
        done.push({ sessionId: sid, testName: test.name, className: g.className, count })
      }
      setResult(done)
      setPhase('done')
    } catch (e) {
      setError(api.errorText(e, 'Opslaan mislukt. Wat al was opgeslagen blijft staan; je kunt het opnieuw proberen.'))
      setResult(done)
      setPhase('check')
    }
  }

  async function saveToets(sid, test, list) {
    const [session, scores, grades] = await Promise.all([api.getSession(sid), api.getSessionScores(sid), api.getSessionGrades(sid)])
    const scoreMap = {}
    for (const s of scores) scoreMap[`${s.question_id}-${s.student_id}`] = s
    const order = [...(session.student_order || [])]
    for (const r of list) {
      const [student] = withSessionRoutes([studentById[r.studentId]], session)
      for (const q of test.questions) {
        const k = `${q.id}-${student.id}`
        const prev = scoreMap[k]
        if ((q.routes || []).includes(student.route)) {
          const read = r.items[q.id]
          if (!read || read.value === null || read.value === undefined) continue
          if (prev && prev.points !== null && !prev.excluded && !overwrite) continue
          if (read.value > q.max_score) continue
          scoreMap[k] = await api.upsertScore({
            session_id: sid, student_id: student.id, question_id: q.id,
            points: read.value, excluded: false, comment: prev?.comment ?? null,
          })
        } else if (!prev) {
          scoreMap[k] = await api.upsertScore({
            session_id: sid, student_id: student.id, question_id: q.id, points: null, excluded: true, comment: null,
          })
        }
      }
      const old = grades.find(g => g.student_id === student.id)
      if (test.grading_method && !(old?.is_manual)) {
        const grade = computeGrade(student, test.questions, scoreMap, test.grading_method, test.grade_config, old?.stars || 0)
        if (grade != null) {
          await api.upsertStudentGrade(sid, student.id, {
            grade, is_manual: false, review_done: true, stars: test.grading_method === 'cijfer' ? (old?.stars || 0) : 0,
          })
        }
      }
      if (!order.includes(student.id)) order.push(student.id)
    }
    await api.setSessionOrder(sid, { student_order: order })
    return list.length
  }

  async function saveOpdracht(sid, test, list) {
    let data = await api.getOpdrachtSession(sid)
    const crits = allCriteria(test)
    for (const r of list) {
      const summ = data.summaries?.[String(r.studentId)]
      for (const part of ['groep', 'individueel']) {
        const read = crits.filter(({ section, criterion }) => partOf(section) === part && r.items[criterion.id]?.value)
        if (!read.length) continue
        const status = summ?.parts?.[part]?.status
        if (!status || status === 'none' || status === 'missing') {
          data = await api.setOpdrachtEntry(sid, r.studentId, part)
        }
        for (const { criterion } of read) {
          const has = data.summaries?.[String(r.studentId)]?.effective?.[criterion.id]?.level
          if (has && !overwrite) continue
          data = await api.setOpdrachtLevel(sid, { criterion_id: criterion.id, student_id: r.studentId, level: r.items[criterion.id].value })
        }
      }
    }
    return list.length
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === 'pick' || phase === 'reading') {
    return (
      <div className="page">
        <BackButton fallback="/tests" />
        <div className="page-header"><h1>Importeer scans</h1></div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="card">
          <p style={{ marginBottom: 12 }}>
            Scan de ingevulde rubrics (geprint met <strong>Print rubric</strong>) en kies hier de PDF. Meerdere leerlingen en
            toetsen in één PDF mag, de volgorde maakt niet uit. Foto's van de bladen werken ook, als alle vier de zwarte hoekjes erop staan.
          </p>
          <p className="text-muted" style={{ marginBottom: 12 }}>
            De scan wordt op deze computer gelezen. Daarna controleer je elke rubric voordat er iets wordt opgeslagen.
          </p>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*" multiple style={{ display: 'none' }}
            onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) readFiles(f) }} />
          <button className="btn btn-primary" disabled={phase === 'reading'} onClick={() => fileRef.current?.click()}>
            {phase === 'reading' ? 'Bezig met lezen...' : 'Kies PDF of foto\'s'}
          </button>
          {progress && (
            <span className="text-muted" style={{ marginLeft: 12 }}>
              Pagina {progress.page} van {progress.pages} lezen{progress.file ? ` (${progress.file})` : ''}...
            </span>
          )}
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="page">
        <div className="page-header"><h1>Importeer scans</h1></div>
        <div className="alert alert-success">De punten zijn opgeslagen.</div>
        <div className="card">
          {result.map(r => (
            <div key={r.sessionId} style={{ padding: '4px 0' }}>
              <Link to={`/reports/session/${r.sessionId}`}>{r.testName} · klas {r.className}</Link>
              <span className="text-muted"> · {r.count} leerling{r.count === 1 ? '' : 'en'}</span>
            </div>
          ))}
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => { setPhase('pick'); setRubrics([]); setFailed([]) }}>
            Nog een scan importeren
          </button>
        </div>
      </div>
    )
  }

  const toCheck = rubrics.filter(r => !r.approved).length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Importeer scans: controleren</h1>
          <div className="text-muted" style={{ marginTop: 4 }}>
            {rubrics.length} rubric{rubrics.length === 1 ? '' : 's'} gevonden{toCheck > 0 && `, ${toCheck} nog niet goedgekeurd`}.
            Klik op een hokje in de scan of kies hiernaast om iets te verbeteren.
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => { setPhase('pick'); setRubrics([]); setFailed([]) }}>Andere scan</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {failed.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>{failed.length} pagina{failed.length === 1 ? '' : "'s"} niet gelezen</strong>
          {failed.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
              {f.image && <img src={f.image} alt="" style={{ width: 60, border: '1px solid #e5e7eb' }} />}
              <div><strong>{f.label}</strong>: {f.error}</div>
            </div>
          ))}
        </div>
      )}

      {rubrics.map(r => (
        <RubricCard key={r.key} rubric={r} test={tests[r.testId]} students={students} studentById={studentById}
          open={open.has(r.key)} onToggle={() => toggleOpen(r.key)}
          onValue={(itemId, v) => setValue(r.key, itemId, v)}
          onStudent={sid => update(r.key, x => ({ ...x, studentId: sid }))}
          onApprove={v => update(r.key, x => ({ ...x, approved: v }))} />
      ))}

      {rubrics.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Opslaan</h2>
          {saveGroups.length === 0 && <div className="text-muted">Keur eerst rubrics goed (en kies bij blanco bladen de leerling).</div>}
          {saveGroups.map(g => (
            <div key={g.key} className="form-row" style={{ alignItems: 'center', marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <strong>{tests[g.testId].name}</strong> · klas {g.className}
                <span className="text-muted"> · {g.rubrics.length} leerling{g.rubrics.length === 1 ? '' : 'en'}</span>
              </div>
              <select value={targetOf(g)} onChange={e => setTargets(t => ({ ...t, [g.key]: e.target.value }))}>
                {g.options.map(s => <option key={s.id} value={s.id}>Bij nakijkronde van {dateNL(s.created_at)}</option>)}
                <option value={NEW}>Nieuwe nakijkronde</option>
              </select>
            </div>
          ))}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
            <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
            Punten die al zijn ingevuld overschrijven
          </label>
          <button className="btn btn-primary" disabled={!approvedCount || phase === 'saving'} onClick={save}>
            {phase === 'saving' ? 'Opslaan...' : `Opslaan (${approvedCount} rubric${approvedCount === 1 ? '' : 's'})`}
          </button>
          {toCheck > 0 && approvedCount > 0 && (
            <span className="text-muted" style={{ marginLeft: 12 }}>Rubrics die niet zijn goedgekeurd worden niet opgeslagen.</span>
          )}
        </div>
      )}
    </div>
  )
}

function RubricCard({ rubric: r, test, students, studentById, open, onToggle, onValue, onStudent, onApprove }) {
  const isOpdracht = test.grading_method === 'opdracht'
  const student = r.studentId ? studentById[r.studentId] : null
  const todo = openItems(r)
  const rows = isOpdracht
    ? allCriteria(test).filter(({ criterion }) => r.items[criterion.id]).map(({ criterion }) => ({ id: criterion.id, label: criterion.name, opts: LEVELS.map(l => ({ value: l.key, label: l.label })) }))
    : test.questions.filter(q => r.items[q.id]).map(q => ({ id: q.id, label: q.description, max: q.max_score, opts: Array.from({ length: q.max_score + 1 }, (_, p) => ({ value: p, label: String(p) })) }))
  const total = isOpdracht ? null : rows.reduce((n, row) => n + (r.items[row.id].value ?? 0), 0)
  const max = isOpdracht ? null : rows.reduce((n, row) => n + row.max, 0)
  const byClass = useMemo(() => {
    const m = {}
    for (const s of students) (m[s.class_name] ||= []).push(s)
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b, 'nl', { numeric: true }))
  }, [students])
  const routeMismatch = student && r.route && student.route !== r.route

  return (
    <div className="card" data-rubric={r.key} style={{ borderLeft: `4px solid ${r.approved ? '#16a34a' : '#f59e0b'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onToggle} aria-expanded={open}>{open ? '▼' : '▶'}</button>
        <div style={{ flex: 1, minWidth: 220 }}>
          {r.blank ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {r.pages[0].nameImage && <img src={r.pages[0].nameImage} alt="Handgeschreven naam" style={{ height: 34, border: '1px solid #e5e7eb', borderRadius: 4 }} />}
              <select value={r.studentId ?? ''} onChange={e => onStudent(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Kies leerling...</option>
                {byClass.map(([c, list]) => (
                  <optgroup key={c} label={`Klas ${c}`}>
                    {[...list].sort((a, b) => a.name.localeCompare(b.name, 'nl')).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : (
            <strong style={{ fontSize: 15 }}>{student?.name ?? 'Onbekende leerling'}</strong>
          )}
          <div className="text-muted" style={{ marginTop: 2 }}>
            {test.name}{student && ` · klas ${student.class_name}`}
            {!isOpdracht && ` · ${total}/${max} punten`}
            {r.pages.length > 1 && ` · ${r.pages.length} bladen`}
          </div>
        </div>
        {r.route && <RouteBadge route={r.route} />}
        {todo.length > 0
          ? <span className="test-tag" style={STATUS_STYLE.check}>{todo.length} controleren</span>
          : <span className="test-tag" style={STATUS_STYLE.ok}>Alles herkend</span>}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}>
          <input type="checkbox" checked={r.approved} disabled={!r.studentId} onChange={e => onApprove(e.target.checked)} />
          Goedgekeurd
        </label>
      </div>

      {(r.missingPages.length > 0 || r.duplicate || routeMismatch) && (
        <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>
          {r.missingPages.length > 0 && <div>Blad {r.missingPages.join(', ')} ontbreekt in de scan.</div>}
          {r.duplicate && <div>Een blad van deze leerling is twee keer gescand; de laatste is gebruikt.</div>}
          {routeMismatch && <div>Dit blad is voor route {r.route}, de leerling heeft nu route {student.route}. Alleen de opgaven van route {student.route} worden opgeslagen.</div>}
        </div>
      )}

      {open && (
        <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r.pages.map(p => <ScanPage key={p.index} page={p} items={r.items} onValue={onValue} />)}
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <tbody>
                {rows.map(row => {
                  const it = r.items[row.id]
                  return (
                    <tr key={row.id} data-item={row.id} data-status={it.status} style={{ borderBottom: '1px solid #eef0f4' }}>
                      <td style={{ padding: '6px 4px' }}>
                        <MathText text={row.label} />
                        {it.reason && it.status !== 'ok' && <div style={{ fontSize: 11, color: '#9a3412' }}>{it.reason}</div>}
                      </td>
                      <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                        <select value={it.value ?? ''} onChange={e => onValue(row.id, e.target.value === '' ? null : (isOpdracht ? e.target.value : Number(e.target.value)))}>
                          <option value="">—</option>
                          {row.opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {!isOpdracht && <span className="text-muted"> / {row.max}</span>}
                      </td>
                      <td style={{ padding: '6px 4px' }}>
                        <span className="test-tag" style={{ ...STATUS_STYLE[it.status], marginLeft: 0 }}>{it.edited ? 'Aangepast' : STATUS_TEXT[it.status]}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Straightened scan with the tick boxes drawn on top; click a box to choose it.
function ScanPage({ page, items, onValue }) {
  const k = IMG_WIDTH / 210
  const { boxes = [], cells = [] } = page.sheet.layout
  const hasCells = cells.length > 0
  const targets = hasCells ? cells : boxes
  return (
    <div style={{ position: 'relative', width: IMG_WIDTH, border: '1px solid #d1d5db', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
      <img src={page.image} alt={page.label} style={{ width: IMG_WIDTH, display: 'block' }} />
      {targets.map(([key, x, y, w, h]) => {
        const [kind, id, opt] = key.split(':')
        const it = items[id]
        if (!it) return null
        const value = kind === 'q' ? parseInt(opt) : opt
        const chosen = it.value === value
        const warn = it.status !== 'ok'
        const colour = kind === 'c' ? LEVEL_BY_KEY[opt]?.color : '#16a34a'
        return (
          <button key={key} type="button" title={chosen ? 'Klik om leeg te maken' : 'Klik om dit te kiezen'}
            onClick={() => onValue(id, chosen ? null : value)}
            style={{
              position: 'absolute', left: x * k - 2, top: y * k - 2, width: w * k + 4, height: h * k + 4, padding: 0,
              border: chosen ? `3px solid ${colour}` : warn ? '2px dashed #f59e0b' : '1px solid transparent',
              background: chosen ? 'rgba(22,163,74,0.12)' : 'transparent', borderRadius: 3, cursor: 'pointer',
            }} />
        )
      })}
    </div>
  )
}
