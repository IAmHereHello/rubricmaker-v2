import { useEffect, useState } from 'react'
import * as api from '../api.js'
import TeacherNameDialog from './TeacherNameDialog.jsx'
import { downloadJson, safeFileName } from '../utils/shareFiles.js'

function dateNL(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayStamp() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

const keyOf = (t) => `${t.test_id}|${t.label}`

// Exporteer resultaten: per klas the toetsen it made; tick what goes into one .resultaten file.
// testId: opened from a single toets (⋮ menu at Toetsen): only that toets, all klassen ticked.
export default function ResultsExportDialog({ testId = null, onClose, onDone }) {
  const [classes, setClasses] = useState(null)
  const [picked, setPicked] = useState(new Set())
  const [askName, setAskName] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getResultsExportOptions()
      .then(all => {
        const list = all
          .map(c => ({ ...c, tests: c.tests.filter(t => testId === null || t.test_id === testId) }))
          .filter(c => c.tests.length)
        setClasses(list)
        if (testId !== null) {
          setPicked(new Set(list.flatMap(c => c.tests.filter(t => t.graded > 0).map(keyOf))))
        }
      })
      .catch(e => setError(api.errorText(e, 'Laden mislukt.')))
  }, [testId])

  function toggle(k) {
    setPicked(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  function setClass(c, on) {
    setPicked(prev => {
      const n = new Set(prev)
      c.tests.filter(t => t.graded > 0).forEach(t => (on ? n.add(keyOf(t)) : n.delete(keyOf(t))))
      return n
    })
  }

  const selected = (classes || []).flatMap(c => c.tests.filter(t => picked.has(keyOf(t))))
  const testCount = new Set(selected.map(t => t.test_id)).size

  async function start() {
    setError('')
    try {
      const { teacher_name } = await api.getShareSettings()
      if (!teacher_name) { setAskName(true); return }
      download(teacher_name)
    } catch (e) { setError(api.errorText(e, 'Exporteren mislukt.')) }
  }

  async function saveName(name) {
    setAskName(false)
    try { await api.saveShareSettings(name) } catch { setError('Opslaan van je naam mislukt.'); return }
    download(name)
  }

  async function download(teacher) {
    setBusy(true)
    try {
      const byTest = new Map()
      selected.forEach(t => {
        if (!byTest.has(t.test_id)) byTest.set(t.test_id, { test_id: t.test_id, name: t.test_name, labels: [] })
        byTest.get(t.test_id).labels.push(t.label)
      })
      const items = [...byTest.values()]
      const file = await api.exportSelectedResults(items.map(({ test_id, labels }) => ({ test_id, labels })))
      const name = items.length === 1
        ? `${safeFileName(items[0].name)} - resultaten`
        : safeFileName(`resultaten ${teacher} ${todayStamp()}`)
      downloadJson(file, `${name}.resultaten`)
      const graded = selected.reduce((n, t) => n + t.graded, 0)
      const total = selected.reduce((n, t) => n + t.total, 0)
      onDone(`Resultaten gedownload: ${items.length === 1 ? `"${items[0].name}"` : `${items.length} toetsen`}, ${graded} van ${total} leerlingen nagekeken (zonder namen). Alleen volledig nagekeken leerlingen zitten in het bestand. Stuur het naar je collega's; zij kiezen Importeer resultaten bij Vergelijken.`)
    } catch (e) {
      setError(api.errorText(e, 'Exporteren mislukt.'))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 620 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Exporteer resultaten</h2>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          Vink per klas de toetsen aan. Je krijgt één bestand zonder leerlingnamen om naar collega's te sturen.
          Bij hen komt elke toets als eigen vergelijking op Vergelijken, met een overzicht per klas.
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {askName && <TeacherNameDialog onSave={saveName} onCancel={() => setAskName(false)} />}

        {!classes ? (!error && <div className="text-muted">Laden...</div>) : classes.length === 0 ? (
          <div className="text-muted">{testId !== null ? 'Deze toets is nog niet nagekeken in een klas.' : 'Er zijn nog geen toetsen nagekeken in een klas.'}</div>
        ) : (
          <div style={{ maxHeight: '55vh', overflowY: 'auto', marginBottom: 12 }}>
            {classes.map(c => {
              const eligible = c.tests.filter(t => t.graded > 0)
              const allOn = eligible.length > 0 && eligible.every(t => picked.has(keyOf(t)))
              return (
                <div key={c.class_name} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e6ee', paddingBottom: 4, marginBottom: 4 }}>
                    <strong style={{ fontSize: 15 }}>{c.class_name}</strong>
                    {eligible.length > 0 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClass(c, !allOn)}>
                        {allOn ? 'Alles uit' : 'Alles aan'}
                      </button>
                    )}
                  </div>
                  {c.tests.map(t => {
                    const k = keyOf(t)
                    const disabled = t.graded === 0
                    return (
                      <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
                        <input type="checkbox" disabled={disabled} checked={picked.has(k)} onChange={() => toggle(k)} />
                        <span style={{ flex: 1 }}>
                          {t.test_name}
                          {t.label !== c.class_name && <span className="text-muted"> ({t.label})</span>}
                          {t.grading_method === 'opdracht' && <span className="text-muted"> · Grote opdracht</span>}
                          {t.date && <span className="text-muted"> · {dateNL(t.date)}</span>}
                        </span>
                        <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {disabled ? 'nog niet nagekeken' : `${t.graded} van ${t.total} nagekeken`}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={busy || selected.length === 0} onClick={start}>
            {busy ? 'Exporteren...' : selected.length ? `Exporteer (${testCount} ${testCount === 1 ? 'toets' : 'toetsen'})` : 'Exporteer'}
          </button>
        </div>
      </div>
    </div>
  )
}
