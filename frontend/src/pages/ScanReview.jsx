import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import MathText from '../components/MathText.jsx'
import BackButton from '../components/BackButton.jsx'
import { readPage } from '../utils/scanReader.js'
import { LEVELS, LEVEL_BY_KEY, allCriteria } from '../utils/opdracht.js'
import {
  NEW, missingOf, isDone, rubricChanges, emptyReadings, createTargetSession, saveStep, existingValues, summarize, counts,
} from '../utils/scanImportLogic.js'

const IMG_WIDTH = 560   // px of the scanned page on screen
const TIP = 'Scan opnieuw, of kijk deze leerling met de hand na.'
const RECT_PX_PER_MM = 5

function dateNL(iso) {
  return iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

function studentsByClass(students) {
  const m = {}
  for (const s of students) (m[s.class_name] ||= []).push(s)
  return Object.entries(m)
    .sort(([a], [b]) => a.localeCompare(b, 'nl', { numeric: true }))
    .map(([c, list]) => [c, [...list].sort((a, b) => a.name.localeCompare(b.name, 'nl'))])
}

function StudentSelect({ value, students, onChange }) {
  const byClass = useMemo(() => studentsByClass(students), [students])
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} data-student-select>
      <option value="">Kies leerling...</option>
      {byClass.map(([c, list]) => (
        <optgroup key={c} label={`Klas ${c}`}>
          {list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

// The stored page image as ImageData, to read the tick boxes again.
function loadRect(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = Math.round(210 * RECT_PX_PER_MM)
      c.height = Math.round(297 * RECT_PX_PER_MM)
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, c.width, c.height)
      resolve(ctx.getImageData(0, 0, c.width, c.height))
    }
    img.onerror = reject
    img.src = url
  })
}

// Importeer scans, step 2: check the read rubrics one leerling at a time.
export default function ScanReview() {
  const { id } = useParams()
  const importId = Number(id)
  const navigate = useNavigate()
  const [state, setState] = useState(null)
  const [created, setCreated] = useState(null)
  const [tests, setTests] = useState({})
  const [allTests, setAllTests] = useState([])
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [existing, setExisting] = useState({})   // `${sid}|${testId}|${studentId}` → { itemId: value }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)         // list of saved nakijkrondes when finished
  const [active, setActive] = useState(null)     // item id with focus, lit up in the scan
  const [showRounds, setShowRounds] = useState(false)

  const studentById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students])

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const [imp, studs, sess, tlist] = await Promise.all([api.getScanImport(importId), api.getStudents(), api.getSessions(), api.getTests()])
        const loaded = {}
        for (const tid of new Set(imp.state.steps.filter(s => s.testId).map(s => s.testId))) {
          try { loaded[tid] = await api.getTest(tid) } catch { /* deleted */ }
        }
        if (off) return
        setStudents(studs)
        setSessions(sess)
        setAllTests(tlist)
        setTests(loaded)
        setCreated(imp.created_at)
        setState(imp.state)
      } catch (e) {
        if (!off) setError(api.errorText(e, 'Deze import bestaat niet meer.'))
      }
    })()
    return () => { off = true }
  }, [importId])

  const steps = state?.steps || []
  const cur = Math.min(state?.cur ?? 0, Math.max(steps.length - 1, 0))
  const step = steps[cur]
  const test = step?.testId ? tests[step.testId] : null
  const student = step?.studentId ? studentById[step.studentId] : null

  // Toets × klas → nakijkronde
  const groupKey = (testId, className) => `${testId}|${className}`
  const optionsFor = (testId, className) => sessions
    .filter(s => s.test_id === testId && s.class_name === className)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const targetOf = (testId, className) => {
    const t = state?.targets?.[groupKey(testId, className)]
    if (t !== undefined) return t
    return optionsFor(testId, className)[0]?.id ?? NEW
  }
  const groups = useMemo(() => {
    const m = new Map()
    for (const s of steps) {
      if (s.kind !== 'rubric' || !s.studentId || !studentById[s.studentId] || !tests[s.testId]) continue
      const c = studentById[s.studentId].class_name
      const k = groupKey(s.testId, c)
      if (!m.has(k)) m.set(k, { key: k, testId: s.testId, className: c, n: 0 })
      m.get(k).n++
    }
    return [...m.values()]
  }, [steps, studentById, tests])

  const targetSid = step?.kind === 'rubric' && student ? targetOf(step.testId, student.class_name) : null
  const existKey = targetSid && targetSid !== NEW ? `${targetSid}|${step.testId}|${step.studentId}` : null

  useEffect(() => {
    if (!existKey || existing[existKey] || !test) return
    const [sid] = existKey.split('|')
    existingValues(Number(sid), test, step.studentId)
      .then(v => setExisting(e => ({ ...e, [existKey]: v })))
      .catch(() => {})
  }, [existKey, test])   // eslint-disable-line react-hooks/exhaustive-deps

  const dupCount = useMemo(() => {
    const m = {}
    for (const s of steps) if (s.kind === 'rubric' && s.studentId && s.status !== 'skipped') m[`${s.testId}|${s.studentId}`] = (m[`${s.testId}|${s.studentId}`] || 0) + 1
    return m
  }, [steps])

  // ── State changes ───────────────────────────────────────────────────────────

  function persist(next) {
    setState(next)
    return api.updateScanImport(importId, {
      summary: summarize(next.steps, tests, studentById), ...counts(next.steps), state: next,
    }).catch(e => setError(api.errorText(e, 'Bewaren van de import mislukt. Controleer de verbinding.')))
  }

  function editStep(fn) {
    setState(s => ({ ...s, steps: s.steps.map((x, i) => (i === cur ? fn(x) : x)) }))
  }

  function setValue(itemId, value) {
    editStep(x => ({ ...x, items: { ...x.items, [itemId]: { ...(x.items[itemId] || {}), value, status: 'ok', reason: null, edited: true } } }))
  }

  function go(next, extra = {}) {
    setError('')
    setActive(null)
    return persist({ ...state, ...extra, cur: next })
  }

  // Next open step after `from`, wrapping around; -1 when everything is done.
  function nextOpen(list, from) {
    for (let k = 1; k <= list.length; k++) {
      const i = (from + k) % list.length
      if (!isDone(list[i])) return i
    }
    return -1
  }

  async function finish(list) {
    const saved = new Map()
    for (const s of list) {
      if (s.status !== 'saved' || !s.sessionId) continue
      const t = tests[s.testId]
      const st = studentById[s.studentId]
      const k = s.sessionId
      if (!saved.has(k)) saved.set(k, { sessionId: k, testName: t?.name ?? 'Toets', className: st?.class_name ?? '', count: 0 })
      saved.get(k).count++
    }
    await api.deleteScanImport(importId)
    setDone([...saved.values()])
  }

  async function advance(list, extra = {}) {
    const n = nextOpen(list, cur)
    if (n === -1) return finish(list)
    return go(n, { steps: list, ...extra })
  }

  async function verder() {
    if (!step || busy) return
    if (step.kind !== 'rubric') return
    if (!student) { setError('Kies eerst de leerling.'); return }
    if (!test) { setError('De toets van dit blad bestaat niet meer. Gebruik Overslaan.'); return }
    if (test.grading_method !== 'opdracht') {
      const over = test.questions.find(q => step.items[q.id]?.value != null && step.items[q.id].value > q.max_score)
      if (over) { setError(`Opgave ${test.questions.indexOf(over) + 1}: het maximum is ${over.max_score}.`); return }
    }
    setBusy(true)
    setError('')
    try {
      let targets = state.targets || {}
      let sid = targetOf(step.testId, student.class_name)
      if (sid === NEW) {
        const s = await createTargetSession(test, student.class_name)
        sid = s.id
        setSessions(list => [...list, { ...s, test_id: test.id, class_name: student.class_name }])
        targets = { ...targets, [groupKey(step.testId, student.class_name)]: sid }
      }
      sid = Number(sid)
      await saveStep(sid, test, step, student)
      setExisting(e => { const n = { ...e }; delete n[`${sid}|${step.testId}|${step.studentId}`]; return n })
      const list = steps.map((x, i) => (i === cur ? { ...x, status: 'saved', sessionId: sid } : x))
      await advance(list, { targets })
    } catch (e) {
      setError(api.errorText(e, 'Opslaan mislukt. Probeer het opnieuw.'))
    } finally {
      setBusy(false)
    }
  }

  function later() {
    const n = nextOpen(steps, cur)
    if (n !== -1 && n !== cur) go(n, { steps })
  }

  async function skip() {
    setBusy(true)
    try { await advance(steps.map((x, i) => (i === cur ? { ...x, status: 'skipped' } : x))) } finally { setBusy(false) }
  }

  function back() {
    if (cur > 0) go(cur - 1, { steps })
  }

  async function changeTarget(g, value) {
    await persist({ ...state, targets: { ...(state.targets || {}), [g.key]: value === NEW ? NEW : Number(value) } })
  }

  // A page without a usable QR code: the teacher says whose it is; read it with
  // the most recent print of that toets for that leerling.
  async function assign(testId, studentId, pageNo) {
    setError('')
    setBusy(true)
    try {
      const t = tests[testId] || await api.getTest(testId)
      const st = studentById[studentId]
      const sheets = await api.getLatestPrintSheets(testId, studentId, st.route)
      const sheet = sheets.find(s => s.page === pageNo) || (sheets.length === 1 ? sheets[0] : null)
      const readings = sheet ? readPage(await loadRect(api.scanPageUrl(importId, step.index)), sheet.layout) : emptyReadings(t, st)
      const page = {
        index: step.index, label: step.label, readings, nameImage: null,
        sheet: sheet
          ? { ...sheet, student_id: studentId }
          : { test_id: testId, student_id: studentId, route: st.route, page: pageNo || 1, pages: 1, layout: { boxes: [], cells: [] } },
      }
      const fallback = sheet ? 'layout' : 'none'
      setTests(x => ({ ...x, [testId]: t }))
      // Another page of the same rubric already in the scan: add this page to it
      const sameIdx = sheet ? steps.findIndex(r => r.kind === 'rubric' && r.testId === testId && r.studentId === studentId && !r.pages.some(q => q.sheet.page === page.sheet.page)) : -1
      let list
      let nextCur = cur
      if (sameIdx >= 0) {
        list = steps.map((r, i) => {
          if (i !== sameIdx) return r
          const pagesNew = [...r.pages, page].sort((a, b) => a.sheet.page - b.sheet.page)
          return { ...r, pages: pagesNew, missingPages: missingOf(pagesNew), items: { ...r.items, ...readings }, fallback, status: 'open' }
        }).filter((_, i) => i !== cur)
        nextCur = sameIdx > cur ? sameIdx - 1 : sameIdx
      } else {
        list = steps.map((r, i) => (i === cur ? {
          kind: 'rubric', key: `m:${step.index}`, testId, route: page.sheet.route ?? st.route, studentId, blank: false,
          pages: [page], missingPages: missingOf([page]), items: readings, fallback, status: 'open',
        } : r))
      }
      await go(nextCur, { steps: list })
    } catch (e) {
      setError(api.errorText(e, 'Deze pagina kon niet gelezen worden.'))
    } finally {
      setBusy(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="page">
        <div className="page-header"><h1>Importeer scans</h1></div>
        <div className="alert alert-success">Alle leerlingen van deze import zijn gecontroleerd. De scans zijn verwijderd.</div>
        <div className="card">
          {done.length === 0 && <div className="text-muted">Er is niets opgeslagen.</div>}
          {done.map(r => (
            <div key={r.sessionId} style={{ padding: '4px 0' }}>
              <Link to={`/reports/session/${r.sessionId}`}>{r.testName} · klas {r.className}</Link>
              <span className="text-muted"> · {r.count} leerling{r.count === 1 ? '' : 'en'}</span>
            </div>
          ))}
          <div className="gap-8" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => navigate('/scans/import')}>Nog een scan importeren</button>
            <button className="btn btn-secondary" onClick={() => navigate('/sessions/new')}>Naar Nakijken</button>
          </div>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="page">
        <BackButton fallback="/sessions/new" />
        {error ? <div className="alert alert-error">{error}</div> : <div className="text-muted">Laden...</div>}
      </div>
    )
  }

  const doneCount = steps.filter(isDone).length
  const isOpdracht = test?.grading_method === 'opdracht'
  const duplicate = step?.kind === 'rubric' && step.studentId && (dupCount[`${step.testId}|${step.studentId}`] || 0) > 1
  const changes = step?.kind === 'rubric' ? rubricChanges(step, test, student) : []
  const pickStudent = step?.kind === 'rubric' && (step.blank || step.lostStudent || !step.studentId)

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <BackButton fallback="/sessions/new" />
      <div className="page-header">
        <div>
          <h1>Scans controleren</h1>
          <div className="text-muted" style={{ marginTop: 4 }}>
            Import van {dateNL(created)} · {doneCount} van {steps.length} gecontroleerd
            {state.emptyPages > 0 && ` · ${state.emptyPages} lege pagina${state.emptyPages === 1 ? '' : "'s"} overgeslagen`}
            {' · '}bewaard bij Lopende sessies, je kunt later verder.
          </div>
        </div>
        {groups.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowRounds(v => !v)}>Nakijkrondes {showRounds ? '▲' : '▼'}</button>
        )}
      </div>

      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, marginBottom: 14 }}>
        <div style={{ height: 6, width: `${(doneCount / Math.max(steps.length, 1)) * 100}%`, background: '#16a34a', borderRadius: 3 }} />
      </div>

      {showRounds && (
        <div className="card">
          <div className="text-muted" style={{ marginBottom: 8 }}>Hier komen de punten terecht als je op Verder klikt.</div>
          {groups.map(g => (
            <div key={g.key} className="form-row" style={{ alignItems: 'center', marginBottom: 6 }}>
              <div style={{ flex: 1 }}><strong>{tests[g.testId].name}</strong> · klas {g.className}</div>
              <select value={targetOf(g.testId, g.className)} onChange={e => changeTarget(g, e.target.value)}>
                {optionsFor(g.testId, g.className).map(s => <option key={s.id} value={s.id}>Nakijkronde van {dateNL(s.created_at)}</option>)}
                <option value={NEW}>Nieuwe nakijkronde</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: the scan */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {step?.kind === 'rubric'
            ? step.pages.map(p => <ScanPage key={p.index} url={api.scanPageUrl(importId, p.index)} page={p} items={step.items} active={active} onValue={setValue} />)
            : step?.hasImage
              ? <img src={api.scanPageUrl(importId, step.index)} alt={step.label} style={{ width: IMG_WIDTH, border: '1px solid #d1d5db' }} />
              : <div className="card text-muted" style={{ width: IMG_WIDTH }}>Geen afbeelding van deze pagina.</div>}
        </div>

        {/* Right: who and the points */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 6 }}>
              Stap {cur + 1} van {steps.length}{step?.status === 'saved' && ' · al opgeslagen, Verder slaat je wijzigingen op'}{step?.status === 'skipped' && ' · overgeslagen'}
            </div>

            {step?.kind === 'rubric' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {pickStudent ? (
                    <>
                      {step.pages[0].nameImage && <img src={step.pages[0].nameImage} alt="Handgeschreven naam" style={{ height: 38, border: '1px solid #e5e7eb', borderRadius: 4 }} />}
                      <StudentSelect value={step.studentId} students={students} onChange={sid => editStep(x => ({ ...x, studentId: sid }))} />
                    </>
                  ) : (
                    <strong style={{ fontSize: 18 }}>{student?.name ?? 'Onbekende leerling'}</strong>
                  )}
                  {step.route && <RouteBadge route={step.route} />}
                </div>
                <div className="text-muted" style={{ marginTop: 2 }}>
                  {test?.name ?? 'Toets bestaat niet meer'}{student && ` · klas ${student.class_name}`}
                  {step.pages.length > 1 && ` · ${step.pages.length} bladen`}
                </div>
                <StepWarnings step={step} student={student} duplicate={duplicate} changes={changes} />
                {test && (isOpdracht
                  ? <LevelRows test={test} step={step} existing={existing[existKey]} onValue={setValue} onActive={setActive} onDone={verder} curKey={step.key} />
                  : <PointRows test={test} step={step} student={student} existing={existing[existKey]} onValue={setValue} onActive={setActive} onDone={verder} curKey={step.key} />)}
              </>
            )}

            {step?.kind === 'assign' && (
              <>
                <div style={{ marginBottom: 8 }}><strong>{step.label}</strong>: {step.error}</div>
                <AssignPage key={step.key} tests={allTests} students={students} busy={busy} onRead={assign} />
              </>
            )}

            {step?.kind === 'failed' && (
              <>
                <div style={{ marginBottom: 8 }}><strong>{step.label}</strong>: {step.error}</div>
                <div className="text-muted">{TIP} Klik op Overslaan om verder te gaan.</div>
              </>
            )}
          </div>

          <div className="gap-8" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={back} disabled={cur === 0 || busy}>← Terug</button>
            <button className="btn btn-secondary" onClick={later} disabled={busy || steps.filter(s => !isDone(s)).length < 2} title="Deze stap blijft open en komt aan het eind terug">Later</button>
            <button className="btn btn-secondary" onClick={skip} disabled={busy} title="Niet opslaan; de stap telt als gecontroleerd">Overslaan</button>
            {step?.kind === 'rubric' && (
              <button className="btn btn-primary" onClick={verder} disabled={busy || !step.studentId} data-verder>
                {busy ? 'Opslaan...' : 'Verder →'}
              </button>
            )}
          </div>

          <StepList steps={steps} cur={cur} tests={tests} studentById={studentById} onPick={i => go(i, { steps })} />
        </div>
      </div>
    </div>
  )
}

function StepWarnings({ step, student, duplicate, changes }) {
  const routeMismatch = student && step.route && student.route !== step.route
  const lines = []
  if (step.lostStudent && !step.studentId) lines.push('De leerling van dit blad bestaat niet meer in Rubricmaker. Kies de leerling.')
  if (step.blank && !step.studentId) lines.push('Blanco blad: kies de leerling.')
  if (duplicate) lines.push('Deze leerling staat er twee keer in voor deze toets. Wat je het laatst opslaat telt; gebruik Overslaan voor het verkeerde blad.')
  if (step.duplicatePage) lines.push('Een blad van deze leerling is twee keer gescand; de laatste is gebruikt.')
  if (step.missingPages?.length) lines.push(`Blad ${step.missingPages.join(', ')} ontbreekt in de scan.`)
  if (routeMismatch) lines.push(`Dit blad is voor route ${step.route}, de leerling heeft nu route ${student.route}. Alleen de opgaven van route ${student.route} worden opgeslagen.`)
  if (step.fallback === 'layout') lines.push('De QR-code was niet te gebruiken: gelezen met de laatst geprinte indeling. Kijk of de kaders op de hokjes vallen.')
  if (step.fallback === 'none') lines.push('Geen geprinte indeling gevonden: vul de punten zelf in, de scan staat ernaast.')
  lines.push(...changes)
  if (!lines.length) return null
  return (
    <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}

const ROW_STYLE = status => ({
  borderBottom: '1px solid #eef0f4',
  background: status === 'check' || status === 'empty' ? '#fff7ed' : undefined,
})

// Toets: one number field per opgave. Type a digit or use ↑/↓; Enter or Tab goes to
// the next opgave, Enter on the last one is Verder.
function PointRows({ test, step, student, existing, onValue, onActive, onDone, curKey }) {
  const refs = useRef([])
  const route = student?.route ?? step.route
  const rows = test.questions
    .map((q, i) => ({ q, n: i + 1 }))
    .filter(({ q }) => step.items[q.id] || (step.fallback === 'none' && (q.routes || []).includes(route)))
    .filter(({ q }) => !route || (q.routes || []).includes(route))
  useEffect(() => {
    const t = setTimeout(() => { refs.current[0]?.focus(); refs.current[0]?.select() }, 50)
    return () => clearTimeout(t)
  }, [curKey])
  const total = rows.reduce((n, { q }) => n + (step.items[q.id]?.value ?? 0), 0)
  const max = rows.reduce((n, { q }) => n + q.max_score, 0)
  return (
    <>
      <table style={{ width: '100%', fontSize: 14, marginTop: 12 }}>
        <tbody>
          {rows.map(({ q, n }, i) => {
            const it = step.items[q.id] || { value: null, status: 'empty' }
            const over = it.value != null && it.value > q.max_score
            const status = over ? 'check' : it.edited ? 'ok' : it.status
            const now = existing?.[q.id]
            return (
              <tr key={q.id} data-item={q.id} data-status={status} style={ROW_STYLE(status)}>
                <td style={{ padding: '6px 6px', width: 30, color: '#6b7280' }}>{n}</td>
                <td style={{ padding: '6px 4px' }}>
                  <MathText text={q.description} />
                  {it.reason && status !== 'ok' && <div style={{ fontSize: 11, color: '#9a3412' }}>{it.reason}</div>}
                  {over && <div style={{ fontSize: 11, color: '#9a3412' }}>Hoger dan het maximum</div>}
                </td>
                <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                  <input
                    ref={el => { refs.current[i] = el }}
                    type="number" min={0} max={q.max_score} step={1}
                    className="grade-score-input"
                    style={{ width: 64, fontSize: 18, padding: '4px 6px' }}
                    value={it.value ?? ''}
                    onFocus={e => { e.target.select(); onActive(String(q.id)) }}
                    onChange={e => {
                      const v = e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value)))
                      onValue(q.id, v)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && i < rows.length - 1)) {
                        e.preventDefault()
                        if (i < rows.length - 1) { refs.current[i + 1]?.focus() } else onDone()
                      }
                    }}
                  />
                  <span className="text-muted"> / {q.max_score}</span>
                </td>
                <td style={{ padding: '6px 4px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {now !== undefined && now !== it.value && <span title="Al ingevuld in de nakijkronde">nu: {now}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontWeight: 600 }}>Totaal {total} / {max}</div>
    </>
  )
}

// Grote opdracht: Niet / Voldoende / Goed per criterium. ↑/↓ changes the level,
// Enter goes to the next criterium, Enter on the last one is Verder.
function LevelRows({ test, step, existing, onValue, onActive, onDone, curKey }) {
  const refs = useRef([])
  const rows = allCriteria(test).filter(({ criterion }) => step.items[criterion.id] || step.fallback === 'none')
  useEffect(() => {
    const t = setTimeout(() => refs.current[0]?.focus(), 50)
    return () => clearTimeout(t)
  }, [curKey])
  return (
    <div style={{ marginTop: 12 }}>
      {rows.map(({ criterion }, i) => {
        const it = step.items[criterion.id] || { value: null, status: 'empty' }
        const status = it.edited ? 'ok' : it.status
        const idx = LEVELS.findIndex(l => l.key === it.value)
        const now = existing?.[criterion.id]
        return (
          <div key={criterion.id} ref={el => { refs.current[i] = el }} tabIndex={0} data-item={criterion.id} data-status={status}
            onFocus={() => onActive(String(criterion.id))}
            onKeyDown={e => {
              if (e.key === 'ArrowUp') { e.preventDefault(); onValue(criterion.id, LEVELS[Math.min(LEVELS.length - 1, idx + 1)].key) }
              if (e.key === 'ArrowDown') { e.preventDefault(); onValue(criterion.id, LEVELS[Math.max(0, idx < 0 ? 0 : idx - 1)].key) }
              if (e.key === 'Enter') { e.preventDefault(); if (i < rows.length - 1) refs.current[i + 1]?.focus(); else onDone() }
            }}
            style={{ ...ROW_STYLE(status), padding: '8px 6px', outlineOffset: 2, borderRadius: 4 }}>
            <div style={{ marginBottom: 6 }}>
              <MathText text={criterion.name} />
              {it.reason && status !== 'ok' && <span style={{ fontSize: 11, color: '#9a3412' }}> · {it.reason}</span>}
              {now && now !== it.value && <span style={{ fontSize: 12, color: '#6b7280' }}> · nu: {LEVEL_BY_KEY[now]?.label}</span>}
            </div>
            <div className="gap-8">
              {LEVELS.map(l => (
                <button key={l.key} type="button" tabIndex={-1} className="btn btn-sm"
                  onClick={() => onValue(criterion.id, it.value === l.key ? null : l.key)}
                  style={{ background: it.value === l.key ? l.bg : '#fff', color: l.color, border: `2px solid ${it.value === l.key ? l.color : l.border}`, fontWeight: it.value === l.key ? 700 : 500 }}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// All steps, to jump to one. Green = stored, grey = skipped.
function StepList({ steps, cur, tests, studentById, onPick }) {
  return (
    <div className="card" style={{ marginTop: 14, padding: 10, maxHeight: 260, overflowY: 'auto' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Alle stappen</div>
      {steps.map((s, i) => {
        const name = s.kind === 'rubric'
          ? `${s.studentId ? (studentById[s.studentId]?.name ?? 'Onbekend') : 'Leerling kiezen'} · ${tests[s.testId]?.name ?? ''}`
          : `${s.label} · ${s.kind === 'assign' ? 'QR onleesbaar' : 'niet gelezen'}`
        const colour = s.status === 'saved' ? '#16a34a' : s.status === 'skipped' ? '#9ca3af' : '#f59e0b'
        return (
          <button key={s.key} type="button" onClick={() => onPick(i)} data-step={i}
            style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', padding: '3px 4px', border: 'none', borderRadius: 4, cursor: 'pointer', background: i === cur ? '#eef2ff' : 'transparent', fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: colour, flex: 'none' }} />
            {name}
          </button>
        )
      })}
    </div>
  )
}

// Link a page without a usable QR code to a toets and leerling.
function AssignPage({ tests, students, busy, onRead }) {
  const [testId, setTestId] = useState('')
  const [studentId, setStudentId] = useState(null)
  const [pageNo, setPageNo] = useState(1)
  const sorted = useMemo(() => [...tests].sort((a, b) => a.name.localeCompare(b.name, 'nl', { numeric: true })), [tests])
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} data-assign>
      <select value={testId} onChange={e => setTestId(e.target.value)}>
        <option value="">Kies toets...</option>
        {sorted.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <StudentSelect value={studentId} students={students} onChange={setStudentId} />
      <label className="text-muted" title="Alleen nodig als de rubric meer dan één blad heeft">
        Blad <input type="number" min={1} max={9} value={pageNo} onChange={e => setPageNo(Math.max(1, Number(e.target.value) || 1))} style={{ width: 50 }} />
      </label>
      <button className="btn btn-primary btn-sm" disabled={!testId || !studentId || busy} onClick={() => onRead(Number(testId), studentId, pageNo)}>
        Lezen
      </button>
      <div className="text-muted" style={{ width: '100%', fontSize: 12 }}>Lukt het niet? {TIP}</div>
    </div>
  )
}

// Straightened scan with the tick boxes drawn on top; click a box to choose it.
// The opgave or criterium with focus is outlined in blue.
function ScanPage({ url, page, items, active, onValue }) {
  const k = IMG_WIDTH / 210
  const { boxes = [], cells = [] } = page.sheet.layout
  const targets = cells.length > 0 ? cells : boxes
  const rowsOf = {}
  for (const [key, x, y, w, h] of targets) {
    const id = key.split(':')[1]
    const r = rowsOf[id] ||= { x0: x, y0: y, x1: x + w, y1: y + h }
    r.x0 = Math.min(r.x0, x); r.y0 = Math.min(r.y0, y); r.x1 = Math.max(r.x1, x + w); r.y1 = Math.max(r.y1, y + h)
  }
  const act = active && rowsOf[active]
  return (
    <div style={{ position: 'relative', width: IMG_WIDTH, border: '1px solid #d1d5db', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
      <img src={url} alt={page.label} style={{ width: IMG_WIDTH, display: 'block' }} />
      {act && (
        <div style={{ position: 'absolute', left: act.x0 * k - 6, top: act.y0 * k - 5, width: (act.x1 - act.x0) * k + 12, height: (act.y1 - act.y0) * k + 10, border: '2px solid #2563eb', borderRadius: 5, pointerEvents: 'none' }} />
      )}
      {targets.map(([key, x, y, w, h]) => {
        const [kind, id, opt] = key.split(':')
        const it = items[id]
        if (!it) return null
        const value = kind === 'q' ? parseInt(opt) : opt
        const chosen = it.value === value
        const warn = it.status !== 'ok' && !it.edited
        const colour = kind === 'c' ? LEVEL_BY_KEY[opt]?.color : '#16a34a'
        return (
          <button key={key} type="button" tabIndex={-1} title={chosen ? 'Klik om leeg te maken' : 'Klik om dit te kiezen'}
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
