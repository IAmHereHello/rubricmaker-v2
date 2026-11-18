import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import RoutePicker from '../components/RoutePicker.jsx'
import ClassEditDialog from '../components/ClassEditDialog.jsx'
import ClassTransferDialog from '../components/ClassTransferDialog.jsx'
import { readJsonFile } from '../utils/shareFiles.js'

const ROUTES = ['oranje', 'geel', 'blauw']
const EMPTY = { name: '', class_name: '', route: 'oranje' }
const IMPORT_EMPTY = { class_name: '', route: 'oranje', text: '' }

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function isValidDeleteConfirm(input) {
  const [typedTime, ...rest] = input.trim().split(' ')
  if (rest.join(' ').toLowerCase() !== 'bevestig') return false
  const now = new Date()
  for (let delta = 0; delta <= 1; delta++) {
    const d = new Date(now - delta * 60000)
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (typedTime === t) return true
  }
  return false
}

// Appends a suffix as an initial: "Jan" + "B" → "Jan B."
function resolvedName(original, suffix) {
  const s = suffix.trim()
  return s ? `${original} ${s}.` : original
}

function buildExistingNames(students, excludeId = null) {
  return new Set(
    students
      .filter(s => excludeId == null || s.id !== excludeId)
      .map(s => s.name.toLowerCase())
  )
}

// Returns indices of items whose resolved names collide (against DB or each other)
function findConflicts(items, existingNames) {
  const resolved = items.map(item => resolvedName(item.original, item.suffix).toLowerCase())
  return items.reduce((acc, _, i) => {
    if (
      existingNames.has(resolved[i]) ||
      resolved.some((r, j) => j !== i && r === resolved[i])
    ) acc.push(i)
    return acc
  }, [])
}

// ⋮ menu at the right of a class: Klas bewerken, Klas overdragen, Klas verwijderen
function ClassMenu({ onEdit, onTransfer, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const pick = fn => e => { e.stopPropagation(); setOpen(false); fn() }
  return (
    <span className="kebab" ref={ref} onClick={e => e.stopPropagation()}>
      <button type="button" className="kebab-toggle" title="Meer acties" aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>⋮</button>
      {open && (
        <div className="kebab-menu" role="menu">
          <button type="button" className="kebab-item" role="menuitem" onClick={pick(onEdit)}>Klas bewerken</button>
          <button type="button" className="kebab-item" role="menuitem" onClick={pick(onTransfer)}>Klas overdragen</button>
          <button type="button" className="kebab-item danger" role="menuitem" onClick={pick(onDelete)}>Klas verwijderen</button>
        </div>
      )}
    </span>
  )
}

export default function Students() {
  const navigate = useNavigate()
  const colleagueFileRef = useRef(null)
  const [editClass, setEditClass] = useState(null)
  const [transferClass, setTransferClass] = useState(null)
  const [busyRoute, setBusyRoute] = useState(null)
  const [students, setStudents] = useState([])
  const [editing, setEditing] = useState(null)   // null | student object | 'new'
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  const [importMode, setImportMode] = useState(false)
  const [importForm, setImportForm] = useState(IMPORT_EMPTY)
  const [importError, setImportError] = useState('')
  // { class_name, route, items: [{ original, suffix, input, needsDisambig }], error? }
  const [importDisambig, setImportDisambig] = useState(null)

  // { base, suffix, input, error? }
  const [singleDisambig, setSingleDisambig] = useState(null)

  const [deletingClass, setDeletingClass] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [openClasses, setOpenClasses] = useState(new Set())
  const editFormRef = useRef(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (editing !== null) {
      requestAnimationFrame(() => {
        editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [editing])

  async function load() {
    try { setStudents(await api.getStudents()) }
    catch { setError('Fout bij laden van leerlingen.') }
  }

  function toggleClass(cls) {
    setOpenClasses(prev => {
      const next = new Set(prev)
      if (next.has(cls)) next.delete(cls)
      else next.add(cls)
      return next
    })
  }

  function startNew() {
    setEditing('new'); setForm(EMPTY); setError(''); setSingleDisambig(null); setImportMode(false)
  }
  async function switchRoute(s, route) {
    setBusyRoute(s.id)
    try {
      await api.updateStudent(s.id, { name: s.name, class_name: s.class_name, route })
      await load()
    } catch { setError('Kleur wijzigen mislukt.') }
    setBusyRoute(null)
  }

  async function chooseColleagueFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const file = await readJsonFile(f)
      navigate('/classes/import', { state: { file, fileName: f.name } })
    } catch (err) { setImportError(err.message) }
  }
  function cancel() { setEditing(null); setError(''); setSingleDisambig(null) }

  async function save() {
    if (!form.name.trim() || !form.class_name.trim()) {
      setError('Naam en klas zijn verplicht.'); return
    }
    const name = form.name.trim()
    const excludeId = editing !== 'new' ? editing.id : null
    const existing = buildExistingNames(students, excludeId)

    if (existing.has(name.toLowerCase())) {
      setSingleDisambig({ base: name, suffix: '', input: '' })
      return
    }
    await doSave(name)
  }

  async function confirmSingleDisambig() {
    const { base, suffix, input } = singleDisambig
    if (!input.trim()) {
      setSingleDisambig(d => ({ ...d, error: 'Voer minimaal één letter in.' }))
      return
    }
    const newSuffix = suffix + input.trim()
    const resolved = resolvedName(base, newSuffix)
    const excludeId = editing !== 'new' ? editing.id : null
    const existing = buildExistingNames(students, excludeId)

    if (existing.has(resolved.toLowerCase())) {
      // Still conflicts — accumulate and ask for more
      setSingleDisambig({ base, suffix: newSuffix, input: '' })
      return
    }
    setSingleDisambig(null)
    await doSave(resolved)
  }

  async function doSave(name) {
    try {
      const data = { ...form, name }
      if (editing === 'new') {
        await api.createStudent(data)
      } else {
        await api.updateStudent(editing.id, data)
      }
      setEditing(null)
      await load()
    } catch { setError('Opslaan mislukt.') }
  }


  function startImport() {
    setImportMode(true); setEditing(null); setSingleDisambig(null)
    setImportForm(IMPORT_EMPTY); setImportError(''); setImportDisambig(null)
  }

  async function doImport() {
    const names = importForm.text.split('\n').map(n => n.trim()).filter(Boolean)
    if (!importForm.class_name.trim()) { setImportError('Klas is verplicht.'); return }
    if (names.length === 0) { setImportError('Voer minimaal één naam in.'); return }

    const items = names.map(original => ({ original, suffix: '' }))
    const existing = buildExistingNames(students)
    const conflicts = findConflicts(items, existing)

    if (conflicts.length > 0) {
      setImportDisambig({
        class_name: importForm.class_name.trim(),
        route: importForm.route,
        items: items.map((item, i) => ({ ...item, input: '', needsDisambig: conflicts.includes(i) }))
      })
      return
    }
    await executeImport(importForm.class_name.trim(), importForm.route, items)
  }

  async function confirmImportDisambig() {
    const { class_name, route, items } = importDisambig

    const allFilled = items.every(item => !item.needsDisambig || item.input.trim())
    if (!allFilled) {
      setImportDisambig(d => ({ ...d, error: 'Vul een achternaamletter in voor alle gemarkeerde namen.' }))
      return
    }

    const updated = items.map(item => ({
      ...item,
      suffix: item.needsDisambig ? (item.suffix + item.input.trim()) : item.suffix,
      input: ''
    }))

    const existing = buildExistingNames(students)
    const conflicts = findConflicts(updated, existing)

    if (conflicts.length > 0) {
      setImportDisambig({
        class_name, route,
        items: updated.map((item, i) => ({ ...item, needsDisambig: conflicts.includes(i) }))
      })
      return
    }
    setImportDisambig(null)
    await executeImport(class_name, route, updated)
  }

  async function executeImport(class_name, route, items) {
    const names = items.map(item => resolvedName(item.original, item.suffix))
    try {
      await api.importStudents({ class_name, route, names })
      setImportMode(false); setImportForm(IMPORT_EMPTY)
      await load()
    } catch { setImportError('Importeren mislukt.') }
  }

  function startDeleteClass(cls) {
    setDeletingClass(cls); setDeleteConfirm(''); setDeleteError('')
    setOpenClasses(prev => { const next = new Set(prev); next.add(cls); return next })
  }
  function cancelDeleteClass() { setDeletingClass(null); setDeleteConfirm(''); setDeleteError('') }

  async function doDeleteClass() {
    if (!isValidDeleteConfirm(deleteConfirm)) {
      setDeleteError(`Onjuiste invoer. Typ de huidige tijd (${nowHHMM()}) gevolgd door een spatie en "bevestig".`)
      return
    }
    try {
      await api.deleteClass(deletingClass)
      setDeletingClass(null); setDeleteConfirm('')
      await load()
    } catch { setDeleteError('Verwijderen mislukt.') }
  }

  const byClass = students.reduce((acc, s) => {
    ;(acc[s.class_name] = acc[s.class_name] || []).push(s)
    return acc
  }, {})
  const classes = Object.keys(byClass).sort()
  const importNames = importForm.text.split('\n').map(n => n.trim()).filter(Boolean)

  return (
    <div className="page">
      <div className="page-header">
        <h1>Leerlingen</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={startImport}>Importeren</button>
          <button className="btn btn-primary" onClick={startNew}>+ Leerling toevoegen</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* ── Import form ── */}
      {importMode && !importDisambig && (
        <div className="card">
          <h2 style={{ marginBottom: 14, fontSize: 16 }}>Leerlingen importeren</h2>
          {importError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{importError}</div>}
          <div className="form-row" style={{ alignItems: 'flex-start' }}>
            <div className="field">
              <label>Klas</label>
              <input
                type="text" value={importForm.class_name}
                onChange={e => setImportForm(f => ({ ...f, class_name: e.target.value }))}
                style={{ width: 80 }}
              />
            </div>
            <div className="field">
              <label>Route</label>
              <select value={importForm.route} onChange={e => setImportForm(f => ({ ...f, route: e.target.value }))}>
                {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <label>Namen (één per regel)</label>
              <textarea
                value={importForm.text}
                onChange={e => setImportForm(f => ({ ...f, text: e.target.value }))}
                rows={6}
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder={'Jan de Vries\nAnna Bakker\nPieter Smit'}
              />
              {importNames.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 13, color: '#666' }}>
                  {importNames.length} leerling{importNames.length !== 1 ? 'en' : ''} gevonden
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={doImport}>
              Importeren ({importNames.length})
            </button>
            <button className="btn btn-secondary" onClick={() => colleagueFileRef.current?.click()}>
              Importeren van collega
            </button>
            <button className="btn btn-secondary" onClick={() => { setImportMode(false); setImportError('') }}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* ── Batch name disambiguation ── */}
      {importDisambig && (
        <div className="card">
          <h2 style={{ marginBottom: 8, fontSize: 16 }}>Naamconflicten oplossen</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555' }}>
            De gemarkeerde namen bestaan al of komen meerdere keren voor.
            Voeg achternaamletters toe om de namen uniek te maken.
          </p>
          {importDisambig.error && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>{importDisambig.error}</div>
          )}
          <table>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Letter(s) toevoegen</th>
                <th>Resultaat</th>
              </tr>
            </thead>
            <tbody>
              {importDisambig.items.map((item, i) => {
                const currentName = resolvedName(item.original, item.suffix)
                const previewName = resolvedName(item.original, item.suffix + item.input)
                const firstConflictIdx = importDisambig.items.findIndex(it => it.needsDisambig)
                return (
                  <tr key={i} style={item.needsDisambig ? { background: '#fff3f3' } : {}}>
                    <td style={{ color: item.needsDisambig ? '#721c24' : undefined }}>{currentName}</td>
                    <td>
                      {item.needsDisambig ? (
                        <input
                          type="text"
                          value={item.input}
                          onChange={e => setImportDisambig(d => ({
                            ...d,
                            error: undefined,
                            items: d.items.map((it, j) => j === i ? { ...it, input: e.target.value } : it)
                          }))}
                          style={{ width: 80 }}
                          placeholder="bijv. B"
                          autoFocus={i === firstConflictIdx}
                        />
                      ) : <span style={{ color: '#aaa' }}>—</span>}
                    </td>
                    <td style={{
                      fontWeight: item.needsDisambig ? 600 : undefined,
                      color: item.needsDisambig ? '#1e3a5f' : '#aaa'
                    }}>
                      {item.needsDisambig ? previewName : currentName}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={confirmImportDisambig}>Doorgaan</button>
            <button className="btn btn-secondary" onClick={() => setImportDisambig(null)}>Terug</button>
          </div>
        </div>
      )}

      {/* ── Single student add/edit form ── */}
      {editing && !singleDisambig && (
        <div ref={editFormRef} className="card">
          <h2 style={{ marginBottom: 14, fontSize: 16 }}>
            {editing === 'new' ? 'Nieuwe leerling' : `${editing.name} bewerken`}
          </h2>
          <div className="form-row">
            <div className="field">
              <label>Naam</label>
              <input
                type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: 200 }}
              />
            </div>
            <div className="field">
              <label>Klas</label>
              <input
                type="text" value={form.class_name}
                onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}
                style={{ width: 80 }}
              />
            </div>
            <div className="field">
              <label>Route</label>
              <select value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))}>
                {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {editing !== 'new' && form.route !== editing.route && (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4, maxWidth: 220 }}>
                  Toetsen die al zijn nagekeken houden route {editing.route}.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
              <button className="btn btn-primary" onClick={save}>Opslaan</button>
              <button className="btn btn-secondary" onClick={cancel}>Annuleren</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Single student name disambiguation ── */}
      {singleDisambig && (
        <div className="card">
          <h2 style={{ marginBottom: 8, fontSize: 16 }}>Naam al in gebruik</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13 }}>
            Er is al een leerling met de naam{' '}
            <strong>"{resolvedName(singleDisambig.base, singleDisambig.suffix)}"</strong>.
            {' '}Voer {singleDisambig.suffix ? 'nog een' : 'een'} achternaamletter in:
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>
              {resolvedName(singleDisambig.base, singleDisambig.suffix)}
            </span>
            <span style={{ color: '#888' }}>+</span>
            <input
              type="text"
              value={singleDisambig.input}
              onChange={e => setSingleDisambig(d => ({ ...d, input: e.target.value, error: undefined }))}
              style={{ width: 80 }}
              placeholder="bijv. B"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && confirmSingleDisambig()}
            />
            <span style={{ color: '#888' }}>→</span>
            <strong style={{ color: '#1e3a5f' }}>
              {resolvedName(singleDisambig.base, singleDisambig.suffix + singleDisambig.input)}
            </strong>
          </div>
          {singleDisambig.error && (
            <div className="alert alert-error" style={{ marginBottom: 8 }}>{singleDisambig.error}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={confirmSingleDisambig}>Opslaan</button>
            <button className="btn btn-secondary" onClick={() => setSingleDisambig(null)}>Terug</button>
          </div>
        </div>
      )}

      <input ref={colleagueFileRef} type="file" accept=".klas,application/json" style={{ display: 'none' }} onChange={chooseColleagueFile} />
      {editClass && (
        <ClassEditDialog
          className={editClass}
          students={byClass[editClass] || []}
          allStudents={students}
          onClose={() => setEditClass(null)}
          onSaved={async newName => {
            setEditClass(null)
            setOpenClasses(prev => { const next = new Set(prev); next.add(newName); return next })
            await load()
          }}
        />
      )}
      {transferClass && (
        <ClassTransferDialog
          className={transferClass}
          onClose={() => setTransferClass(null)}
          onDeleted={async () => { setTransferClass(null); await load() }}
        />
      )}

      {classes.length === 0 && !editing && !importMode && !importDisambig && (
        <div className="card text-muted">Nog geen leerlingen.</div>
      )}

      {classes.map(cls => {
        const isOpen = openClasses.has(cls)
        return (
          <div key={cls} className="card">
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isOpen ? 12 : 0 }}
              onClick={() => toggleClass(cls)}
            >
              <strong style={{ fontSize: 15 }}>
                Klas {cls}
                <span style={{ color: '#888', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
                  ({byClass[cls].length} leerling{byClass[cls].length !== 1 ? 'en' : ''})
                </span>
              </strong>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link
                  to={`/classes/${cls}/overview`}
                  className="btn btn-secondary btn-sm"
                  onClick={e => e.stopPropagation()}
                >Klasoverzicht →</Link>
                <ClassMenu
                  onEdit={() => setEditClass(cls)}
                  onTransfer={() => setTransferClass(cls)}
                  onDelete={() => startDeleteClass(cls)}
                />
                <span style={{ color: '#888', fontSize: 13, minWidth: 16, textAlign: 'center' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <>
                {deletingClass === cls && (
                  <div style={{ background: '#fff3f3', border: '1px solid #f5c6cb', borderRadius: 6, padding: 16, marginBottom: 16 }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#721c24' }}>
                      Klas {cls} verwijderen — {byClass[cls].length} leerling{byClass[cls].length !== 1 ? 'en' : ''}
                    </p>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#721c24' }}>
                      Alle leerlingen en hun scores worden permanent verwijderd. Dit kan niet ongedaan worden gemaakt.
                    </p>
                    {deleteError && <div className="alert alert-error" style={{ marginBottom: 8 }}>{deleteError}</div>}
                    <div style={{ marginBottom: 8, fontSize: 13 }}>
                      Typ de huidige tijd (bijv. <strong>{nowHHMM()}</strong>) gevolgd door een spatie en het woord <strong>bevestig</strong>:
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={deleteConfirm}
                        onChange={e => { setDeleteConfirm(e.target.value); setDeleteError('') }}
                        placeholder={`${nowHHMM()} bevestig`}
                        style={{ width: 180 }}
                        onKeyDown={e => e.key === 'Enter' && doDeleteClass()}
                        autoFocus
                      />
                      <button className="btn btn-danger btn-sm" onClick={doDeleteClass}>
                        Definitief verwijderen
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={cancelDeleteClass}>
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}

                <table>
                  <thead>
                    <tr>
                      <th>Naam</th>
                      <th>Route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byClass[cls].map(s => (
                      <tr key={s.id}>
                        <td>
                          <Link to={`/students/${s.id}/progress`} style={{ color: '#1e3a5f', textDecoration: 'none', fontWeight: 600 }}>
                            {s.name}
                          </Link>
                        </td>
                        <td>
                          <RoutePicker
                            route={s.route} studentName={s.name} busy={busyRoute === s.id}
                            hint="Nagekeken toetsen houden hun oude kleur."
                            onSwitch={route => switchRoute(s, route)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
