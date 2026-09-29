import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import CijferInput from '../components/CijferInput.jsx'
import { pyramidLabel } from '../constants.js'
import { calcCijfer, formatCijferFormula, gradeLabel } from '../utils/gradingLogic.js'

const GRADE_OPTIONS = [
  { value: 'expert',         label: 'Expert' },
  { value: 'beheerst',       label: 'Beheerst' },
  { value: 'in_ontwikkeling', label: 'In Ontwikkeling' },
]
const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }
const GRADE_BG    = { expert: '#e8f5e9', beheerst: '#e8f0fc', in_ontwikkeling: '#fff3e0' }

// ── Grade computation ─────────────────────────────────────────────────────────

function computeGrade(student, questions, scoreMap, gradingMethod, gradeConfig) {
  if (!gradingMethod || !gradeConfig) return null
  const applicable = questions.filter(q => (q.routes || []).includes(student.route))

  if (gradingMethod === 'cijfer') {
    let scored = 0, maxPts = 0
    for (const q of applicable) {
      const sc = scoreMap[`${q.id}-${student.id}`]
      if (sc && !sc.excluded && sc.points !== null) { scored += sc.points; maxPts += q.max_score }
    }
    return calcCijfer(scored, maxPts, gradeConfig)
  }

  const routeCfg = gradeConfig[student.route]
  if (!routeCfg) return null

  if (gradingMethod === 'points') {
    let scored = 0, maxPts = 0
    for (const q of applicable) {
      const sc = scoreMap[`${q.id}-${student.id}`]
      if (sc && !sc.excluded && sc.points !== null) {
        scored += sc.points
        maxPts += q.max_score
      }
    }
    if (maxPts === 0) return null
    const pct = (scored / maxPts) * 100
    if (pct >= routeCfg.expert)   return 'expert'
    if (pct >= routeCfg.beheerst) return 'beheerst'
    return 'in_ontwikkeling'
  }

  if (gradingMethod === 'goals') {
    const goalGroups = {}
    for (const q of applicable) {
      if (!q.learning_goal || q.learning_goal_threshold == null) continue
      if (!goalGroups[q.learning_goal]) goalGroups[q.learning_goal] = []
      goalGroups[q.learning_goal].push(q)
    }
    let achieved = 0
    for (const goalQs of Object.values(goalGroups)) {
      const allMet = goalQs.every(q => {
        const sc = scoreMap[`${q.id}-${student.id}`]
        return sc && !sc.excluded && sc.points !== null && sc.points >= q.learning_goal_threshold
      })
      if (allMet) achieved++
    }
    if (achieved >= routeCfg.expert)   return 'expert'
    if (achieved >= routeCfg.beheerst) return 'beheerst'
    return 'in_ontwikkeling'
  }

  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Review() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [session, setSession]   = useState(null)
  const [test, setTest]         = useState(null)
  const [students, setStudents] = useState([])
  const [scoreMap, setScoreMap] = useState({})  // key: `${q.id}-${s.id}`
  const [gradeMap, setGradeMap] = useState({})  // key: student_id → {grade, is_manual}
  const [sIdx, setSIdx]         = useState(0)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  // Inline score editing
  const [editKey, setEditKey]   = useState(null)   // `${q.id}-${s.id}` or null
  const [editVal, setEditVal]   = useState('')
  const editRef = useRef(null)

  // Inline comment editing
  const [editCommentKey, setEditCommentKey] = useState(null)   // `${q.id}-${s.id}` or null
  const [editCommentVal, setEditCommentVal] = useState('')
  const editCommentRef = useRef(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [sess, sc, grades] = await Promise.all([
          api.getSession(id),
          api.getSessionScores(id),
          api.getSessionGrades(id),
        ])
        const [t, studs] = await Promise.all([
          api.getTest(sess.test_id),
          api.getStudents(sess.class_name),
        ])

        const sm = {}
        for (const s of sc) sm[`${s.question_id}-${s.student_id}`] = s
        setScoreMap(sm)

        const gm = {}
        for (const g of grades) gm[g.student_id] = { grade: g.grade, is_manual: g.is_manual, review_done: g.review_done }
        setGradeMap(gm)

        const ordered = (sess.student_order || [])
          .map(sid => studs.find(s => s.id === sid))
          .filter(Boolean)

        setSession(sess)
        setTest(t)
        setStudents(ordered)

        // Resume: find first student whose review is not done
        const resumeIdx = ordered.findIndex(s => !gm[s.id]?.review_done)
        if (resumeIdx === -1) {
          setDone(true)
        } else {
          setSIdx(resumeIdx)
        }
      } catch {
        setError('Fout bij laden van beoordelingsronde.')
      }
    }
    load()
  }, [id])

  // ── Focus edit input when activating ─────────────────────────────────────
  useEffect(() => {
    if (editKey) editRef.current?.focus()
  }, [editKey])

  useEffect(() => {
    if (editCommentKey) editCommentRef.current?.focus()
  }, [editCommentKey])

  // ── Current student ───────────────────────────────────────────────────────
  const student = students[sIdx]

  // ── Per-student computed grade ────────────────────────────────────────────
  const computedGrade = useMemo(() => {
    if (!student || !test) return null
    return computeGrade(student, test.questions, scoreMap, test.grading_method, test.grade_config)
  }, [student?.id, scoreMap, test])

  // Local grade override for the current student (session-level)
  const localGrade = gradeMap[student?.id]
  const displayGrade = localGrade?.grade ?? computedGrade

  // Whether we've explicitly set a grade that differs from computed
  const isManual = localGrade?.is_manual ?? false

  // ── Score table rows ──────────────────────────────────────────────────────
  const scoreRows = useMemo(() => {
    if (!student || !test) return []
    return test.questions.map((q, i) => {
      const sc = scoreMap[`${q.id}-${student.id}`]
      return {
        q, nr: i + 1,
        excluded: sc?.excluded ?? false,
        points: sc?.excluded ? null : (sc?.points ?? null),
        comment: sc?.excluded ? '' : (sc?.comment ?? ''),
      }
    })
  }, [student?.id, scoreMap, test])

  const totals = useMemo(() => {
    if (!student || !test) return { scored: 0, max: 0 }
    let scored = 0, max = 0
    for (const row of scoreRows) {
      if (!row.excluded && row.points !== null) scored += row.points
      if (!row.excluded) max += row.q.max_score
    }
    return { scored, max }
  }, [scoreRows])

  // ── Normering (grade thresholds) for the student's route ─────────────────
  const thresholdText = useMemo(() => {
    if (!student || !test?.grading_method || !test?.grade_config) return null
    if (test.grading_method === 'cijfer') return `Cijfer = ${formatCijferFormula(test.grade_config)}`
    const cfg = test.grade_config[student.route]
    if (!cfg) return null
    if (test.grading_method === 'points') {
      return `Beheerst vanaf ${cfg.beheerst}%, Expert vanaf ${cfg.expert}%`
    }
    if (test.grading_method === 'goals') {
      const label = n => `${n} leerdoel${n === 1 ? '' : 'en'}`
      return `Beheerst vanaf ${label(cfg.beheerst)}, Expert vanaf ${label(cfg.expert)}`
    }
    return null
  }, [student?.route, test?.grading_method, test?.grade_config])

  // ── Learning goal summary (for goals-based grading) ───────────────────────
  const goalSummary = useMemo(() => {
    if (!student || !test || test.grading_method !== 'goals') return null
    const applicable = test.questions.filter(q => (q.routes || []).includes(student.route))
    const groups = {}
    for (const q of applicable) {
      if (!q.learning_goal || q.learning_goal_threshold == null) continue
      if (!groups[q.learning_goal]) groups[q.learning_goal] = []
      groups[q.learning_goal].push(q)
    }
    const results = Object.entries(groups).map(([name, qs]) => {
      const allMet = qs.every(q => {
        const sc = scoreMap[`${q.id}-${student.id}`]
        return sc && !sc.excluded && sc.points !== null && sc.points >= q.learning_goal_threshold
      })
      return { name, achieved: allMet }
    })
    return results
  }, [student?.id, scoreMap, test])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function setLocalGrade(grade) {
    const auto = computedGrade
    setGradeMap(m => ({
      ...m,
      [student.id]: { grade, is_manual: grade !== auto, review_done: false },
    }))
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
        const sc = scoreMap[`${q.id}-${student.id}`]
        const saved = await api.upsertScore({
          session_id: parseInt(id),
          student_id: student.id,
          question_id: q.id,
          points: pts,
          excluded: false,
          comment: sc?.comment ?? null,
        })
        setScoreMap(m => ({ ...m, [`${q.id}-${student.id}`]: saved }))
        // Re-derive grade if not manually overridden
        setGradeMap(m => {
          const prev = m[student.id]
          if (prev?.is_manual) return m
          return { ...m, [student.id]: { ...prev, grade: undefined, is_manual: false, review_done: false } }
        })
      } catch { /* ignore transient save error */ }
    }
    setEditKey(null)
    setEditVal('')
  }

  function startEditComment(q) {
    const key = `${q.id}-${student.id}`
    const sc = scoreMap[key]
    if (sc?.excluded) return
    setEditCommentKey(key)
    setEditCommentVal(sc?.comment || '')
  }

  async function commitEditComment(q) {
    const key = `${q.id}-${student.id}`
    if (editCommentKey !== key) return
    const sc = scoreMap[key]
    try {
      const saved = await api.upsertScore({
        session_id: parseInt(id),
        student_id: student.id,
        question_id: q.id,
        points: sc?.points ?? null,
        excluded: sc?.excluded ?? false,
        comment: editCommentVal.trim() || null,
      })
      setScoreMap(m => ({ ...m, [key]: saved }))
    } catch { /* ignore transient save error */ }
    setEditCommentKey(null)
    setEditCommentVal('')
  }

  async function handleConfirm() {
    if (!student) return
    const grade = displayGrade
    if (!grade) { setError('Bepaal eerst een beoordeling voor deze leerling.'); return }
    setSaving(true)
    try {
      await api.upsertStudentGrade(parseInt(id), student.id, {
        grade,
        is_manual: isManual,
        review_done: true,
      })
      setGradeMap(m => ({ ...m, [student.id]: { grade, is_manual: isManual, review_done: true } }))
      if (sIdx >= students.length - 1) {
        setDone(true)
      } else {
        setSIdx(i => i + 1)
        setEditKey(null)
      }
    } catch {
      setError('Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  function handlePrev() {
    if (sIdx > 0) { setSIdx(i => i - 1); setEditKey(null) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!test || !session) return <div className="page"><p>{error || 'Laden...'}</p></div>

  if (done) {
    return (
      <div className="page">
        <div className="card session-done">
          <h2>Beoordelingsronde afgerond</h2>
          <p className="text-muted" style={{ marginBottom: 20 }}>
            Alle leerlingen van <strong>{session.class_name}</strong> zijn beoordeeld voor <strong>{test.name}</strong>.
          </p>
          <div className="gap-8" style={{ justifyContent: 'center' }}>
            <Link to="/sessions/new" className="btn btn-primary">Nieuwe sessie</Link>
            <Link to={`/classes/${session.class_name}/overview`} className="btn btn-secondary">Klasoverzicht</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!student) return <div className="page"><p>Laden...</p></div>

  const progressPct = Math.round((sIdx / students.length) * 100)

  return (
    <div className="page" style={{ maxWidth: 860, marginLeft: 'auto', marginRight: 'auto' }}>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Progress bar */}
      <div style={{ background: '#e0e3ea', borderRadius: 6, height: 6, marginBottom: 20 }}>
        <div style={{ background: '#1e3a5f', borderRadius: 6, height: 6, width: `${progressPct}%`, transition: 'width .3s' }} />
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Beoordelingsronde · {test.name}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>{student.name}</h1>
        <RouteBadge route={student.route} />
        <span className="text-muted" style={{ fontSize: 13 }}>
          Leerling {sIdx + 1} van {students.length}
        </span>
      </div>

      <div className="grade-wrap" style={{ gap: 20 }}>
        {/* Left: score table + grade */}
        <div className="grade-main">
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
                  const isEditingComment = editCommentKey === key
                  return (
                    <tr key={row.q.id} style={{ borderTop: '1px solid #eef0f4' }}>
                      <td style={{ padding: '7px 12px', color: '#888' }}>V{row.nr}</td>
                      <td style={{ padding: '7px 12px' }}>{row.q.domain || '—'}</td>
                      <td style={{ padding: '7px 12px' }}>{pyramidLabel(row.q.pyramid_level)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>{row.q.max_score}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                        {row.excluded ? (
                          <span className="text-muted">n.v.t.</span>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                              {isEditing ? (
                                <input
                                  ref={editRef}
                                  type="number" min={0} max={row.q.max_score}
                                  value={editVal}
                                  onChange={e => setEditVal(e.target.value)}
                                  onBlur={() => commitEditScore(row.q)}
                                  onKeyDown={e => { if (e.key === 'Enter') commitEditScore(row.q); if (e.key === 'Escape') { setEditKey(null); setEditVal('') } }}
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
                              <button
                                onClick={() => startEditComment(row.q)}
                                title={row.comment || 'Opmerking toevoegen'}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, opacity: row.comment ? 1 : 0.3 }}
                              >
                                💬
                              </button>
                            </div>
                            {isEditingComment ? (
                              <input
                                ref={editCommentRef}
                                type="text"
                                value={editCommentVal}
                                onChange={e => setEditCommentVal(e.target.value)}
                                onBlur={() => commitEditComment(row.q)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEditComment(row.q); if (e.key === 'Escape') { setEditCommentKey(null); setEditCommentVal('') } }}
                                placeholder="Opmerking…"
                                style={{ width: 200, fontSize: 12, marginTop: 4 }}
                              />
                            ) : row.comment && (
                              <div
                                onClick={() => startEditComment(row.q)}
                                title="Klik om opmerking te bewerken"
                                style={{ cursor: 'pointer', fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 2 }}
                              >
                                {row.comment}
                              </div>
                            )}
                          </>
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

          {/* Learning goal summary for goals-based grading */}
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

          {/* Grade section */}
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
              Beoordeling
            </div>

            {thresholdText && (
              <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                Normering ({student.route}): {thresholdText}
              </div>
            )}

            {test.grading_method === 'cijfer' ? (
              <CijferInput value={displayGrade} onChange={setLocalGrade} />
            ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {GRADE_OPTIONS.map(opt => {
                const active = displayGrade === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setLocalGrade(opt.value)}
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
                  onClick={() => setLocalGrade(computedGrade)}
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

          {/* Navigation */}
          <div className="grade-nav-buttons" style={{ marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={handlePrev} disabled={sIdx === 0}>
              ← Vorige
            </button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={saving || !displayGrade || !!editKey}>
              {saving ? 'Opslaan…' : sIdx === students.length - 1 ? 'Afronden ✓' : 'Bevestigen →'}
            </button>
          </div>
        </div>

        {/* Sidebar: student list */}
        <div className="grade-sidebar">
          <div className="card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{test.name}</div>
            <div className="text-muted">Klas {session.class_name}</div>
            <hr className="divider" />
            {students.map((s, i) => {
              const g = gradeMap[s.id]
              const isCurrent = i === sIdx
              return (
                <div key={s.id} style={{
                  padding: '4px 0',
                  color: isCurrent ? '#1e3a5f' : g?.review_done ? '#4caf50' : '#aaa',
                  fontWeight: isCurrent ? 700 : 400,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>{isCurrent ? '▶ ' : g?.review_done ? '✓ ' : '  '}{s.name}</span>
                  {g?.review_done && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 3, padding: '1px 5px',
                      background: GRADE_BG[g.grade] ?? '#e8f0fc', color: GRADE_COLORS[g.grade] ?? '#1a6ecc',
                    }}>
                      {gradeLabel(g.grade)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
