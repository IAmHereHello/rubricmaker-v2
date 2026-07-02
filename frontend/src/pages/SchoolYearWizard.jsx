import { useState, useEffect, useRef } from 'react'
import * as api from '../api.js'

const ROUTES = ['oranje', 'geel', 'blauw']
const ROUTE_LABELS = { oranje: 'Oranje', geel: 'Geel', blauw: 'Blauw' }

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseNames(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(name => ({ name, route: 'geel' }))
}

function RouteBadgeSmall({ route }) {
  const colors = { oranje: '#e65100', geel: '#f9a825', blauw: '#1565c0' }
  const bg = { oranje: '#fff3e0', geel: '#fffde7', blauw: '#e3f2fd' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, borderRadius: 3, padding: '1px 6px',
      color: colors[route], background: bg[route],
    }}>
      {ROUTE_LABELS[route]}
    </span>
  )
}

// ── Step components ────────────────────────────────────────────────────────────

function Step1Overview({ outgoingYear, sessionCount, onNext, onCancel }) {
  const csvUrl = api.getSchoolYearExportUrl()
  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Nieuw schooljaar</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Je staat op het punt over te stappen naar een nieuw schooljaar.
        Alle sessies van <strong>{outgoingYear}</strong> worden verwijderd ({sessionCount} sessie{sessionCount !== 1 ? 's' : ''}).
        Leerlingendata die je meeneemt blijft bewaard inclusief een overzicht van vorig jaar.
      </p>

      <div className="card" style={{ background: '#f5f7fb', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Exporteer alle scores als CSV</div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Download een backup van alle sessiedata vóór je doorgaat.
          </div>
        </div>
        <a
          href={csvUrl}
          download
          className="btn btn-secondary"
          style={{ whiteSpace: 'nowrap', marginLeft: 16 }}
        >
          Download CSV
        </a>
      </div>

      <div className="grade-nav-buttons" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
        <button className="btn btn-primary" onClick={onNext}>Volgende →</button>
      </div>
    </div>
  )
}

function Step2KeepClasses({ existingClasses, studentsByClass, kept, setKept, onNext, onPrev, onCancel }) {
  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Welke klassen blijven?</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Vink de klassen aan waarvan je <em>alle</em> leerlingen meeneemt naar het nieuwe schooljaar.
        Losse overschrijvingen stel je in de volgende stap in.
      </p>

      {existingClasses.length === 0 ? (
        <p className="text-muted">Geen klassen gevonden.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {existingClasses.map(cls => {
            const count = (studentsByClass[cls] || []).length
            const checked = kept.has(cls)
            return (
              <label key={cls} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 6, cursor: 'pointer',
                border: `2px solid ${checked ? '#1e3a5f' : '#dde'}`,
                background: checked ? '#f0f4fa' : '#fff',
              }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => {
                    setKept(prev => {
                      const next = new Set(prev)
                      e.target.checked ? next.add(cls) : next.delete(cls)
                      return next
                    })
                  }}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 600 }}>{cls}</span>
                <span className="text-muted" style={{ fontSize: 13 }}>{count} leerling{count !== 1 ? 'en' : ''}</span>
              </label>
            )
          })}
        </div>
      )}

      <div className="grade-nav-buttons" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onPrev}>← Vorige</button>
          <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
        </div>
        <button className="btn btn-primary" onClick={onNext}>Volgende →</button>
      </div>
    </div>
  )
}

function Step3Transfers({ existingClasses, studentsByClass, keptClasses, transfers, setTransfers, newClasses, onNext, onPrev, onCancel }) {
  const nonKeptClasses = existingClasses.filter(c => !keptClasses.has(c))
  const nonKeptStudents = nonKeptClasses.flatMap(c => studentsByClass[c] || [])

  function toggleTransfer(student) {
    setTransfers(prev => {
      if (prev.some(t => t.student_id === student.id)) {
        return prev.filter(t => t.student_id !== student.id)
      }
      return [...prev, { student_id: student.id, name: student.name, new_class_name: newClasses[0] || '' }]
    })
  }

  function setClass(student_id, cls) {
    setTransfers(prev => prev.map(t => t.student_id === student_id ? { ...t, new_class_name: cls } : t))
  }

  if (nonKeptStudents.length === 0) {
    return (
      <div>
        <h2 style={{ margin: '0 0 8px' }}>Individuele overschrijvingen</h2>
        <p className="text-muted" style={{ marginBottom: 24 }}>
          Geen leerlingen buiten de geselecteerde klassen.
        </p>
        <div className="grade-nav-buttons" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onPrev}>← Vorige</button>
            <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
          </div>
          <button className="btn btn-primary" onClick={onNext}>Volgende →</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Individuele overschrijvingen</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Leerlingen uit niet-geselecteerde klassen die je toch wil meenemen.
        Selecteer de leerling en kies de nieuwe klas.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
        {nonKeptClasses.map(cls => (
          <div key={cls}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', margin: '10px 0 4px' }}>
              {cls}
            </div>
            {(studentsByClass[cls] || []).map(student => {
              const transfer = transfers.find(t => t.student_id === student.id)
              return (
                <label key={student.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${transfer ? '#1e3a5f' : '#eee'}`,
                  background: transfer ? '#f0f4fa' : '#fff',
                  marginBottom: 4,
                }}>
                  <input
                    type="checkbox"
                    checked={!!transfer}
                    onChange={() => toggleTransfer(student)}
                  />
                  <span style={{ flex: 1, fontWeight: 500 }}>{student.name}</span>
                  {transfer && (
                    <select
                      value={transfer.new_class_name}
                      onChange={e => setClass(student.id, e.target.value)}
                      onClick={e => e.preventDefault()}
                      style={{ fontSize: 13, padding: '2px 6px' }}
                    >
                      {newClasses.filter(Boolean).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      {newClasses.filter(Boolean).length === 0 && (
                        <option value="">— Voeg eerst nieuwe klassen toe —</option>
                      )}
                    </select>
                  )}
                </label>
              )
            })}
          </div>
        ))}
      </div>

      <div className="grade-nav-buttons" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onPrev}>← Vorige</button>
          <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
        </div>
        <button className="btn btn-primary" onClick={onNext}>Volgende →</button>
      </div>
    </div>
  )
}

function Step4NewClasses({ newClasses, setNewClasses, keptClasses, onNext, onPrev, onCancel }) {
  const [inputVal, setInputVal] = useState('')
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef(null)

  function addCls() {
    const v = inputVal.trim()
    if (!v || newClasses.includes(v)) return
    setNewClasses(prev => [...prev, v])
    setInputVal('')
    inputRef.current?.focus()
  }

  function removeClass(i) {
    setNewClasses(prev => prev.filter((_, idx) => idx !== i))
  }

  function startEdit(i) {
    setEditIdx(i)
    setEditVal(newClasses[i])
  }

  function saveEdit() {
    const v = editVal.trim()
    if (v) {
      setNewClasses(prev => prev.map((c, i) => i === editIdx ? v : c))
    }
    setEditIdx(null)
    setEditVal('')
  }

  const totalClasses = keptClasses.size + newClasses.length

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Nieuwe klassen</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Voeg de naam toe van elke nieuwe klas. In de volgende stap plak je de leerlinglijsten.
        {keptClasses.size > 0 && (
          <span> Overgenomen klassen: <strong>{[...keptClasses].join(', ')}</strong>.</span>
        )}
      </p>

      {/* Existing kept classes as badges */}
      {keptClasses.size > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {[...keptClasses].map(c => (
            <span key={c} style={{
              padding: '4px 10px', borderRadius: 4, background: '#e8f0fc',
              color: '#1e3a5f', fontSize: 13, fontWeight: 600,
            }}>
              {c} (overgenomen)
            </span>
          ))}
        </div>
      )}

      {/* New class input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCls()}
          placeholder="Naam nieuwe klas (bijv. 1A)…"
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={addCls} disabled={!inputVal.trim()}>
          Toevoegen
        </button>
      </div>

      {/* New classes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
        {newClasses.map((cls, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6, border: '1px solid #dde', background: '#fff',
          }}>
            {editIdx === i ? (
              <>
                <input
                  type="text"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditIdx(null) }}
                  style={{ flex: 1, fontSize: 14 }}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={saveEdit}>✓</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditIdx(null)}>✗</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontWeight: 600 }}>{cls}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => startEdit(i)}
                  style={{ fontSize: 11 }}
                >
                  Naam wijzigen
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => removeClass(i)}
                  style={{ fontSize: 11, color: '#c62828' }}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="grade-nav-buttons" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onPrev}>← Vorige</button>
          <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
        </div>
        <button
          className="btn btn-primary"
          onClick={onNext}
          disabled={totalClasses === 0}
          title={totalClasses === 0 ? 'Voeg minstens één klas toe' : ''}
        >
          Volgende →
        </button>
      </div>
    </div>
  )
}

function Step5Students({ allClasses, studentsByNewClass, setStudentsByNewClass, keptClasses, keptStudentsByClass, onNext, onPrev, onCancel }) {
  const [classIdx, setClassIdx] = useState(0)
  const [pasteText, setPasteText] = useState('')
  const pasteRef = useRef(null)

  const currentClass = allClasses[classIdx]
  const isKept = keptClasses.has(currentClass)
  const students = studentsByNewClass[currentClass] || []

  function handlePaste(e) {
    const text = e.clipboardData.getData('text')
    if (!text.trim()) return
    e.preventDefault()
    const parsed = parseNames(text)
    if (parsed.length === 0) return
    setStudentsByNewClass(prev => ({
      ...prev,
      [currentClass]: [...(prev[currentClass] || []), ...parsed],
    }))
    setPasteText('')
  }

  function removeStudent(i) {
    setStudentsByNewClass(prev => ({
      ...prev,
      [currentClass]: (prev[currentClass] || []).filter((_, idx) => idx !== i),
    }))
  }

  function updateStudent(i, field, value) {
    setStudentsByNewClass(prev => ({
      ...prev,
      [currentClass]: (prev[currentClass] || []).map((s, idx) =>
        idx === i ? { ...s, [field]: value } : s
      ),
    }))
  }

  function setRoute(i, route) {
    updateStudent(i, 'route', route)
  }

  function updateName(i, name) {
    updateStudent(i, 'name', name)
  }

  const keptStudents = keptStudentsByClass[currentClass] || []

  return (
    <div>
      <h2 style={{ margin: '0 0 4px' }}>Leerlingen invoeren</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {allClasses.map((cls, i) => (
          <button
            key={cls}
            onClick={() => setClassIdx(i)}
            style={{
              padding: '4px 12px', borderRadius: 4, fontWeight: 600, fontSize: 13,
              border: `2px solid ${i === classIdx ? '#1e3a5f' : '#dde'}`,
              background: i === classIdx ? '#1e3a5f' : '#fff',
              color: i === classIdx ? '#fff' : '#444',
              cursor: 'pointer',
            }}
          >
            {cls}
            {keptClasses.has(cls)
              ? <span style={{ marginLeft: 4, fontWeight: 400, fontSize: 11 }}>✓ overgenomen</span>
              : (studentsByNewClass[cls] || []).length > 0
              ? <span style={{ marginLeft: 4, fontWeight: 400, fontSize: 11 }}>({(studentsByNewClass[cls] || []).length})</span>
              : null}
          </button>
        ))}
      </div>

      {isKept ? (
        <div className="card" style={{ background: '#f0f4fa', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {currentClass} — overgenomen klas
          </div>
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            {keptStudents.length} leerling{keptStudents.length !== 1 ? 'en' : ''} worden automatisch overgenomen.
            Je kunt hun route later aanpassen via Leerlingen.
          </p>
          {keptStudents.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {keptStudents.map(s => (
                <span key={s.id} style={{
                  fontSize: 12, padding: '2px 8px', borderRadius: 4,
                  background: '#e8f0fc', color: '#1e3a5f',
                }}>
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-muted" style={{ marginBottom: 10, fontSize: 13 }}>
            Plak de namen in het veld (één naam per regel). Daarna kun je per leerling de route instellen.
          </p>

          <textarea
            ref={pasteRef}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            onPaste={handlePaste}
            placeholder="Plak hier de namen in (één per regel)…"
            rows={4}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, resize: 'vertical', marginBottom: 10 }}
          />

          {students.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                {students.length} leerling{students.length !== 1 ? 'en' : ''} — stel de route in
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {students.map((student, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 6,
                    border: '1px solid #eee', background: '#fff',
                  }}>
                    <input
                      type="text"
                      value={student.name}
                      onChange={e => updateName(i, e.target.value)}
                      style={{ flex: 1, fontSize: 13, border: 'none', padding: 0, background: 'transparent' }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      {ROUTES.map(route => (
                        <button
                          key={route}
                          onClick={() => setRoute(i, route)}
                          style={{
                            padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 700,
                            cursor: 'pointer',
                            border: `2px solid ${student.route === route ? 'currentColor' : '#dde'}`,
                            background: student.route === route
                              ? (route === 'oranje' ? '#fff3e0' : route === 'geel' ? '#fffde7' : '#e3f2fd')
                              : '#fff',
                            color: route === 'oranje' ? '#e65100' : route === 'geel' ? '#f57f17' : '#1565c0',
                          }}
                        >
                          {ROUTE_LABELS[route]}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => removeStudent(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="grade-nav-buttons" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onPrev}>← Vorige</button>
          <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {classIdx < allClasses.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setClassIdx(i => i + 1)}>
              Volgende klas →
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onNext}>
              Overzicht →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Step6Summary({ outgoingYear, continuingStudents, newStudents, onConfirm, onPrev, onCancel, saving }) {
  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Overzicht — klaar om door te gaan?</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Controleer onderstaande samenvatting. Na bevestiging worden alle sessies van <strong>{outgoingYear}</strong> definitief verwijderd.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <div className="card" style={{ background: '#e8f5e9' }}>
          <div style={{ fontWeight: 700, color: '#2e7d32', marginBottom: 4 }}>
            {continuingStudents.length} leerling{continuingStudents.length !== 1 ? 'en' : ''} overgenomen
          </div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Inclusief radar-snapshot van {outgoingYear}.
          </div>
        </div>

        <div className="card" style={{ background: '#e8f0fc' }}>
          <div style={{ fontWeight: 700, color: '#1a6ecc', marginBottom: 4 }}>
            {newStudents.length} nieuwe leerling{newStudents.length !== 1 ? 'en' : ''}
          </div>
          {newStudents.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {newStudents.slice(0, 20).map((s, i) => (
                <span key={i} style={{ fontSize: 12, padding: '1px 6px', borderRadius: 3, background: '#fff', border: '1px solid #ccd' }}>
                  {s.name} <span style={{ color: '#888' }}>({s.class_name})</span>
                </span>
              ))}
              {newStudents.length > 20 && (
                <span style={{ fontSize: 12, color: '#888' }}>+{newStudents.length - 20} meer</span>
              )}
            </div>
          )}
        </div>

        <div className="card" style={{ background: '#fdecea' }}>
          <div style={{ fontWeight: 700, color: '#c62828', marginBottom: 4 }}>
            Alle sessies worden verwijderd
          </div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Dit is niet ongedaan te maken. Download eerst de CSV als je een backup wil.
          </div>
        </div>
      </div>

      <div className="grade-nav-buttons" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onPrev} disabled={saving}>← Vorige</button>
          <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuleren</button>
        </div>
        <button
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={saving}
          style={{ background: '#c62828', borderColor: '#c62828' }}
        >
          {saving ? 'Bezig…' : 'Bevestigen — nieuw schooljaar starten'}
        </button>
      </div>
    </div>
  )
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export default function SchoolYearWizard({ status, allStudents, onClose, onDone }) {
  const [step, setStep] = useState(1)
  const [keptClasses, setKeptClasses] = useState(new Set())
  const [transfers, setTransfers] = useState([])      // [{student_id, name, new_class_name}]
  const [newClasses, setNewClasses] = useState([])    // new class names (not kept)
  const [studentsByNewClass, setStudentsByNewClass] = useState({})  // class → [{name, route}]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const outgoingYear = status.outgoing_year
  const sessionCount = status.session_count

  // Derive existing classes from all students
  const existingClasses = [...new Set(allStudents.map(s => s.class_name))].sort()
  const studentsByClass = {}
  for (const s of allStudents) {
    if (!studentsByClass[s.class_name]) studentsByClass[s.class_name] = []
    studentsByClass[s.class_name].push(s)
  }

  // All classes for step 5 (kept + new)
  const allClassesForStep5 = [...keptClasses, ...newClasses]

  // Kept students keyed by class (for display in step 5)
  const keptStudentsByClass = {}
  for (const cls of keptClasses) {
    keptStudentsByClass[cls] = studentsByClass[cls] || []
  }

  // Build the final lists for summary + API call
  const continuingStudents = [
    // kept-class students (keep same class name unless transferred)
    ...[...keptClasses].flatMap(cls =>
      (studentsByClass[cls] || []).map(s => ({
        student_id: s.id,
        name: s.name,
        new_class_name: cls,
      }))
    ),
    // individual transfers
    ...transfers.filter(t => t.new_class_name),
  ]

  const newStudentsFlat = newClasses.flatMap(cls =>
    (studentsByNewClass[cls] || [])
      .filter(s => s.name.trim())
      .map(s => ({ name: s.name.trim(), class_name: cls, route: s.route }))
  )

  async function handleConfirm() {
    setError('')
    setSaving(true)
    try {
      await api.advanceSchoolYear({
        outgoing_year: outgoingYear,
        continuing_students: continuingStudents.map(({ student_id, new_class_name }) => ({ student_id, new_class_name })),
        new_students: newStudentsFlat,
      })
      onDone()
    } catch (e) {
      setError('Er is iets misgegaan. Probeer het opnieuw.')
      setSaving(false)
    }
  }

  const TOTAL_STEPS = 6
  const pct = ((step - 1) / (TOTAL_STEPS - 1)) * 100

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 660,
        maxHeight: '90vh', overflowY: 'auto', padding: 32, position: 'relative',
      }}>
        {/* Progress bar */}
        <div style={{ background: '#e0e3ea', borderRadius: 6, height: 4, marginBottom: 24 }}>
          <div style={{
            background: '#1e3a5f', borderRadius: 6, height: 4,
            width: `${pct}%`, transition: 'width .3s',
          }} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 16 }}>
          Stap {step} van {TOTAL_STEPS}
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
        )}

        {step === 1 && (
          <Step1Overview
            outgoingYear={outgoingYear}
            sessionCount={sessionCount}
            onNext={() => setStep(2)}
            onCancel={onClose}
          />
        )}

        {step === 2 && (
          <Step2KeepClasses
            existingClasses={existingClasses}
            studentsByClass={studentsByClass}
            kept={keptClasses}
            setKept={setKeptClasses}
            onNext={() => setStep(3)}
            onPrev={() => setStep(1)}
            onCancel={onClose}
          />
        )}

        {step === 3 && (
          <Step3Transfers
            existingClasses={existingClasses}
            studentsByClass={studentsByClass}
            keptClasses={keptClasses}
            transfers={transfers}
            setTransfers={setTransfers}
            newClasses={newClasses}
            onNext={() => setStep(4)}
            onPrev={() => setStep(2)}
            onCancel={onClose}
          />
        )}

        {step === 4 && (
          <Step4NewClasses
            newClasses={newClasses}
            setNewClasses={setNewClasses}
            keptClasses={keptClasses}
            onNext={() => setStep(5)}
            onPrev={() => setStep(3)}
            onCancel={onClose}
          />
        )}

        {step === 5 && (
          <Step5Students
            allClasses={allClassesForStep5}
            studentsByNewClass={studentsByNewClass}
            setStudentsByNewClass={setStudentsByNewClass}
            keptClasses={keptClasses}
            keptStudentsByClass={keptStudentsByClass}
            onNext={() => setStep(6)}
            onPrev={() => setStep(4)}
            onCancel={onClose}
          />
        )}

        {step === 6 && (
          <Step6Summary
            outgoingYear={outgoingYear}
            continuingStudents={continuingStudents}
            newStudents={newStudentsFlat}
            onConfirm={handleConfirm}
            onPrev={() => setStep(5)}
            onCancel={onClose}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}
