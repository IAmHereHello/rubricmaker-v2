import { useEffect, useRef, useState } from 'react'
import * as api from '../api.js'
import RouteBadge from './RouteBadge.jsx'
import { BlankToetsRubric, BlankOpdrachtRubric, routesInUse } from './BlankRubric.jsx'
import { exportSheetsPDF } from '../utils/printSheets.js'
import { ROUTES } from '../utils/opdracht.js'
import { safeFileName } from '../utils/shareFiles.js'

const BLANK = '__blank__'

// "Print rubric" (⋮ menu at Toetsen): one PDF to fill in on paper, either one
// rubric per leerling of a klas (name printed) or blank sheets per route.
// Every page carries corner markers and a QR code so the scan can be imported.
export default function BlankRubricDialog({ testId, onClose }) {
  const [test, setTest] = useState(null)
  const [routes, setRoutes] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [classes, setClasses] = useState([])
  const [allStudents, setAllStudents] = useState([])
  const [who, setWho] = useState(BLANK)   // class name or BLANK
  const [showAnswers, setShowAnswers] = useState(false)
  const [showGoals, setShowGoals] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)
  const [items, setItems] = useState(null)   // [{ key, route, student }] being rendered off-screen
  const refs = useRef({})

  useEffect(() => {
    Promise.all([api.getTest(testId), api.getStudents()])
      .then(([t, studs]) => {
        const inUse = routesInUse(t, ROUTES)
        setTest(t)
        setRoutes(inUse)
        setPicked(new Set(inUse))
        setAllStudents(studs)
        const names = [...new Set(studs.map(s => s.class_name))].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }))
        setClasses(names)
      })
      .catch(e => setError(api.errorText(e, 'Laden mislukt.')))
  }, [testId])

  const isOpdracht = test?.grading_method === 'opdracht'
  const empty = test && (isOpdracht ? routes.length === 0 : !(test.questions || []).length)
  const blank = who === BLANK
  const classStudents = blank ? [] : allStudents
    .filter(s => s.class_name === who)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  const busy = items !== null

  useEffect(() => {
    if (!items) return
    const timer = setTimeout(async () => {
      try {
        const suffix = blank ? 'blanco' : who
        await exportSheetsPDF({
          items: items.map(it => ({ element: refs.current[it.key]?.firstElementChild, student_id: it.student?.id, route: it.route })),
          filename: `${safeFileName(`${test.name} - ${suffix}`)}.pdf`,
          saveSheets: sheets => api.savePrintSheets(test.id, sheets),
          onProgress: (done, total) => setProgress({ done, total }),
        })
        onClose()
      } catch (e) {
        setError(api.errorText(e, 'PDF maken mislukt.'))
        setItems(null)
        setProgress(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [items])

  function toggle(r) {
    setPicked(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })
  }

  function start() {
    setError('')
    refs.current = {}
    if (blank) {
      // A toets without routes on its questions prints one sheet with all questions.
      const rs = routes.length ? routes.filter(r => picked.has(r)) : [null]
      setItems(rs.map(r => ({ key: `r-${r}`, route: r, student: null })))
    } else {
      setItems(classStudents.map(s => ({ key: `s-${s.id}`, route: routes.length ? s.route : null, student: s })))
    }
  }

  const Sheet = isOpdracht ? BlankOpdrachtRubric : BlankToetsRubric
  const canStart = test && !empty && (blank ? (routes.length === 0 || picked.size > 0) : classStudents.length > 0)

  return (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 540 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Print rubric</h2>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          Een rubric om op papier in te vullen, bijvoorbeeld voor zelfbeoordeling.
          {test && !isOpdracht && ' Per opgave kruis je het hokje met het aantal punten aan.'}
          {isOpdracht && ' Per onderdeel markeer je het hokje en zet je een kruisje in het vakje.'}
          {' '}Elk blad heeft een QR-code, zodat je de ingevulde bladen later kunt scannen en importeren.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        {!test ? (!error && <div className="text-muted">Laden...</div>) : empty ? (
          <div className="text-muted" style={{ marginBottom: 12 }}>Deze rubric heeft nog geen {isOpdracht ? 'onderdelen' : 'opgaven'}.</div>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Voor wie</label>
              <select value={who} onChange={e => setWho(e.target.value)} disabled={busy}>
                <option value={BLANK}>Blanco (Naam en Klas zelf invullen)</option>
                {classes.map(c => <option key={c} value={c}>Per leerling van klas {c} (naam voorgedrukt)</option>)}
              </select>
            </div>

            {!isOpdracht && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showAnswers} onChange={e => setShowAnswers(e.target.checked)} disabled={busy} />
                  Antwoorden op rubric
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showGoals} onChange={e => setShowGoals(e.target.checked)} disabled={busy} />
                  Leerdoelen bij de opgaven
                </label>
              </div>
            )}

            {blank && routes.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Routes</div>
                {routes.map(r => (
                  <label key={r} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={picked.has(r)} onChange={() => toggle(r)} disabled={busy} />
                    <RouteBadge route={r} />
                  </label>
                ))}
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Elke route krijgt een eigen blad met alleen de {isOpdracht ? 'onderdelen' : 'opgaven'} van die route. Print zoveel exemplaren als je nodig hebt.</div>
              </div>
            )}
            {!blank && (
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                {classStudents.length} leerling{classStudents.length === 1 ? '' : 'en'}, elk met de rubric van de eigen route. Dubbelzijdig printen: elke leerling begint op een nieuw vel.
              </div>
            )}
          </>
        )}

        <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuleren</button>
          <button className="btn btn-primary" onClick={start} disabled={busy || !canStart}>
            {busy ? (progress ? `PDF maken... ${progress.done + 1}/${progress.total}` : 'PDF maken...') : 'Download PDF'}
          </button>
        </div>
      </div>

      {items && test && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1 }}>
          {items.map(it => (
            <div key={it.key} ref={el => { refs.current[it.key] = el }}>
              <Sheet test={test} route={it.route} student={it.student} showAnswers={showAnswers} showGoals={showGoals} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
