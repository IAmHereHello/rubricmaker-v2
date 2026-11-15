import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import CijferInput from '../components/CijferInput.jsx'
import StarInput from '../components/StarInput.jsx'
import { pyramidLabel } from '../constants.js'
import { isApplicableForQuestion, displayCijfer, formatCijfer, calcCijfer, shiftCijfer, formatCijferFormula, gradeLabel, computeGrade, withSessionRoutes } from '../utils/gradingLogic.js'
import MathText from '../components/MathText.jsx'

const GRADE_OPTIONS = [
  { value: 'expert',          label: 'Expert' },
  { value: 'beheerst',        label: 'Beheerst' },
  { value: 'in_ontwikkeling', label: 'In Ontwikkeling' },
]
const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }
const GRADE_BG    = { expert: '#e8f5e9', beheerst: '#e8f0fc', in_ontwikkeling: '#fff3e0' }


export default function InhalerGrade() {
  const { id, studentId } = useParams()
  const navigate = useNavigate()

  const [session, setSession]   = useState(null)
  const [test, setTest]         = useState(null)
  const [student, setStudent]   = useState(null)
  const [scoreMap, setScoreMap] = useState({})
  const [qIdx, setQIdx]         = useState(0)
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [phase, setPhase]       = useState('loading')  // 'loading' | 'grading' | 'review'

  // Review state
  const [manualGrade, setManualGrade] = useState(null)
  const [isManual, setIsManual]       = useState(false)
  const [stars, setStars]             = useState(0)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')

  const scoreInputRef = useRef(null)
  const editRef       = useRef(null)

  // ── Load ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [sess, sc] = await Promise.all([api.getSession(id), api.getSessionScores(id)])
        const [t, studs] = await Promise.all([
          api.getTest(sess.test_id),
          api.getStudents(sess.class_name),
        ])

        const sm = {}
        for (const s of sc) sm[`${s.question_id}-${s.student_id}`] = s

        const stud = withSessionRoutes(studs, sess).find(s => s.id === parseInt(studentId))
        if (!stud) { setError('Leerling niet gevonden.'); return }

        setSession(sess)
        setTest(t)
        setStudent(stud)

        // Already completed → back to inhalers
        if ((sess.student_order || []).includes(stud.id)) {
          navigate('/inhalers', { replace: true })
          return
        }

        // Find first applicable question without a non-null score (resume point)
        let resumeQ = -1
        for (let i = 0; i < t.questions.length; i++) {
          if (!isApplicableForQuestion(stud, t.questions[i])) continue
          const existing = sm[`${t.questions[i].id}-${stud.id}`]
          if (!existing || existing.points === null) { resumeQ = i; break }
        }

        if (resumeQ === -1) {
          // All applicable questions already graded.
          // Ensure excluded records exist for non-applicable questions so report
          // data is complete for this student.
          for (const q of t.questions) {
            if (isApplicableForQuestion(stud, q)) continue
            const key = `${q.id}-${stud.id}`
            if (!sm[key]) {
              const saved = await api.upsertScore({
                session_id: sess.id,
                student_id: stud.id,
                question_id: q.id,
                points: null,
                excluded: true,
              })
              sm[key] = saved
            }
          }
        }

        setScoreMap(sm)

        if (resumeQ === -1) {
          if (t.grading_method) {
            setPhase('review')
          } else {
            const newOrder = [...(sess.student_order || []), stud.id]
            await api.setSessionOrder(id, { student_order: newOrder })
            navigate('/inhalers', { replace: true })
          }
        } else {
          setQIdx(resumeQ)
          setPhase('grading')
          const existing = sm[`${t.questions[resumeQ].id}-${stud.id}`]
          setInputVal(existing?.points !== null && existing?.points !== undefined ? String(existing.points) : '')
        }
      } catch {
        setError('Fout bij laden.')
      }
    }
    load()
  }, [id, studentId])

  // Auto-focus score input
  useEffect(() => {
    if (phase === 'grading') {
      scoreInputRef.current?.focus()
      scoreInputRef.current?.select()
    }
  }, [phase, qIdx])

  // Auto-focus inline score edit
  useEffect(() => {
    if (editKey) editRef.current?.focus()
  }, [editKey])

  // ── Derived ───────────────────────────────────────────────────────────────────
  const currentQuestion = test?.questions[qIdx]

  const prevApplicableIdx = useMemo(() => {
    if (!test || !student) return -1
    for (let i = qIdx - 1; i >= 0; i--) {
      if (isApplicableForQuestion(student, test.questions[i])) return i
    }
    return -1
  }, [test, student, qIdx])

  const isLastApplicable = useMemo(() => {
    if (!test || !student) return true
    for (let i = qIdx + 1; i < test.questions.length; i++) {
      if (isApplicableForQuestion(student, test.questions[i])) return false
    }
    return true
  }, [test, student, qIdx])

  // ── Grading helpers ───────────────────────────────────────────────────────────
  async function persistCurrentScore() {
    if (!currentQuestion || inputVal === '') return
    const points = parseInt(inputVal, 10)
    if (isNaN(points) || points < 0 || points > currentQuestion.max_score) return
    setSaving(true)
    try {
      const key = `${currentQuestion.id}-${student.id}`
      const saved = await api.upsertScore({
        session_id: parseInt(id),
        student_id: student.id,
        question_id: currentQuestion.id,
        points,
        excluded: false,
        comment: scoreMap[key]?.comment ?? null,
      })
      setScoreMap(prev => ({ ...prev, [key]: saved }))
    } finally {
      setSaving(false)
    }
  }

  async function saveExcludedScore(q) {
    const key = `${q.id}-${student.id}`
    if (scoreMap[key]) return
    const saved = await api.upsertScore({
      session_id: parseInt(id),
      student_id: student.id,
      question_id: q.id,
      points: null,
      excluded: true,
    })
    setScoreMap(prev => ({ ...prev, [key]: saved }))
  }

  async function handleAdvance() {
    await persistCurrentScore()

    // Walk forward, auto-saving excluded scores for non-applicable questions
    let nextIdx = qIdx + 1
    while (nextIdx < test.questions.length) {
      const q = test.questions[nextIdx]
      if (isApplicableForQuestion(student, q)) break
      await saveExcludedScore(q)
      nextIdx++
    }

    if (nextIdx >= test.questions.length) {
      if (test.grading_method) {
        setPhase('review')
      } else {
        const newOrder = [...(session.student_order || []), student.id]
        await api.setSessionOrder(id, { student_order: newOrder })
        navigate('/inhalers', { replace: true })
      }
    } else {
      setQIdx(nextIdx)
      const existing = scoreMap[`${test.questions[nextIdx].id}-${student.id}`]
      setInputVal(existing?.points !== null && existing?.points !== undefined ? String(existing.points) : '')
    }
  }

  async function handleBack() {
    await persistCurrentScore()
    if (prevApplicableIdx < 0) return
    setQIdx(prevApplicableIdx)
    const existing = scoreMap[`${test.questions[prevApplicableIdx].id}-${student.id}`]
    setInputVal(existing?.points !== null && existing?.points !== undefined ? String(existing.points) : '')
  }

  // ── Review helpers ────────────────────────────────────────────────────────────
  const computedGrade = useMemo(() => {
    if (!student || !test || phase !== 'review') return null
    return computeGrade(student, test.questions, scoreMap, test.grading_method, test.grade_config, stars)
  }, [student?.id, scoreMap, test, phase, stars])

  const displayGrade = isManual ? manualGrade : computedGrade

  function handleSetGrade(grade) {
    setManualGrade(grade)
    setIsManual(grade !== computedGrade)
  }

  function handleSetStars(n) {
    if (isManual && manualGrade) setManualGrade(shiftCijfer(manualGrade, n - stars))
    setStars(n)
  }

  async function startEditScore(q) {
    const key = `${q.id}-${student.id}`
    const sc = scoreMap[key]
    if (sc?.excluded) return
    setEditKey(key)
    setEditVal(sc?.points !== null && sc?.points !== undefined ? String(sc.points) : '')
  }

  async function commitEditScore(q) {
    if (editKey !== `${q.id}-${student.id}`) return
    const pts = parseInt(editVal, 10)
    if (!isNaN(pts) && pts >= 0 && pts <= q.max_score) {
      try {
        const key = `${q.id}-${student.id}`
        const saved = await api.upsertScore({
          session_id: parseInt(id),
          student_id: student.id,
          question_id: q.id,
          points: pts,
          excluded: false,
          comment: scoreMap[key]?.comment ?? null,
        })
        setScoreMap(m => ({ ...m, [key]: saved }))
        if (!isManual) setManualGrade(null)
      } catch {}
    }
    setEditKey(null)
    setEditVal('')
  }

  async function handleReviewConfirm() {
    if (!displayGrade) { setError('Kies een beoordeling.'); return }
    setReviewSaving(true)
    try {
      await api.upsertStudentGrade(parseInt(id), student.id, {
        grade: displayGrade,
        is_manual: isManual,
        review_done: true,
        stars: test.grading_method === 'cijfer' ? stars : 0,
      })
      const newOrder = [...(session.student_order || []), student.id]
      await api.setSessionOrder(id, { student_order: newOrder })
      navigate('/inhalers', { replace: true })
    } catch {
      setError('Opslaan mislukt.')
    } finally {
      setReviewSaving(false)
    }
  }

  // Score rows for review table
  const scoreRows = useMemo(() => {
    if (!student || !test) return []
    return test.questions.map((q, i) => {
      const sc = scoreMap[`${q.id}-${student.id}`]
      return { q, nr: i + 1, excluded: sc?.excluded ?? false, points: sc?.excluded ? null : (sc?.points ?? null) }
    })
  }, [student?.id, scoreMap, test])

  const totals = useMemo(() => {
    let scored = 0, max = 0
    for (const row of scoreRows) {
      if (!row.excluded && row.points !== null) scored += row.points
      if (!row.excluded) max += row.q.max_score
    }
    return { scored, max }
  }, [scoreRows])

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (error) return (
    <div className="page">
      <div className="alert alert-error">{error}</div>
      <button className="btn btn-secondary" onClick={() => navigate('/inhalers')}>← Terug</button>
    </div>
  )
  if (!test || !student || phase === 'loading') return <div className="page"><p>Laden...</p></div>

  const progressPct = phase === 'review' ? 100 : Math.round((qIdx / test.questions.length) * 100)

  // ── Review render ─────────────────────────────────────────────────────────────
  if (phase === 'review') {
    return (
      <div className="page" style={{ maxWidth: 860, marginLeft: 'auto', marginRight: 'auto' }}>
        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ background: '#e0e3ea', borderRadius: 6, height: 6, marginBottom: 20 }}>
          <div style={{ background: '#1e3a5f', borderRadius: 6, height: 6, width: '100%' }} />
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
          Beoordelingsronde · {test.name} · Inhaler
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>{student.name}</h1>
          <RouteBadge route={student.route} />
        </div>

        <div className="grade-main" style={{ maxWidth: 640 }}>
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f7fb' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>V#</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Domein</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Niveaulaag</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Max</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {scoreRows.map(row => {
                  const key = `${row.q.id}-${student.id}`
                  const isEditing = editKey === key
                  return (
                    <tr key={row.q.id} style={{ borderTop: '1px solid #eef0f4' }}>
                      <td style={{ padding: '7px 12px', color: '#888' }}>V{row.nr}</td>
                      <td style={{ padding: '7px 12px' }}>{row.q.domain || '—'}</td>
                      <td style={{ padding: '7px 12px' }}>{pyramidLabel(row.q.pyramid_level)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>{row.q.max_score}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                        {row.excluded ? (
                          <span className="text-muted">n.v.t.</span>
                        ) : isEditing ? (
                          <input
                            ref={editRef}
                            type="number" min={0} max={row.q.max_score}
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={() => commitEditScore(row.q)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitEditScore(row.q)
                              if (e.key === 'Escape') { setEditKey(null); setEditVal('') }
                            }}
                            style={{ width: 60, textAlign: 'right' }}
                          />
                        ) : (
                          <span
                            onClick={() => startEditScore(row.q)}
                            style={{ cursor: 'pointer', fontWeight: 700, color: '#1e3a5f', borderBottom: '1px dashed #aaa', paddingBottom: 1 }}
                            title="Klik om score te bewerken"
                          >
                            {row.points !== null ? row.points : <span className="text-muted">—</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #dde', background: '#f5f7fb' }}>
                  <td colSpan={3} style={{ padding: '8px 12px', fontWeight: 700 }}>Totaal</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{totals.max}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                    {totals.scored}
                    {totals.max > 0 && (
                      <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                        ({Math.round(totals.scored / totals.max * 100)}%)
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
              Beoordeling
            </div>
            {test.grading_method !== 'cijfer' && totals.max > 0 && (
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                Cijfer: <strong>{formatCijfer(displayCijfer(test, totals.scored, totals.max, null))}</strong>
                <span className="text-muted" style={{ marginLeft: 6, fontSize: 12 }}>(punten / totaal × 9 + 1)</span>
              </div>
            )}

            {test.grading_method === 'cijfer' ? (
              <>
                <StarInput value={stars} onChange={handleSetStars} />
                <CijferInput value={displayGrade} onChange={handleSetGrade} />
              </>
            ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {GRADE_OPTIONS.map(opt => {
                const active = displayGrade === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleSetGrade(opt.value)}
                    style={{
                      padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                      border: active ? `2px solid ${GRADE_COLORS[opt.value]}` : '2px solid #dde',
                      background: active ? GRADE_BG[opt.value] : '#fff',
                      color: active ? GRADE_COLORS[opt.value] : '#555',
                      transition: 'all .15s',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            )}
            {isManual && computedGrade && displayGrade !== computedGrade && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                Automatisch: <strong>{gradeLabel(computedGrade)}</strong>
                {' · '}
                <button
                  onClick={() => { setManualGrade(null); setIsManual(false) }}
                  style={{ background: 'none', border: 'none', color: '#1a6ecc', cursor: 'pointer', padding: 0, fontSize: 12 }}
                >
                  Herstel automatische beoordeling
                </button>
              </div>
            )}
            {!computedGrade && !displayGrade && (
              <p className="text-muted" style={{ fontSize: 13 }}>Geen automatische beoordeling mogelijk. Kies handmatig.</p>
            )}
          </div>

          <div className="grade-nav-buttons" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleReviewConfirm} disabled={reviewSaving || !displayGrade}>
              {reviewSaving ? 'Opslaan…' : 'Bevestigen ✓'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Grading render ────────────────────────────────────────────────────────────
  return (
    <div className="page" style={{ maxWidth: 1040, marginLeft: 'auto', marginRight: 'auto' }}>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ background: '#e0e3ea', borderRadius: 6, height: 6, marginBottom: 20 }}>
        <div style={{
          background: '#1e3a5f', borderRadius: 6, height: 6,
          width: `${progressPct}%`, transition: 'width .3s',
        }} />
      </div>

      <div className="grade-wrap">
        <div className="grade-main">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
            Inhaler · {session.class_name}
          </div>
          <div className="grade-student-name">{student.name}</div>
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <RouteBadge route={student.route} />
            <span className="grade-progress">
              Vraag {qIdx + 1} van {test.questions.length}
            </span>
          </div>

          <div className="grade-question-box">
            <div className="grade-question-label">
              Vraag {qIdx + 1} · {currentQuestion.domain} · {pyramidLabel(currentQuestion.pyramid_level)} · max {currentQuestion.max_score} pt
            </div>
            <div className="grade-question-desc"><MathText text={currentQuestion.description} /></div>
            {currentQuestion.answer && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 4 }}>Modelantwoord</div>
                <div className="grade-answer"><MathText text={currentQuestion.answer} /></div>
              </div>
            )}
          </div>

          <div className="grade-score-row">
            <input
              ref={scoreInputRef}
              type="number"
              className="grade-score-input"
              min={0}
              max={currentQuestion.max_score}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'ArrowRight') handleAdvance()
                if (e.key === 'ArrowLeft') handleBack()
              }}
            />
            <span className="grade-score-max">/ {currentQuestion.max_score}</span>
            {saving && <span className="text-muted">Opslaan...</span>}
          </div>

          <div className="grade-nav-buttons">
            <button className="btn btn-secondary" onClick={handleBack} disabled={prevApplicableIdx < 0}>
              ← Vorige vraag
            </button>
            <button className="btn btn-primary" onClick={handleAdvance}>
              {isLastApplicable ? 'Afronden ✓' : 'Volgende vraag →'}
            </button>
          </div>
        </div>

        <div className="grade-sidebar">
          <div className="card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{test.name}</div>
            <div className="text-muted">Klas {session.class_name} · Inhaler</div>
            <hr className="divider" />
            {test.questions.map((q, i) => {
              const applicable = isApplicableForQuestion(student, q)
              const sc = scoreMap[`${q.id}-${student.id}`]
              const done = applicable && sc?.points !== null && sc?.points !== undefined
              const isCurrent = i === qIdx
              return (
                <div key={q.id} style={{
                  padding: '3px 0',
                  color: !applicable ? '#ccc' : done ? '#4caf50' : isCurrent ? '#1e3a5f' : '#aaa',
                  fontWeight: isCurrent ? 700 : 400,
                  fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ width: 16 }}>
                    {!applicable ? '' : done ? '✓' : isCurrent ? '▶' : ''}
                  </span>
                  <span>V{i + 1} {q.domain}</span>
                  {!applicable && <span style={{ fontSize: 11, color: '#bbb' }}>n.v.t.</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
