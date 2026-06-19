import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as api from '../api.js'
import { PYRAMID_LEVELS, pyramidLabel, DOMAINS } from '../constants.js'

const ROUTES_ALL = ['oranje', 'geel', 'blauw']
const EMPTY_Q = { description: '', answer: '', max_score: 1, routes: ['oranje', 'geel', 'blauw'], domain: DOMAINS[0], pyramid_level: PYRAMID_LEVELS[0].value }

export default function TestEdit() {
  const { id } = useParams()
  const [test, setTest] = useState(null)
  const [editingQ, setEditingQ] = useState(null)   // null | 'new' | question obj
  const [qForm, setQForm] = useState(EMPTY_Q)
  const [nameEdit, setNameEdit] = useState(false)
  const [testName, setTestName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.getTest(id)
      .then(t => { setTest(t); setTestName(t.name) })
      .catch(() => setError('Fout bij laden van toets.'))
  }, [id])

  async function saveName() {
    if (!testName.trim()) { setError('Naam mag niet leeg zijn.'); return }
    try {
      const updated = await api.updateTest(id, { name: testName.trim() })
      setTest(t => ({ ...t, name: updated.name }))
      setTestName(updated.name)
      setNameEdit(false)
    } catch { setError('Opslaan mislukt.') }
  }

  function startNewQ() {
    const nextOrder = test.questions.length
    setQForm({ ...EMPTY_Q, order: nextOrder })
    setEditingQ('new')
    setError('')
  }

  function startEditQ(q) {
    setQForm({
      description: q.description,
      answer: q.answer,
      max_score: q.max_score,
      routes: q.routes || [],
      domain: q.domain || '',
      pyramid_level: q.pyramid_level,
    })
    setEditingQ(q)
    setError('')
  }

  function cancelQ() { setEditingQ(null); setError('') }

  function toggleRoute(r) {
    setQForm(f => {
      const has = f.routes.includes(r)
      return { ...f, routes: has ? f.routes.filter(x => x !== r) : [...f.routes, r] }
    })
  }

  async function saveQ() {
    if (!qForm.description.trim()) { setError('Omschrijving is verplicht.'); return }
    if (!qForm.domain) { setError('Domein is verplicht.'); return }
    if (qForm.routes.length === 0) { setError('Selecteer minimaal één route.'); return }
    try {
      if (editingQ === 'new') {
        await api.createQuestion({ ...qForm, test_id: parseInt(id), order: test.questions.length, max_score: parseInt(qForm.max_score) })
      } else {
        await api.updateQuestion(editingQ.id, { ...qForm, max_score: parseInt(qForm.max_score) })
      }
      const t = await api.getTest(id)
      setTest(t)
      setEditingQ(null)
    } catch { setError('Opslaan mislukt.') }
  }

  async function removeQ(qid) {
    if (!confirm('Vraag verwijderen?')) return
    try {
      await api.deleteQuestion(qid)
      setTest(await api.getTest(id))
    } catch { setError('Verwijderen mislukt.') }
  }

  async function moveQ(idx, dir) {
    const qs = [...test.questions]
    const targetIdx = idx + dir
    if (targetIdx < 0 || targetIdx >= qs.length) return
    ;[qs[idx], qs[targetIdx]] = [qs[targetIdx], qs[idx]]
    const reorderItems = qs.map((q, i) => ({ question_id: q.id, order: i }))
    try {
      await api.reorderQuestions(reorderItems)
      setTest(await api.getTest(id))
    } catch { setError('Volgorde opslaan mislukt.') }
  }

  if (!test) return <div className="page"><p>Laden...</p></div>

  const levelClass = (l) => `level-pill level-${l}`

  return (
    <div className="page">
      <div className="page-header">
        <div>
          {nameEdit ? (
            <div className="gap-8">
              <input
                type="text" value={testName}
                onChange={e => setTestName(e.target.value)}
                style={{ fontSize: 20, fontWeight: 700, width: 320 }}
              />
              <button className="btn btn-primary btn-sm" onClick={saveName}>OK</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setTestName(test.name); setNameEdit(false) }}>Annuleer</button>
            </div>
          ) : (
            <h1 style={{ cursor: 'default' }}>
              {test.name}
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 12 }} onClick={() => setNameEdit(true)}>✏️</button>
            </h1>
          )}
        </div>
        <Link to="/tests" className="btn btn-secondary">← Terug</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Question form */}
      {editingQ && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>
            {editingQ === 'new' ? 'Nieuwe vraag' : 'Vraag bewerken'}
          </h2>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>Omschrijving</label>
            <textarea
              value={qForm.description}
              onChange={e => setQForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>Modelantwoord</label>
            <textarea
              value={qForm.answer}
              onChange={e => setQForm(f => ({ ...f, answer: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="form-row">
            <div className="field">
              <label>Max. punten</label>
              <input
                type="number" min={1} max={100} value={qForm.max_score}
                onChange={e => setQForm(f => ({ ...f, max_score: e.target.value }))}
                style={{ width: 80 }}
              />
            </div>

            <div className="field">
              <label>Niveaulaag (De Lange)</label>
              <select value={qForm.pyramid_level} onChange={e => setQForm(f => ({ ...f, pyramid_level: e.target.value }))}>
                {PYRAMID_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Domein</label>
              <select
                value={qForm.domain}
                onChange={e => setQForm(f => ({ ...f, domain: e.target.value }))}
                style={{ width: 180 }}
              >
                {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>Routes</label>
            <div className="checkbox-row" style={{ marginTop: 6 }}>
              {ROUTES_ALL.map(r => (
                <label key={r}>
                  <input
                    type="checkbox"
                    checked={qForm.routes.includes(r)}
                    onChange={() => toggleRoute(r)}
                  />
                  <span className={`badge badge-${r}`}>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="gap-8">
            <button className="btn btn-primary" onClick={saveQ}>Opslaan</button>
            <button className="btn btn-secondary" onClick={cancelQ}>Annuleren</button>
          </div>
        </div>
      )}

      {/* Questions list */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong>{test.questions.length} {test.questions.length === 1 ? 'vraag' : 'vragen'}</strong>
          <button className="btn btn-primary btn-sm" onClick={startNewQ} disabled={!!editingQ}>+ Vraag toevoegen</button>
        </div>

        {test.questions.length === 0 && (
          <p className="text-muted">Nog geen vragen. Voeg de eerste vraag toe.</p>
        )}

        {test.questions.map((q, idx) => (
          <div key={q.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: idx < test.questions.length - 1 ? '1px solid #eef0f4' : 'none' }}>
            {/* Order buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => moveQ(idx, -1)} disabled={idx === 0} style={{ padding: '2px 8px' }}>▲</button>
              <button className="btn btn-secondary btn-sm" onClick={() => moveQ(idx, 1)} disabled={idx === test.questions.length - 1} style={{ padding: '2px 8px' }}>▼</button>
            </div>

            {/* Content */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#888', fontSize: 13 }}>V{idx + 1}</span>
                <span className={levelClass(q.pyramid_level)}>{pyramidLabel(q.pyramid_level)}</span>
                <span style={{ fontSize: 12, background: '#f0f3f8', borderRadius: 4, padding: '2px 7px', color: '#555' }}>{q.domain || '—'}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#555' }}>{q.max_score} pt</span>
              </div>
              <div style={{ fontSize: 14, marginBottom: 4 }}>{q.description}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(q.routes || []).map(r => <span key={r} className={`badge badge-${r}`}>{r}</span>)}
              </div>
            </div>

            {/* Actions */}
            <div className="gap-8">
              <button className="btn btn-secondary btn-sm" onClick={() => startEditQ(q)} disabled={!!editingQ}>Bewerken</button>
              <button className="btn btn-danger btn-sm" onClick={() => removeQ(q.id)} disabled={!!editingQ}>Verwijder</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
