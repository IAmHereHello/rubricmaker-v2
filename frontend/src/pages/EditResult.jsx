import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import CijferInput from '../components/CijferInput.jsx'
import StarInput from '../components/StarInput.jsx'
import { pyramidLabel } from '../constants.js'
import {
  isApplicableForQuestion,
  displayCijfer,
  formatCijfer,
  formatCijferFormula,
  gradeLabel,
  computeGrade,
  withSessionRoutes,
} from '../utils/gradingLogic.js'

const GRADE_OPTIONS = [
  { value: 'expert',          label: 'Expert' },
  { value: 'beheerst',        label: 'Beheerst' },
  { value: 'in_ontwikkeling', label: 'In Ontwikkeling' },
]
const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }
const GRADE_BG    = { expert: '#e8f5e9', beheerst: '#e8f0fc', in_ontwikkeling: '#fff3e0' }

// Parse a score field: '' → null, a whole number within 0..max → number, otherwise undefined (invalid)
function parsePoints(text, max) {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined
}

// Edit one student's scores after grading, followed by the controleronde for that student.
// Nothing is saved until Opslaan; Annuleren discards all changes.
export default function EditResult() {
  const { id, studentId } = useParams()
  const navigate = useNavigate()
  const sid = Number(studentId)

  const [session, setSession] = useState(null)
  const [test, setTest]       = useState(null)
  const [student, setStudent] = useState(null)
  const [saved, setSaved]     = useState({})      // question_id → stored score
  const [stored, setStored]   = useState(null)    // stored StudentGrade or null
  const [draft, setDraft]     = useState({})      // question_id → { points: string, comment: string }
  const [stars, setStars]     = useState(0)
  const [grade, setGrade]     = useState(null)
  const [isManual, setIsManual] = useState(false)
  const [ackFor, setAckFor]   = useState(null)    // computed grade the teacher chose to ignore
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [sess, sc, grades] = await Promise.all([
          api.getSession(id),
          api.getSessionScores(id),
          api.getSessionGrades(id),
        ])
        const [t, studs] = await Promise.all([api.getTest(sess.test_id), api.getStudents(sess.class_name)])
        const stud = withSessionRoutes(studs, sess).find(s => s.id === sid)
        if (!stud) { setError('Leerling niet gevonden in deze klas.'); return }

        const byQ = {}
        for (const s of sc) if (s.student_id === sid) byQ[s.question_id] = s
        const d = {}
        for (const q of t.questions) {
          const s = byQ[q.id]
          d[q.id] = {
            points: s && !s.excluded && s.points !== null ? String(s.points) : '',
            comment: s?.comment || '',
          }
        }
        const g = grades.find(x => x.student_id === sid) ?? null

        setSession(sess)
        setTest(t)
        setStudent(stud)
        setSaved(byQ)
        setDraft(d)
        setStored(g)
        setStars(g?.stars || 0)
        setGrade(g?.grade ?? null)
        setIsManual(g?.is_manual ?? false)
      } catch {
        setError('Fout bij laden van resultaat.')
      }
    }
    load()
  }, [id, sid])

  // Questions follow the student's current route (it may have changed since grading)
  const rows = useMemo(() => {
    if (!test || !student) return []
    return test.questions.map((q, i) => {
      const applicable = isApplicableForQuestion(student, q)
      const d = draft[q.id] || { points: '', comment: '' }
      return { q, nr: i + 1, applicable, ...d, value: applicable ? parsePoints(d.points, q.max_score) : null }
    })
  }, [test, student, draft])

  const invalid = rows.some(r => r.applicable && r.value === undefined)

  // Draft scores in the shape computeGrade expects
  const draftScoreMap = useMemo(() => {
    const m = {}
    for (const r of rows) {
      m[`${r.q.id}-${sid}`] = { points: r.applicable && r.value !== undefined ? r.value : null, excluded: !r.applicable }
    }
    return m
  }, [rows, sid])

  const totals = useMemo(() => {
    let scored = 0, max = 0
    for (const r of rows) {
      if (!r.applicable) continue
      max += r.q.max_score
      if (typeof r.value === 'number') scored += r.value
    }
    return { scored, max }
  }, [rows])

  const computed = useMemo(() => {
    if (!test || !student || invalid) return null
    return computeGrade(student, test.questions, draftScoreMap, test.grading_method, test.grade_config, stars)
  }, [test, student, draftScoreMap, stars, invalid])

  const hasGrading = !!test?.grading_method
  const shownGrade = grade ?? computed
  // The calculated result no longer matches the result on record: the teacher has to choose
  const needsChoice = hasGrading && computed != null && grade != null && grade !== computed && ackFor !== computed

  const goalSummary = useMemo(() => {
    if (!test || !student || test.grading_method !== 'goals') return null
    const groups = {}
    for (const r of rows) {
      if (!r.applicable || !r.q.learning_goal || r.q.learning_goal_threshold == null) continue
      ;(groups[r.q.learning_goal] ||= []).push(r)
    }
    return Object.entries(groups).map(([name, rs]) => ({
      name,
      achieved: rs.every(r => typeof r.value === 'number' && r.value >= r.q.learning_goal_threshold),
    }))
  }, [test, student, rows])

  const thresholdText = useMemo(() => {
    if (!student || !test?.grading_method || !test?.grade_config) return null
    if (test.grading_method === 'cijfer') return `Cijfer = ${formatCijferFormula(test.grade_config)}`
    const cfg = test.grade_config[student.route]
    if (!cfg) return null
    if (test.grading_method === 'points') return `Beheerst vanaf ${cfg.beheerst}%, Expert vanaf ${cfg.expert}%`
    const label = n => `${n} leerdoel${n === 1 ? '' : 'en'}`
    return `Beheerst vanaf ${label(cfg.beheerst)}, Expert vanaf ${label(cfg.expert)}`
  }, [student?.route, test?.grading_method, test?.grade_config])

  function setField(qid, field, value) {
    setDraft(d => ({ ...d, [qid]: { ...d[qid], [field]: value } }))
  }

  function pickGrade(g) {
    setGrade(g)
    setIsManual(g !== computed)
    setAckFor(computed)
  }

  function applyComputed() {
    setGrade(computed)
    setIsManual(false)
    setAckFor(null)
  }

  async function handleSave() {
    if (invalid || needsChoice) return
    setSaving(true)
    setError('')
    try {
      for (const r of rows) {
        const prev = saved[r.q.id]
        const comment = r.comment.trim() || null
        if (r.applicable) {
          const unchanged = prev && !prev.excluded && prev.points === r.value && (prev.comment || null) === comment
          if (unchanged || (!prev && r.value === null && !comment)) continue
          await api.upsertScore({
            session_id: Number(id), student_id: sid, question_id: r.q.id,
            points: r.value, excluded: false, comment,
          })
        } else if (prev && !prev.excluded) {
          // Route changed: keep the points but stop counting them
          await api.upsertScore({
            session_id: Number(id), student_id: sid, question_id: r.q.id,
            points: prev.points, excluded: true, comment: prev.comment ?? null,
          })
        }
      }
      const finalGrade = grade ?? computed
      if (hasGrading && finalGrade != null) {
        await api.upsertStudentGrade(Number(id), sid, {
          grade: finalGrade,
          is_manual: finalGrade !== computed,
          review_done: true,
          stars: test.grading_method === 'cijfer' ? stars : 0,
        })
      }
      navigate(-1)
    } catch {
      setError('Opslaan mislukt.')
      setSaving(false)
    }
  }

  if (!test || !student || !session) return <div className="page"><p>{error || 'Laden...'}</p></div>

  const cell = { padding: '7px 12px' }

  return (
    <div className="page" style={{ maxWidth: 860, marginLeft: 'auto', marginRight: 'auto' }}>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
        Resultaat bewerken · {test.name} · Klas {session.class_name}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>{student.name}</h1>
        <RouteBadge route={student.route} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f5f7fb' }}>
              <th style={{ ...cell, textAlign: 'left' }}>V#</th>
              <th style={{ ...cell, textAlign: 'left' }}>Domein</th>
              <th style={{ ...cell, textAlign: 'left' }}>Niveaulaag</th>
              <th style={{ ...cell, textAlign: 'right' }}>Max</th>
              <th style={{ ...cell, textAlign: 'right' }}>Score</th>
              <th style={{ ...cell, textAlign: 'left' }}>Opmerking</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const prev = saved[r.q.id]
              const changed = r.applicable && (prev && !prev.excluded ? prev.points : null) !== r.value
              return (
                <tr key={r.q.id} style={{ borderTop: '1px solid #eef0f4', background: changed ? '#fffbea' : undefined }}>
                  <td style={{ ...cell, color: '#888' }}>V{r.nr}</td>
                  <td style={cell}>{r.q.domain || '—'}</td>
                  <td style={cell}>{pyramidLabel(r.q.pyramid_level)}</td>
                  <td style={{ ...cell, textAlign: 'right', color: '#888' }}>{r.q.max_score}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {r.applicable ? (
                      <input
                        type="number" min={0} max={r.q.max_score}
                        value={r.points}
                        onChange={e => setField(r.q.id, 'points', e.target.value)}
                        style={{ width: 64, textAlign: 'right', borderColor: r.value === undefined ? '#c0392b' : undefined }}
                      />
                    ) : (
                      <span className="text-muted">n.v.t.</span>
                    )}
                  </td>
                  <td style={cell}>
                    {r.applicable && (
                      <input
                        type="text"
                        value={r.comment}
                        onChange={e => setField(r.q.id, 'comment', e.target.value)}
                        placeholder="—"
                        style={{ width: '100%', minWidth: 140, fontSize: 12 }}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #dde', background: '#f5f7fb' }}>
              <td colSpan={3} style={{ ...cell, fontWeight: 700 }}>Totaal</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{totals.max}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>
                {totals.scored}
                {totals.max > 0 && (
                  <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                    ({Math.round(totals.scored / totals.max * 100)}%)
                  </span>
                )}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {invalid && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          Een score is ongeldig. Vul een heel getal in tussen 0 en het maximum.
        </div>
      )}

      {goalSummary && goalSummary.length > 0 && (
        <div className="card" style={{ marginTop: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
            Leerdoelen
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {goalSummary.map(({ name, achieved }) => (
              <span key={name} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13,
                padding: '3px 8px', borderRadius: 4,
                background: achieved ? '#e8f5e9' : '#fdecea', color: achieved ? '#2e7d32' : '#c62828',
              }}>
                {achieved ? '✓' : '✗'} {name}
              </span>
            ))}
          </div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
            {goalSummary.filter(g => g.achieved).length} van {goalSummary.length} leerdoelen behaald
          </div>
        </div>
      )}

      {hasGrading && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
            Controleronde · Beoordeling
          </div>

          {thresholdText && (
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Normering ({student.route}): {thresholdText}
            </div>
          )}

          {needsChoice && (
            <div style={{ background: '#fff3cd', border: '2px solid #e6a700', borderRadius: 6, padding: '12px 14px', marginBottom: 14, color: '#6b4e00' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Het resultaat klopt niet meer met de scores.
              </div>
              <div style={{ fontSize: 14, marginBottom: 10 }}>
                Nu: <strong>{gradeLabel(grade)}</strong> · Berekend: <strong>{gradeLabel(computed)}</strong>
                {stored?.is_manual && <span style={{ marginLeft: 6, fontSize: 12 }}>(het huidige resultaat is handmatig gekozen)</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={applyComputed}>Wijzig naar {gradeLabel(computed)}</button>
                <button className="btn btn-secondary" onClick={() => { setIsManual(true); setAckFor(computed) }}>
                  Houd {gradeLabel(grade)}
                </button>
              </div>
            </div>
          )}

          {test.grading_method !== 'cijfer' && totals.max > 0 && (
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              Cijfer: <strong>{formatCijfer(displayCijfer(test, totals.scored, totals.max, null))}</strong>
              <span className="text-muted" style={{ marginLeft: 6, fontSize: 12 }}>(punten / totaal × 9 + 1)</span>
            </div>
          )}

          {test.grading_method === 'cijfer' ? (
            <>
              <StarInput value={stars} onChange={setStars} />
              <CijferInput value={shownGrade} onChange={pickGrade} />
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {GRADE_OPTIONS.map(opt => {
                const active = shownGrade === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => pickGrade(opt.value)}
                    style={{
                      padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                      border: active ? `2px solid ${GRADE_COLORS[opt.value]}` : '2px solid #dde',
                      background: active ? GRADE_BG[opt.value] : '#fff',
                      color: active ? GRADE_COLORS[opt.value] : '#555',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}

          {!needsChoice && isManual && computed && shownGrade !== computed && (
            <div style={{ fontSize: 12, color: '#888' }}>
              Automatisch: <strong>{gradeLabel(computed)}</strong>
              {' · '}
              <button
                onClick={applyComputed}
                style={{ background: 'none', border: 'none', color: '#1a6ecc', cursor: 'pointer', padding: 0, fontSize: 12 }}
              >
                Herstel automatische beoordeling
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grade-nav-buttons" style={{ marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} disabled={saving}>
          Annuleren
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || invalid || needsChoice || (hasGrading && shownGrade == null)}
          title={needsChoice ? 'Kies eerst welk resultaat geldt' : undefined}
        >
          {saving ? 'Opslaan…' : 'Opslaan ✓'}
        </button>
      </div>
    </div>
  )
}
