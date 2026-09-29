import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as api from '../api.js'
import { PYRAMID_LEVELS, pyramidLabel, DOMAINS } from '../constants.js'
import { getCijferConfig } from '../utils/gradingLogic.js'

const ROUTES_ALL = ['oranje', 'geel', 'blauw']
const EMPTY_Q = { description: '', answer: '', max_score: 1, routes: ['oranje', 'geel', 'blauw'], domain: DOMAINS[0], pyramid_level: PYRAMID_LEVELS[0].value, learning_goal: '', learning_goal_threshold: '' }
const EMPTY_CONFIG = { oranje: { beheerst: '', expert: '' }, geel: { beheerst: '', expert: '' }, blauw: { beheerst: '', expert: '' } }

export default function TestEdit() {
  const { id } = useParams()
  const [test, setTest] = useState(null)
  const [editingQ, setEditingQ] = useState(null)   // null | 'new' | question obj
  const [qForm, setQForm] = useState(EMPTY_Q)
  const [nameEdit, setNameEdit] = useState(false)
  const [testName, setTestName] = useState('')
  const [error, setError] = useState('')

  // Grading config state
  const [gradingMethod, setGradingMethod] = useState(null)   // null | 'points' | 'goals'
  const [gradeConfig, setGradeConfig] = useState(EMPTY_CONFIG)
  const [cijferForm, setCijferForm] = useState({ multiplier: '9', offset: '1' })
  const [gradingError, setGradingError] = useState('')
  const [gradingSaved, setGradingSaved] = useState(false)

  useEffect(() => {
    api.getTest(id)
      .then(t => {
        setTest(t)
        setTestName(t.name)
        if (t.grading_method) {
          setGradingMethod(t.grading_method)
          if (t.grading_method === 'cijfer') {
            const c = getCijferConfig(t.grade_config)
            setCijferForm({ multiplier: String(c.multiplier), offset: String(c.offset) })
          } else if (t.grade_config) {
            setGradeConfig({
              oranje: { beheerst: t.grade_config.oranje?.beheerst ?? '', expert: t.grade_config.oranje?.expert ?? '' },
              geel:   { beheerst: t.grade_config.geel?.beheerst   ?? '', expert: t.grade_config.geel?.expert   ?? '' },
              blauw:  { beheerst: t.grade_config.blauw?.beheerst  ?? '', expert: t.grade_config.blauw?.expert  ?? '' },
            })
          }
        }
      })
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
      learning_goal: q.learning_goal || '',
      learning_goal_threshold: q.learning_goal_threshold ?? '',
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
    const maxScore = parseInt(qForm.max_score)
    const goalName = qForm.learning_goal.trim() || null
    const threshold = qForm.learning_goal_threshold !== '' ? parseInt(qForm.learning_goal_threshold) : null
    if ((goalName && threshold === null) || (!goalName && threshold !== null)) {
      setError('Vul zowel een leerdoelnaam als een drempelwaarde in, of laat beide leeg.')
      return
    }
    if (threshold !== null && (isNaN(threshold) || threshold < 1 || threshold > maxScore)) {
      setError(`Drempelwaarde moet tussen 1 en ${maxScore} liggen.`)
      return
    }
    const payload = { ...qForm, max_score: maxScore, learning_goal: goalName, learning_goal_threshold: threshold }
    try {
      if (editingQ === 'new') {
        await api.createQuestion({ ...payload, test_id: parseInt(id), order: test.questions.length })
      } else {
        await api.updateQuestion(editingQ.id, payload)
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

  async function saveGrading() {
    setGradingError('')
    if (gradingMethod === 'cijfer') {
      const m = parseFloat(String(cijferForm.multiplier).replace(',', '.'))
      const o = parseFloat(String(cijferForm.offset).replace(',', '.'))
      if (isNaN(m) || isNaN(o)) { setGradingError('Vul beide waarden van de formule in.'); return }
      if (m <= 0) { setGradingError('De vermenigvuldiger moet groter zijn dan 0.'); return }
    } else if (gradingMethod) {
      for (const route of ROUTES_ALL) {
        const b = parseInt(gradeConfig[route].beheerst)
        const e = parseInt(gradeConfig[route].expert)
        if (isNaN(b) || isNaN(e)) { setGradingError('Vul alle drempelwaarden in.'); return }
        if (b >= e) { setGradingError(`Beheerst-drempel moet lager zijn dan Expert-drempel (${route}).`); return }
        if (gradingMethod === 'points' && (b < 0 || b > 100 || e < 0 || e > 100)) {
          setGradingError('Percentages moeten tussen 0 en 100 liggen.'); return
        }
        if (gradingMethod === 'goals' && (b < 1 || e < 1)) {
          setGradingError('Aantal leerdoelen moet minimaal 1 zijn.'); return
        }
      }
    }

    const payload = gradingMethod === 'cijfer'
      ? {
          grading_method: 'cijfer',
          grade_config: {
            cijfer: {
              multiplier: parseFloat(String(cijferForm.multiplier).replace(',', '.')),
              offset: parseFloat(String(cijferForm.offset).replace(',', '.')),
            },
          },
        }
      : gradingMethod
      ? {
          grading_method: gradingMethod,
          grade_config: {
            oranje: { beheerst: parseInt(gradeConfig.oranje.beheerst), expert: parseInt(gradeConfig.oranje.expert) },
            geel:   { beheerst: parseInt(gradeConfig.geel.beheerst),   expert: parseInt(gradeConfig.geel.expert) },
            blauw:  { beheerst: parseInt(gradeConfig.blauw.beheerst),  expert: parseInt(gradeConfig.blauw.expert) },
          },
        }
      : { grading_method: null, grade_config: null }

    try {
      const updated = await api.updateTest(id, payload)
      setTest(t => ({ ...t, grading_method: updated.grading_method, grade_config: updated.grade_config }))
      setGradingSaved(true)
      setTimeout(() => setGradingSaved(false), 2000)
    } catch { setGradingError('Opslaan mislukt.') }
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

          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Leerdoel <span className="text-muted" style={{ fontWeight: 400 }}>(optioneel)</span></label>
              <input
                type="text"
                value={qForm.learning_goal}
                onChange={e => setQForm(f => ({ ...f, learning_goal: e.target.value }))}
                placeholder="bijv. Kwadratische vergelijkingen"
                list="goal-names-list"
                style={{ width: '100%' }}
              />
              <datalist id="goal-names-list">
                {[...new Set(
                  test.questions
                    .filter(q => q.learning_goal && (editingQ === 'new' || q.id !== editingQ.id))
                    .map(q => q.learning_goal)
                )].map(name => <option key={name} value={name} />)}
              </datalist>
            </div>

            <div className="field">
              <label>Drempel (min. punten)</label>
              <input
                type="number" min={1} max={qForm.max_score || 100}
                value={qForm.learning_goal_threshold}
                onChange={e => setQForm(f => ({ ...f, learning_goal_threshold: e.target.value }))}
                placeholder="—"
                style={{ width: 80 }}
              />
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
                {q.learning_goal && (
                  <span style={{ fontSize: 12, background: '#e8f0fc', borderRadius: 4, padding: '2px 7px', color: '#1a6ecc' }}>
                    {q.learning_goal}{q.learning_goal_threshold != null ? ` ≥${q.learning_goal_threshold}` : ''}
                  </span>
                )}
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

      {/* Grading configuration */}
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#1e3a5f' }}>Beoordeling</h2>

        <div className="field" style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600 }}>Beoordelingsmethode</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {[
              { value: null, label: 'Geen beoordeling' },
              { value: 'points', label: 'Op basis van punten (%)' },
              { value: 'goals', label: 'Op basis van leerdoelen (aantal behaald)' },
              { value: 'cijfer', label: 'Cijfer (1 - 10)' },
            ].map(opt => (
              <label key={String(opt.value)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="grading_method"
                  checked={gradingMethod === opt.value}
                  onChange={() => { setGradingMethod(opt.value); setGradingError('') }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {gradingMethod === 'cijfer' && (
          <div style={{ marginBottom: 16, fontSize: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Cijfer = punten / totaal ×</span>
              <input
                type="text" inputMode="decimal" value={cijferForm.multiplier}
                onChange={e => setCijferForm(f => ({ ...f, multiplier: e.target.value }))}
                style={{ width: 64 }}
              />
              <span>+</span>
              <input
                type="text" inputMode="decimal" value={cijferForm.offset}
                onChange={e => setCijferForm(f => ({ ...f, offset: e.target.value }))}
                style={{ width: 64 }}
              />
            </div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
              Standaard: × 9 + 1. Het cijfer wordt afgerond op 1 decimaal en kan per leerling handmatig worden aangepast.
            </div>
          </div>
        )}

        {gradingMethod && gradingMethod !== 'cijfer' && (
          <div style={{ marginBottom: 16 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: '#555' }}>Route</th>
                  <th style={{ padding: '4px 12px', color: '#555' }}>
                    Beheerst {gradingMethod === 'points' ? '(% ≥)' : '(doelen ≥)'}
                  </th>
                  <th style={{ padding: '4px 12px', color: '#555' }}>
                    Expert {gradingMethod === 'points' ? '(% ≥)' : '(doelen ≥)'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROUTES_ALL.map(route => (
                  <tr key={route}>
                    <td style={{ padding: '6px 12px 6px 0' }}>
                      <span className={`badge badge-${route}`}>{route}</span>
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <input
                        type="number" min={0} max={gradingMethod === 'points' ? 100 : undefined}
                        value={gradeConfig[route].beheerst}
                        onChange={e => setGradeConfig(c => ({ ...c, [route]: { ...c[route], beheerst: e.target.value } }))}
                        style={{ width: 72 }}
                      />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <input
                        type="number" min={0} max={gradingMethod === 'points' ? 100 : undefined}
                        value={gradeConfig[route].expert}
                        onChange={e => setGradeConfig(c => ({ ...c, [route]: { ...c[route], expert: e.target.value } }))}
                        style={{ width: 72 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {gradingError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{gradingError}</div>}
        {gradingSaved && <div className="alert" style={{ background: '#e8f5e9', border: '1px solid #81c784', borderRadius: 6, padding: '8px 12px', marginBottom: 12, color: '#2e7d32' }}>Beoordelingsinstelling opgeslagen.</div>}

        <button className="btn btn-primary btn-sm" onClick={saveGrading}>Opslaan</button>
      </div>
    </div>
  )
}
