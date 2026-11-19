import { useState, useRef, useEffect } from 'react'
import * as api from '../api.js'
import LevelPicker from '../components/LevelPicker.jsx'
import { guessLevel, nextYearLevel } from '../utils/levels.js'

const ROUTES = ['oranje', 'geel', 'blauw']
const ROUTE_LABELS = { oranje: 'Oranje', geel: 'Geel', blauw: 'Blauw' }
const ROUTE_COLOR = { oranje: '#e65100', geel: '#f57f17', blauw: '#1565c0' }
const ROUTE_BG    = { oranje: '#fff3e0', geel: '#fffde7', blauw: '#e3f2fd' }

// ── Helpers ────────────────────────────────────────────────────────────────────

function autoIncrement(name) {
  return name.replace(/\d+/g, n => String(parseInt(n, 10) + 1))
}

function parseNames(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(name => ({ name, route: 'geel' }))
}

function RouteButtons({ currentRoute, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {ROUTES.map(route => {
        const active = currentRoute === route
        return (
          <button
            key={route}
            onClick={() => onChange(route)}
            style={{
              padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 700,
              cursor: 'pointer',
              border: `2px solid ${active ? ROUTE_COLOR[route] : '#dde'}`,
              background: active ? ROUTE_BG[route] : '#fff',
              color: ROUTE_COLOR[route],
            }}
          >
            {ROUTE_LABELS[route]}
          </button>
        )
      })}
    </div>
  )
}

// ── Step 1: Overview + CSV export ─────────────────────────────────────────────

function Step1Overview({ outgoingYear, sessionCount, onNext, onCancel }) {
  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Nieuw schooljaar</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Je staat op het punt over te stappen naar een nieuw schooljaar.
        Alle sessies van <strong>{outgoingYear}</strong> worden verwijderd
        ({sessionCount} sessie{sessionCount !== 1 ? 's' : ''}).
        Leerlingendata die je meeneemt blijft bewaard inclusief een overzicht van vorig jaar.
      </p>

      <div className="card" style={{
        background: '#f5f7fb', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Exporteer alle scores als CSV</div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Download een backup van alle sessiedata vóór je doorgaat.
          </div>
        </div>
        <a
          href={api.getSchoolYearExportUrl()}
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

// ── Step 2: Keep classes — typing input, auto-increment names, route editing ──

function Step2KeepClasses({
  existingClasses, studentsByClass, classLevels,
  keptEntries, setKeptEntries,
  routeOverrides, setRouteOverrides,
  onNext, onPrev, onCancel,
}) {
  const [inputVal, setInputVal] = useState('')
  const [editingName, setEditingName] = useState(null) // oldName being edited
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef(null)

  const alreadyKept = new Set(keptEntries.map(e => e.oldName))

  function addKept() {
    const v = inputVal.trim()
    if (!v || !existingClasses.includes(v) || alreadyKept.has(v)) return
    const newName = autoIncrement(v)
    setKeptEntries(prev => [...prev, {
      oldName: v,
      newName,
      expanded: false,
      level: classLevels[v] ? nextYearLevel(classLevels[v]) : guessLevel(newName),
    }])
    setInputVal('')
    inputRef.current?.focus()
  }

  function removeKept(oldName) {
    setKeptEntries(prev => prev.filter(e => e.oldName !== oldName))
  }

  function toggleExpanded(oldName) {
    setKeptEntries(prev => prev.map(e =>
      e.oldName === oldName ? { ...e, expanded: !e.expanded } : e
    ))
  }

  function startEditName(entry) {
    setEditingName(entry.oldName)
    setEditVal(entry.newName)
  }

  function commitEditName(oldName) {
    const v = editVal.trim()
    if (v) setKeptEntries(prev => prev.map(e => e.oldName === oldName ? { ...e, newName: v } : e))
    setEditingName(null)
  }

  function setRoute(studentId, route) {
    setRouteOverrides(prev => ({ ...prev, [studentId]: route }))
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Welke klassen blijven?</h2>
      <p className="text-muted" style={{ marginBottom: 16 }}>
        Typ een klasnaam om die over te nemen. Het nummer wordt automatisch verhoogd — je kunt de naam daarna aanpassen.
        Klap een klas open om routes te wijzigen. Het leerjaar gaat automatisch één omhoog; controleer het per klas.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          ref={inputRef}
          type="text"
          list="kept-class-datalist"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addKept()}
          placeholder="Typ een bestaande klasnaam…"
          style={{ flex: 1 }}
          autoComplete="off"
        />
        <datalist id="kept-class-datalist">
          {existingClasses
            .filter(c => !alreadyKept.has(c))
            .map(c => <option key={c} value={c} />)}
        </datalist>
        <button
          className="btn btn-primary"
          onClick={addKept}
          disabled={!existingClasses.includes(inputVal.trim()) || alreadyKept.has(inputVal.trim())}
        >
          Toevoegen
        </button>
      </div>

      {keptEntries.length === 0 && (
        <p className="text-muted" style={{ fontStyle: 'italic', marginBottom: 16 }}>
          Nog geen klassen geselecteerd. Niet overgenomen klassen worden verwijderd.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {keptEntries.map(entry => {
          const students = studentsByClass[entry.oldName] || []
          const isEditing = editingName === entry.oldName
          return (
            <div key={entry.oldName} className="card" style={{ padding: '12px 14px' }}>
              {/* Class name row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: '#555', minWidth: 40 }}>{entry.oldName}</span>
                <span style={{ color: '#bbb' }}>→</span>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEditName(entry.oldName)
                        if (e.key === 'Escape') setEditingName(null)
                      }}
                      autoFocus
                      style={{ width: 90, fontSize: 14, fontWeight: 700 }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => commitEditName(entry.oldName)}>✓</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingName(null)}>✗</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, color: '#1e3a5f', minWidth: 40 }}>{entry.newName}</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => startEditName(entry)}
                      style={{ fontSize: 11 }}
                    >
                      Naam wijzigen
                    </button>
                  </>
                )}
                <span className="text-muted" style={{ fontSize: 13, flex: 1 }}>
                  {students.length} leerling{students.length !== 1 ? 'en' : ''}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleExpanded(entry.oldName)}
                >
                  {entry.expanded ? '▲ Routes' : '▼ Routes'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => removeKept(entry.oldName)}
                  style={{ color: '#c62828' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span className="text-muted" style={{ fontSize: 13 }}>Leerjaar {entry.newName}:</span>
                <LevelPicker compact value={entry.level}
                  onChange={level => setKeptEntries(prev => prev.map(e => e.oldName === entry.oldName ? { ...e, level } : e))} />
              </div>

              {/* Expandable route editor */}
              {entry.expanded && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #eef0f4' }}>
                  {students.length === 0 ? (
                    <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Geen leerlingen.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {students.map(student => {
                        const currentRoute = routeOverrides[student.id] ?? student.route
                        return (
                          <div key={student.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '3px 0',
                          }}>
                            <span style={{ flex: 1, fontSize: 13 }}>{student.name}</span>
                            <RouteButtons
                              currentRoute={currentRoute}
                              onChange={route => setRoute(student.id, route)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
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

// ── Step 3: New class names ────────────────────────────────────────────────────

function Step3NewClasses({ newClasses, setNewClasses, newClassLevels, setNewClassLevels, keptEntries, onNext, onPrev, onCancel }) {
  const [inputVal, setInputVal] = useState('')
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef(null)

  function addCls() {
    const v = inputVal.trim()
    if (!v || newClasses.includes(v)) return
    setNewClasses(prev => [...prev, v])
    setNewClassLevels(prev => ({ ...prev, [v]: prev[v] || guessLevel(v) }))
    setInputVal('')
    inputRef.current?.focus()
  }

  function removeClass(i) {
    setNewClasses(prev => prev.filter((_, idx) => idx !== i))
  }

  function startEdit(i) { setEditIdx(i); setEditVal(newClasses[i]) }

  function saveEdit() {
    const v = editVal.trim()
    if (v) {
      const old = newClasses[editIdx]
      setNewClasses(prev => prev.map((c, i) => i === editIdx ? v : c))
      setNewClassLevels(prev => ({ ...prev, [v]: prev[old] || guessLevel(v) }))
    }
    setEditIdx(null)
  }

  const totalClasses = keptEntries.length + newClasses.length

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Nieuwe klassen</h2>
      <p className="text-muted" style={{ marginBottom: 16 }}>
        Voeg de naam toe van elke nieuwe klas. In de volgende stap kun je losse leerlingen overschrijven.
        {keptEntries.length > 0 && (
          <> Overgenomen: <strong>{keptEntries.map(e => `${e.oldName} → ${e.newName}`).join(', ')}</strong>.</>
        )}
      </p>

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
        {newClasses.map((cls, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6, border: '1px solid #dde', background: '#fff',
          }}>
            {editIdx === i ? (
              <>
                <input
                  type="text" value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditIdx(null) }}
                  style={{ flex: 1, fontSize: 14 }} autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={saveEdit}>✓</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditIdx(null)}>✗</button>
              </>
            ) : (
              <>
                <span style={{ fontWeight: 600, minWidth: 50 }}>{cls}</span>
                <span style={{ flex: 1 }}>
                  <LevelPicker compact value={newClassLevels[cls]}
                    onChange={level => setNewClassLevels(prev => ({ ...prev, [cls]: level }))} />
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => startEdit(i)} style={{ fontSize: 11 }}>
                  Naam wijzigen
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => removeClass(i)}
                  style={{ fontSize: 11, color: '#c62828' }}
                >✕</button>
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

// ── Step 4: Individual transfers ───────────────────────────────────────────────

function Step4Transfers({
  existingClasses, studentsByClass, keptEntries,
  transfers, setTransfers,
  allTargetClasses,
  onNext, onPrev, onCancel,
}) {
  const keptOldNames = new Set(keptEntries.map(e => e.oldName))
  const nonKeptClasses = existingClasses.filter(c => !keptOldNames.has(c))
  const nonKeptStudents = nonKeptClasses.flatMap(c => studentsByClass[c] || [])

  function toggleTransfer(student) {
    setTransfers(prev => {
      if (prev.some(t => t.student_id === student.id)) {
        return prev.filter(t => t.student_id !== student.id)
      }
      return [...prev, {
        student_id: student.id,
        name: student.name,
        new_class_name: allTargetClasses[0] || '',
      }]
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
          Geen leerlingen buiten de overgenomen klassen.
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
      <p className="text-muted" style={{ marginBottom: 16 }}>
        Leerlingen uit niet-overgenomen klassen die je toch wil meenemen.
        Vink ze aan en kies de doelklas.
      </p>

      {nonKeptClasses.map(cls => (
        <div key={cls}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#888',
            textTransform: 'uppercase', letterSpacing: '.5px', margin: '12px 0 4px',
          }}>
            {cls}
          </div>
          {(studentsByClass[cls] || []).map(student => {
            const transfer = transfers.find(t => t.student_id === student.id)
            return (
              <label key={student.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                border: `1px solid ${transfer ? '#1e3a5f' : '#eee'}`,
                background: transfer ? '#f0f4fa' : '#fff',
              }}>
                <input type="checkbox" checked={!!transfer} onChange={() => toggleTransfer(student)} />
                <span style={{ flex: 1, fontWeight: 500 }}>{student.name}</span>
                {transfer && (
                  <select
                    value={transfer.new_class_name}
                    onChange={e => setClass(student.id, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 13, padding: '2px 6px' }}
                  >
                    {allTargetClasses.filter(Boolean).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    {allTargetClasses.filter(Boolean).length === 0 && (
                      <option value="">— Voeg eerst klassen toe —</option>
                    )}
                  </select>
                )}
              </label>
            )
          })}
        </div>
      ))}

      <div className="grade-nav-buttons" style={{ justifyContent: 'space-between', marginTop: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onPrev}>← Vorige</button>
          <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
        </div>
        <button className="btn btn-primary" onClick={onNext}>Volgende →</button>
      </div>
    </div>
  )
}

// ── Step 5: Paste students per new class ───────────────────────────────────────

function Step5Students({
  allClasses, studentsByNewClass, setStudentsByNewClass,
  keptNewNames, keptStudentsByNewName,
  onNext, onPrev, onCancel,
}) {
  const [classIdx, setClassIdx] = useState(0)
  const [pasteText, setPasteText] = useState('')
  const pasteRef = useRef(null)

  const currentClass = allClasses[classIdx]
  const isKept = keptNewNames.has(currentClass)
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

  const keptStudents = keptStudentsByNewName[currentClass] || []

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Leerlingen invoeren</h2>

      {/* Class tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {allClasses.map((cls, i) => {
          const isKeptTab = keptNewNames.has(cls)
          const count = (studentsByNewClass[cls] || []).length
          return (
            <button
              key={cls}
              onClick={() => { setClassIdx(i); setPasteText('') }}
              style={{
                padding: '4px 12px', borderRadius: 4, fontWeight: 600, fontSize: 13,
                border: `2px solid ${i === classIdx ? '#1e3a5f' : '#dde'}`,
                background: i === classIdx ? '#1e3a5f' : '#fff',
                color: i === classIdx ? '#fff' : '#444',
                cursor: 'pointer',
              }}
            >
              {cls}
              {isKeptTab
                ? <span style={{ marginLeft: 4, fontWeight: 400, fontSize: 11 }}>✓</span>
                : count > 0
                ? <span style={{ marginLeft: 4, fontWeight: 400, fontSize: 11 }}>({count})</span>
                : null}
            </button>
          )
        })}
      </div>

      {isKept ? (
        <div className="card" style={{ background: '#f0f4fa', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{currentClass} — overgenomen klas</div>
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            {keptStudents.length} leerling{keptStudents.length !== 1 ? 'en' : ''} worden automatisch overgenomen.
            Routes zijn al aangepast in stap 2.
          </p>
          {keptStudents.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
          <p className="text-muted" style={{ marginBottom: 8, fontSize: 13 }}>
            Plak de namen in het veld (één naam per regel).
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
            <div style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#888',
                textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6,
              }}>
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
                      onChange={e => updateStudent(i, 'name', e.target.value)}
                      style={{ flex: 1, fontSize: 13, border: 'none', padding: 0, background: 'transparent' }}
                    />
                    <RouteButtons
                      currentRoute={student.route}
                      onChange={route => updateStudent(i, 'route', route)}
                    />
                    <button
                      onClick={() => removeStudent(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 16 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="grade-nav-buttons" style={{ justifyContent: 'space-between', marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onPrev}>← Vorige</button>
          <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {classIdx < allClasses.length - 1 ? (
            <button className="btn btn-primary" onClick={() => { setClassIdx(i => i + 1); setPasteText('') }}>
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

// ── Step 6: Summary + confirm ──────────────────────────────────────────────────

function Step6Summary({ outgoingYear, continuingStudents, newStudents, onConfirm, onPrev, onCancel, saving }) {
  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Overzicht — klaar om door te gaan?</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Controleer onderstaande samenvatting.
        Na bevestiging worden alle sessies van <strong>{outgoingYear}</strong> definitief verwijderd.
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {newStudents.slice(0, 20).map((s, i) => (
                <span key={i} style={{
                  fontSize: 12, padding: '1px 6px', borderRadius: 3,
                  background: '#fff', border: '1px solid #ccd',
                }}>
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

  // Step 2: kept class entries with auto-incremented new names
  const [keptEntries, setKeptEntries] = useState([])
  // [{oldName: "1A", newName: "2A", expanded: false}]

  // Route overrides for any continuing student
  const [routeOverrides, setRouteOverrides] = useState({})
  // {student_id: "blauw"}

  // Step 3: new (non-kept) class names
  const [newClasses, setNewClasses] = useState([])
  const [newClassLevels, setNewClassLevels] = useState({})   // {className: {leerjaar, niveaus}}

  // Leerjaar + niveaus of this year's classes (kept classes go up one year)
  const [classLevels, setClassLevels] = useState({})
  useEffect(() => { api.getClassLevels().then(setClassLevels).catch(() => {}) }, [])

  // Step 4: individual student transfers from non-kept classes
  const [transfers, setTransfers] = useState([])
  // [{student_id, name, new_class_name}]

  // Step 5: new students per new class (not kept)
  const [studentsByNewClass, setStudentsByNewClass] = useState({})

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const outgoingYear = status.outgoing_year
  const sessionCount = status.session_count

  // Existing class data
  const existingClasses = [...new Set(allStudents.map(s => s.class_name))].sort()
  const studentsByClass = {}
  for (const s of allStudents) {
    if (!studentsByClass[s.class_name]) studentsByClass[s.class_name] = []
    studentsByClass[s.class_name].push(s)
  }

  // Derived: sets of new names for kept classes
  const keptNewNames = new Set(keptEntries.map(e => e.newName))

  // keptStudentsByNewName: {newName: [students]} — for step 5 display
  const keptStudentsByNewName = {}
  for (const entry of keptEntries) {
    keptStudentsByNewName[entry.newName] = studentsByClass[entry.oldName] || []
  }

  // All classes for step 5: kept (by new name) + new
  const allClassesForStep5 = [...keptEntries.map(e => e.newName), ...newClasses]

  // All target classes for transfers (step 4): all new names + new classes
  const allTargetClasses = [...keptEntries.map(e => e.newName), ...newClasses]

  // Final lists for summary + API
  const continuingStudents = [
    ...keptEntries.flatMap(entry =>
      (studentsByClass[entry.oldName] || []).map(s => ({
        student_id: s.id,
        name: s.name,
        new_class_name: entry.newName || entry.oldName,
        new_route: routeOverrides[s.id] ?? null,
      }))
    ),
    ...transfers
      .filter(t => t.new_class_name)
      .map(t => ({
        student_id: t.student_id,
        name: t.name,
        new_class_name: t.new_class_name,
        new_route: routeOverrides[t.student_id] ?? null,
      })),
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
        continuing_students: continuingStudents.map(({ student_id, new_class_name, new_route }) => ({
          student_id,
          new_class_name,
          new_route: new_route || null,
        })),
        new_students: newStudentsFlat,
        class_levels: [
          ...keptEntries.map(e => ({ class_name: e.newName || e.oldName, leerjaar: e.level?.leerjaar || null, niveaus: e.level?.niveaus || '' })),
          ...newClasses.map(c => ({ class_name: c, leerjaar: newClassLevels[c]?.leerjaar || null, niveaus: newClassLevels[c]?.niveaus || '' })),
        ],
      })
      onDone()
    } catch {
      setError('Er is iets misgegaan. Probeer het opnieuw.')
      setSaving(false)
    }
  }

  const TOTAL_STEPS = 6

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflowY: 'auto', padding: 32, position: 'relative',
      }}>
        {/* Progress bar */}
        <div style={{ background: '#e0e3ea', borderRadius: 6, height: 4, marginBottom: 20 }}>
          <div style={{
            background: '#1e3a5f', borderRadius: 6, height: 4,
            width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%`,
            transition: 'width .3s',
          }} />
        </div>

        <div style={{
          fontSize: 11, fontWeight: 700, color: '#888',
          textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 16,
        }}>
          Stap {step} van {TOTAL_STEPS}
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

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
            classLevels={classLevels}
            keptEntries={keptEntries}
            setKeptEntries={setKeptEntries}
            routeOverrides={routeOverrides}
            setRouteOverrides={setRouteOverrides}
            onNext={() => setStep(3)}
            onPrev={() => setStep(1)}
            onCancel={onClose}
          />
        )}

        {step === 3 && (
          <Step3NewClasses
            newClasses={newClasses}
            setNewClasses={setNewClasses}
            newClassLevels={newClassLevels}
            setNewClassLevels={setNewClassLevels}
            keptEntries={keptEntries}
            onNext={() => setStep(4)}
            onPrev={() => setStep(2)}
            onCancel={onClose}
          />
        )}

        {step === 4 && (
          <Step4Transfers
            existingClasses={existingClasses}
            studentsByClass={studentsByClass}
            keptEntries={keptEntries}
            transfers={transfers}
            setTransfers={setTransfers}
            allTargetClasses={allTargetClasses}
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
            keptNewNames={keptNewNames}
            keptStudentsByNewName={keptStudentsByNewName}
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
