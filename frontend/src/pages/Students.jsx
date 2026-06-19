import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'

const ROUTES = ['oranje', 'geel', 'blauw']
const EMPTY = { name: '', class_name: '', route: 'oranje' }

export default function Students() {
  const [students, setStudents] = useState([])
  const [editing, setEditing] = useState(null)   // null | student object | 'new'
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try { setStudents(await api.getStudents()) }
    catch { setError('Fout bij laden van leerlingen.') }
  }

  function startNew() { setEditing('new'); setForm(EMPTY); setError('') }
  function startEdit(s) { setEditing(s); setForm({ name: s.name, class_name: s.class_name, route: s.route }); setError('') }
  function cancel() { setEditing(null); setError('') }

  async function save() {
    if (!form.name.trim() || !form.class_name.trim()) {
      setError('Naam en klas zijn verplicht.'); return
    }
    try {
      if (editing === 'new') {
        await api.createStudent(form)
      } else {
        await api.updateStudent(editing.id, form)
      }
      setEditing(null)
      await load()
    } catch { setError('Opslaan mislukt.') }
  }

  async function remove(id) {
    if (!confirm('Leerling verwijderen?')) return
    try { await api.deleteStudent(id); await load() }
    catch { setError('Verwijderen mislukt.') }
  }

  // Group by class
  const byClass = students.reduce((acc, s) => {
    ;(acc[s.class_name] = acc[s.class_name] || []).push(s)
    return acc
  }, {})

  const classes = Object.keys(byClass).sort()

  return (
    <div className="page">
      <div className="page-header">
        <h1>Leerlingen</h1>
        <button className="btn btn-primary" onClick={startNew}>+ Leerling toevoegen</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {editing && (
        <div className="card">
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
            </div>
            <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
              <button className="btn btn-primary" onClick={save}>Opslaan</button>
              <button className="btn btn-secondary" onClick={cancel}>Annuleren</button>
            </div>
          </div>
        </div>
      )}

      {classes.length === 0 && !editing && (
        <div className="card text-muted">Nog geen leerlingen.</div>
      )}

      {classes.map(cls => (
        <div key={cls} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ fontSize: 15 }}>Klas {cls}</strong>
            <Link to={`/classes/${cls}/overview`} className="btn btn-secondary btn-sm">Klasoverzicht →</Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Route</th>
                <th style={{ width: 140 }}>Acties</th>
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
                  <td><RouteBadge route={s.route} /></td>
                  <td>
                    <div className="gap-8">
                      <button className="btn btn-secondary btn-sm" onClick={() => startEdit(s)}>Bewerken</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(s.id)}>Verwijder</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
