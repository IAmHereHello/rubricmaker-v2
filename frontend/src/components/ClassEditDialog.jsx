import { useState } from 'react'
import * as api from '../api.js'
import RoutePicker from './RoutePicker.jsx'
import LevelPicker from './LevelPicker.jsx'
import { guessLevel, levelLabel } from '../utils/levels.js'

const THIS = '__this__'
let tmpId = 0

// Klas bewerken: class name and every student (name, colour, class) in one popup.
// Nothing is saved until Opslaan. level: stored leerjaar + niveaus, or undefined (then guessed from the name).
export default function ClassEditDialog({ className, level, students, allStudents, onClose, onSaved }) {
  const otherClasses = [...new Set(allStudents.map(s => s.class_name))].filter(c => c !== className).sort()
  const [name, setName] = useState(className)
  const [lvl, setLvl] = useState(() => level || guessLevel(className))
  const [rows, setRows] = useState(() => students.map(s => ({
    key: `s${s.id}`, id: s.id, name: s.name, route: s.route, cls: THIS, deleted: false, orig: s,
  })))
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  function update(key, patch) {
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))
    setError(''); setConfirmDelete(false)
  }
  function addRow() {
    tmpId += 1
    setRows(rs => [...rs, { key: `n${tmpId}`, id: null, name: '', route: 'oranje', cls: THIS, deleted: false }])
  }
  function removeRow(r) {
    if (r.id == null) setRows(rs => rs.filter(x => x.key !== r.key))
    else update(r.key, { deleted: !r.deleted })
  }

  function validate() {
    const newName = name.trim()
    if (!newName) return 'Vul een klasnaam in.'
    if (otherClasses.some(c => c.toLowerCase() === newName.toLowerCase())) return `Er bestaat al een klas met de naam ${newName}.`
    const live = rows.filter(r => !r.deleted)
    if (live.some(r => !r.name.trim())) return 'Vul voor elke leerling een naam in.'
    const editedIds = new Set(rows.filter(r => r.id != null).map(r => r.id))
    const taken = new Set(allStudents.filter(s => !editedIds.has(s.id)).map(s => s.name.toLowerCase()))
    const seen = new Set()
    for (const r of live) {
      const n = r.name.trim().toLowerCase()
      if (taken.has(n) || seen.has(n)) return `De naam ${r.name.trim()} bestaat al. Voeg een achternaamletter toe, bijv. "${r.name.trim()} B.".`
      seen.add(n)
    }
    return ''
  }

  async function save() {
    const err = validate()
    if (err) { setError(err); return }
    const deleting = rows.filter(r => r.deleted)
    if (deleting.length && !confirmDelete) { setConfirmDelete(true); return }
    setBusy(true); setError('')
    try {
      const newName = name.trim()
      if (newName !== className) await api.renameClass(className, newName)
      if (levelLabel(lvl) !== levelLabel(level) || !level) await api.setClassLevel(newName, lvl)
      for (const r of deleting) await api.deleteStudent(r.id)
      for (const r of rows.filter(r => !r.deleted)) {
        const data = { name: r.name.trim(), route: r.route, class_name: r.cls === THIS ? newName : r.cls }
        if (r.id == null) await api.createStudent(data)
        else if (data.name !== r.orig.name || data.route !== r.orig.route || r.cls !== THIS) await api.updateStudent(r.id, data)
      }
      onSaved(newName)
    } catch (e) {
      setError(api.errorText(e, 'Opslaan mislukt.'))
      setBusy(false)
    }
  }

  const deleting = rows.filter(r => r.deleted)
  return (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Klas bewerken</h2>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Klasnaam</label>
          <input type="text" value={name} onChange={e => { setName(e.target.value); setError('') }} style={{ maxWidth: 220 }} />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Leerjaar en niveau{levelLabel(lvl) && <span className="text-muted" style={{ fontWeight: 400 }}> (groep {levelLabel(lvl)})</span>}</label>
          <LevelPicker value={lvl} onChange={setLvl} />
          {!level && levelLabel(lvl) && (
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Ingevuld op basis van de klasnaam. Controleer het en klik op Opslaan.</div>
          )}
        </div>

        <table className="class-edit-table">
          <thead>
            <tr><th>Naam</th><th>Kleur</th><th>Klas</th><th style={{ width: 40 }}></th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className={r.deleted ? 'class-edit-deleted' : ''}>
                <td>
                  <input
                    type="text" value={r.name} disabled={r.deleted} placeholder="Naam"
                    autoFocus={r.id == null && r.name === ''}
                    onChange={e => update(r.key, { name: e.target.value })}
                    style={{ width: '100%', minWidth: 140 }}
                  />
                  {r.id != null && !r.deleted && r.route !== r.orig.route && (
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>Nagekeken toetsen houden de oude kleur.</div>
                  )}
                </td>
                <td>
                  {r.deleted ? null : (
                    <RoutePicker
                      route={r.route} studentName={r.name || 'nieuwe leerling'}
                      hint={r.id == null ? 'Kleur van de nieuwe leerling.' : 'Nagekeken toetsen houden hun oude kleur.'}
                      onSwitch={route => update(r.key, { route })}
                    />
                  )}
                </td>
                <td>
                  <select value={r.cls} disabled={r.deleted} onChange={e => update(r.key, { cls: e.target.value })}>
                    <option value={THIS}>{name.trim() || className}</option>
                    {otherClasses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button" className={`btn btn-sm ${r.deleted ? 'btn-secondary' : 'btn-icon-danger'}`}
                    title={r.deleted ? 'Niet verwijderen' : 'Leerling verwijderen'}
                    onClick={() => removeRow(r)}
                  >{r.deleted ? 'Terug' : '🗑'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={addRow}>+ Leerling toevoegen</button>

        {error && <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
        {confirmDelete && deleting.length > 0 && (
          <div style={{ background: '#fff3f3', border: '1px solid #f5c6cb', borderRadius: 6, padding: 12, marginTop: 12, color: '#721c24', fontSize: 13 }}>
            Je verwijdert {deleting.map(r => r.orig.name).join(', ')} met al {deleting.length === 1 ? 'zijn of haar' : 'hun'} resultaten. Dit kan niet ongedaan worden gemaakt. Klik nogmaals op Opslaan om door te gaan.
          </div>
        )}
        <div className="gap-8" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuleren</button>
          <button className={`btn ${confirmDelete ? 'btn-danger' : 'btn-primary'}`} onClick={save} disabled={busy}>
            {busy ? 'Bezig…' : confirmDelete ? 'Ja, opslaan en verwijderen' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
