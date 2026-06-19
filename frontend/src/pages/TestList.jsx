import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../api.js'

export default function TestList() {
  const [tests, setTests] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { load() }, [])

  async function load() {
    try { setTests(await api.getTests()) }
    catch { setError('Fout bij laden van toetsen.') }
  }

  async function create() {
    if (!name.trim()) { setError('Naam is verplicht.'); return }
    try {
      const t = await api.createTest({ name: name.trim() })
      navigate(`/tests/${t.id}/edit`)
    } catch { setError('Aanmaken mislukt.') }
  }

  async function remove(id) {
    if (!confirm('Toets en alle bijbehorende sessies verwijderen?')) return
    try { await api.deleteTest(id); await load() }
    catch { setError('Verwijderen mislukt.') }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Toetsen</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="form-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Naam nieuwe toets</label>
            <input
              type="text" value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder="bijv. Hoofdstuk 3 — Algebra"
              onKeyDown={e => e.key === 'Enter' && create()}
            />
          </div>
          <button className="btn btn-primary" onClick={create}>Aanmaken & bewerken</button>
        </div>
      </div>

      {tests.length === 0 && (
        <div className="card text-muted">Nog geen toetsen.</div>
      )}

      {tests.map(t => (
        <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
            <div className="text-muted" style={{ marginTop: 2 }}>
              Aangemaakt op {new Date(t.created_at).toLocaleDateString('nl-NL')}
            </div>
          </div>
          <div className="gap-8">
            <Link to={`/tests/${t.id}/edit`} className="btn btn-secondary btn-sm">Bewerken</Link>
            <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>Verwijder</button>
          </div>
        </div>
      ))}
    </div>
  )
}
