import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'

export default function Grade() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [test, setTest] = useState(null)
  const [students, setStudents] = useState([])   // all students in class, alphabetical
  const [scores, setScores] = useState({})        // key `${questionId}-${studentId}` → score
  const [qIdx, setQIdx] = useState(0)
  const [sIdx, setSIdx] = useState(0)
  const [inputVal, setInputVal] = useState('')
  const [showPrev, setShowPrev] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [skipNotice, setSkipNotice] = useState('')

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [sess, sc] = await Promise.all([api.getSession(id), api.getSessionScores(id)])
        const [t, studs] = await Promise.all([
          api.getTest(sess.test_id),
          api.getStudents(sess.class_name),
        ])

        const scoreMap = {}
        for (const s of sc) scoreMap[`${s.question_id}-${s.student_id}`] = s

        setSession(sess)
        setTest(t)
        setStudents([...studs].sort((a, b) => a.name.localeCompare(b.name, 'nl')))
        setScores(scoreMap)

        // Find resume position
        const orderedStuds = getOrderedStudents(sess, studs)
        const [rqIdx, rsIdx] = findResumePosition(t, orderedStuds, scoreMap)
        if (rqIdx >= t.questions.length) {
          setDone(true)
        } else {
          setQIdx(rqIdx)
          setSIdx(rsIdx)
        }
      } catch (e) {
        setError('Fout bij laden van sessie.')
      }
    }
    load()
  }, [id])

  // ── Derived state ───────────────────────────────────────────────────────────
  function getOrderedStudents(sess, studs) {
    if (sess?.student_order?.length) {
      return sess.student_order.map(sid => studs.find(s => s.id === sid)).filter(Boolean)
    }
    return [...studs].sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  }

  const orderedStudents = useMemo(
    () => getOrderedStudents(session, students),
    [session?.student_order, students]
  )

  const currentQuestion = test?.questions[qIdx]

  const applicableStudents = useMemo(() => {
    if (!currentQuestion) return []
    return orderedStudents.filter(s => (currentQuestion.routes || []).includes(s.route))
  }, [orderedStudents, currentQuestion])

  const currentStudent = applicableStudents[sIdx]

  const scoreKey = (qid, sid) => `${qid}-${sid}`

  // Auto-clear skip notice after 5 seconds
  useEffect(() => {
    if (!skipNotice) return
    const t = setTimeout(() => setSkipNotice(''), 5000)
    return () => clearTimeout(t)
  }, [skipNotice])

  // Sync input value when student/question changes
  useEffect(() => {
    if (!currentQuestion || !currentStudent) return
    const existing = scores[scoreKey(currentQuestion.id, currentStudent.id)]
    setInputVal(
      existing && existing.points !== null && existing.points !== undefined
        ? String(existing.points)
        : ''
    )
  }, [qIdx, sIdx, currentQuestion?.id, currentStudent?.id])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function findResumePosition(t, ordered, scoreMap) {
    for (let qi = 0; qi < t.questions.length; qi++) {
      const q = t.questions[qi]
      const applicable = ordered.filter(s => (q.routes || []).includes(s.route))
      for (let si = 0; si < applicable.length; si++) {
        const key = scoreKey(q.id, applicable[si].id)
        const sc = scoreMap[key]
        if (!sc || (sc.points === null && !sc.excluded)) return [qi, si]
      }
    }
    return [t.questions.length, 0]  // all done
  }

  async function persistScore() {
    if (!currentQuestion || !currentStudent) return
    if (inputVal === '') return

    const points = parseInt(inputVal, 10)
    if (isNaN(points) || points < 0 || points > currentQuestion.max_score) return

    setSaving(true)
    try {
      const saved = await api.upsertScore({
        session_id: parseInt(id),
        student_id: currentStudent.id,
        question_id: currentQuestion.id,
        points,
        excluded: false,
      })
      setScores(prev => ({ ...prev, [scoreKey(currentQuestion.id, currentStudent.id)]: saved }))
    } finally {
      setSaving(false)
    }
  }

  async function createExcludedScores(question, allStudents) {
    const excluded = allStudents.filter(s => !(question.routes || []).includes(s.route))
    for (const s of excluded) {
      const key = scoreKey(question.id, s.id)
      if (!scores[key]) {
        const saved = await api.upsertScore({
          session_id: parseInt(id),
          student_id: s.id,
          question_id: question.id,
          points: null,
          excluded: true,
        })
        setScores(prev => ({ ...prev, [key]: saved }))
      }
    }
  }

  async function saveOrderIfNeeded() {
    if (!session.student_order?.length && qIdx === 0) {
      const order = orderedStudents.map(s => s.id)
      const updated = await api.setSessionOrder(id, { student_order: order })
      setSession(updated)
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  async function handlePrev() {
    await persistScore()
    if (sIdx > 0) {
      setSIdx(s => s - 1)
    }
  }

  async function handleNext() {
    await persistScore()
    if (sIdx < applicableStudents.length - 1) {
      setSIdx(s => s + 1)
    }
  }

  async function handleNextQuestion() {
    await persistScore()
    await saveOrderIfNeeded()
    await createExcludedScores(currentQuestion, orderedStudents)

    let nextQIdx = qIdx + 1
    const skippedIndices = []

    // Skip any questions whose routes exclude every student in the current stack.
    // Create excluded-score rows for those questions (same pattern as non-applicable
    // students on regular questions) and collect their indices for the notice.
    while (nextQIdx < test.questions.length) {
      const q = test.questions[nextQIdx]
      const applicable = orderedStudents.filter(s => (q.routes || []).includes(s.route))
      if (applicable.length > 0) break
      skippedIndices.push(nextQIdx)
      await createExcludedScores(q, orderedStudents)
      nextQIdx++
    }

    if (skippedIndices.length > 0) {
      const routeNames = [...new Set(
        skippedIndices.flatMap(qi => test.questions[qi].routes || [])
      )].join('/')
      setSkipNotice(
        skippedIndices.length === 1
          ? `Vraag ${skippedIndices[0] + 1} overgeslagen: geen leerlingen met route ${routeNames} in de stapel.`
          : `Vragen ${skippedIndices.map(qi => qi + 1).join(', ')} overgeslagen: geen leerlingen met de betreffende routes in de stapel.`
      )
    }

    if (nextQIdx >= test.questions.length) {
      setDone(true)
      return
    }
    setQIdx(nextQIdx)
    setSIdx(0)
  }

  // ── Previous scores for current student ─────────────────────────────────────
  const prevScores = useMemo(() => {
    if (!currentStudent || !test) return []
    return test.questions.slice(0, qIdx).map((q, i) => {
      const sc = scores[scoreKey(q.id, currentStudent.id)]
      return {
        nr: i + 1,
        domain: q.domain,
        pyramid_level: q.pyramid_level,
        max_score: q.max_score,
        points: sc?.excluded ? 'n.v.t.' : (sc?.points !== null && sc?.points !== undefined ? sc.points : '—'),
      }
    })
  }, [currentStudent?.id, qIdx, scores, test])

  // ── Render helpers ──────────────────────────────────────────────────────────
  const isLastStudent = sIdx === applicableStudents.length - 1
  const isLastQuestion = qIdx === test?.questions.length - 1

  if (!test || !session) return <div className="page"><p>Laden...</p></div>

  if (done) {
    return (
      <div className="page">
        <div className="card session-done">
          <h2>Nakijken afgerond</h2>
          <p className="text-muted" style={{ marginBottom: 20 }}>
            Alle vragen van <strong>{test.name}</strong> zijn nagekeken voor klas <strong>{session.class_name}</strong>.
          </p>
          <div className="gap-8" style={{ justifyContent: 'center' }}>
            <Link to="/sessions/new" className="btn btn-primary">Nieuwe sessie</Link>
            <Link to={`/classes/${session.class_name}/overview`} className="btn btn-secondary">Klasoverzicht bekijken</Link>
          </div>
        </div>
      </div>
    )
  }

  // Reached only during initial load before findResumePosition resolves,
  // or if the entire test has no applicable students at all.
  if (!currentQuestion || !currentStudent) {
    return <div className="page"><p>Laden...</p></div>
  }

  return (
    <div className="page" style={{ maxWidth: 1040, marginLeft: 'auto', marginRight: 'auto' }}>
      {error && <div className="alert alert-error">{error}</div>}
      {skipNotice && (
        <div className="alert" style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '10px 14px', marginBottom: 12, color: '#856404' }}>
          {skipNotice}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ background: '#e0e3ea', borderRadius: 6, height: 6, marginBottom: 20 }}>
        <div style={{
          background: '#1e3a5f',
          borderRadius: 6,
          height: 6,
          width: `${((qIdx * applicableStudents.length + sIdx + 1) / (test.questions.length * Math.max(applicableStudents.length, 1))) * 100}%`,
          transition: 'width .3s',
        }} />
      </div>

      <div className="grade-wrap">
        {/* ── Main grading panel ── */}
        <div className="grade-main">
          <div className="grade-student-name">{currentStudent.name}</div>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <RouteBadge route={currentStudent.route} />
            <span className="grade-progress">
              Vraag {qIdx + 1} van {test.questions.length} — Leerling {sIdx + 1} van {applicableStudents.length}
            </span>
          </div>

          {/* Question */}
          <div className="grade-question-box">
            <div className="grade-question-label">
              Vraag {qIdx + 1} · {currentQuestion.domain} · {currentQuestion.pyramid_level} · max {currentQuestion.max_score} pt
            </div>
            <div className="grade-question-desc">{currentQuestion.description}</div>
            {currentQuestion.answer && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 4 }}>Modelantwoord</div>
                <div className="grade-answer">{currentQuestion.answer}</div>
              </div>
            )}
          </div>

          {/* Score input */}
          <div className="grade-score-row">
            <input
              type="number"
              className="grade-score-input"
              min={0}
              max={currentQuestion.max_score}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') isLastStudent ? handleNextQuestion() : handleNext()
                if (e.key === 'ArrowRight') isLastStudent ? handleNextQuestion() : handleNext()
                if (e.key === 'ArrowLeft') handlePrev()
              }}
              autoFocus
            />
            <span className="grade-score-max">/ {currentQuestion.max_score}</span>
            {saving && <span className="text-muted">Opslaan...</span>}
          </div>

          {/* Navigation */}
          <div className="grade-nav-buttons">
            <button className="btn btn-secondary" onClick={handlePrev} disabled={sIdx === 0 && qIdx === 0}>
              ← Vorige leerling
            </button>

            {!isLastStudent && (
              <button className="btn btn-primary" onClick={handleNext}>
                Volgende leerling →
              </button>
            )}

            {isLastStudent && !isLastQuestion && (
              <button className="btn btn-primary" onClick={handleNextQuestion}>
                Volgende vraag ↓
              </button>
            )}

            {isLastStudent && isLastQuestion && (
              <button className="btn btn-primary" onClick={handleNextQuestion}>
                Afronden ✓
              </button>
            )}
          </div>
        </div>

        {/* ── Sidebar: previous scores ── */}
        <div className="grade-sidebar">
          <div>
            <div
              className="collapsible-header"
              onClick={() => setShowPrev(v => !v)}
            >
              <span>Vorige scores {currentStudent.name}</span>
              <span>{showPrev ? '▲' : '▼'}</span>
            </div>
            {showPrev && (
              <div className="collapsible-body">
                {prevScores.length === 0 ? (
                  <p className="text-muted">Nog geen eerdere vragen.</p>
                ) : (
                  <table style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '4px 6px' }}>V#</th>
                        <th style={{ padding: '4px 6px' }}>Domein</th>
                        <th style={{ padding: '4px 6px' }}>Max</th>
                        <th style={{ padding: '4px 6px' }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prevScores.map(ps => (
                        <tr key={ps.nr}>
                          <td style={{ padding: '4px 6px' }}>{ps.nr}</td>
                          <td style={{ padding: '4px 6px' }}>{ps.domain || '—'}</td>
                          <td style={{ padding: '4px 6px' }}>{ps.max_score}</td>
                          <td style={{ padding: '4px 6px', fontWeight: 700 }}>{ps.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Quick session info */}
          <div className="card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{test.name}</div>
            <div className="text-muted">Klas {session.class_name}</div>
            <hr className="divider" />
            {test.questions.map((q, i) => {
              const isPast = i < qIdx
              const isCurrent = i === qIdx
              return (
                <div key={q.id} style={{
                  padding: '3px 0',
                  color: isPast ? '#4caf50' : isCurrent ? '#1e3a5f' : '#aaa',
                  fontWeight: isCurrent ? 700 : 400,
                  fontSize: 13,
                }}>
                  {isPast ? '✓ ' : isCurrent ? '▶ ' : '  '}V{i + 1} {q.domain}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
