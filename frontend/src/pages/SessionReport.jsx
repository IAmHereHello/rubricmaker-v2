import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import BackButton from '../components/BackButton.jsx'
import RouteBadge from '../components/RouteBadge.jsx'
import { LEVEL_LABELS } from '../constants.js'
import { displayCijfer, formatCijfer, gradeLabel, computeGrade, isCijferGrade, learningGoalResults } from '../utils/gradingLogic.js'
import { exportRubricsPDF, exportRubricsZip } from '../utils/exportRubric.js'
import StudentRubric from '../components/StudentRubric.jsx'
import { GoalRequirement, GoalSummary } from '../components/LearningGoals.jsx'
import MathText from '../components/MathText.jsx'
import NeedsCheckBanner from '../components/NeedsCheckBanner.jsx'

function ScoreCell({ sc, maxScore }) {
  if (!sc) return <span className="text-muted">—</span>
  if (sc.excluded) return <span style={{ color: '#aaa', fontSize: 12 }}>n.v.t.</span>
  if (sc.points === null || sc.points === undefined) return <span className="text-muted">—</span>
  return <>{sc.points}<span className="text-muted">/{maxScore}</span></>
}

function goalBadge(achieved) {
  return (
    <span style={{ marginLeft: 5, fontWeight: 700, color: achieved ? '#15803d' : '#b91c1c' }}>
      {achieved ? '✓' : '✗'}
    </span>
  )
}

function computeGoals(questions, scores, studentId) {
  // Group questions by learning_goal name; a goal is achieved when ALL applicable
  // questions in the group score >= their individual threshold.
  const groups = {}
  questions.forEach(q => {
    if (!q.learning_goal || q.learning_goal_threshold == null) return
    const sc = scores[`${studentId}|${q.id}`]
    if (sc && sc.excluded) return  // not applicable for this student's route
    if (!groups[q.learning_goal]) groups[q.learning_goal] = { total: 0, passed: 0 }
    groups[q.learning_goal].total++
    if (sc && sc.points !== null && sc.points >= q.learning_goal_threshold) {
      groups[q.learning_goal].passed++
    }
  })
  const names = Object.keys(groups).filter(n => groups[n].total > 0)
  return {
    achieved: names.filter(n => groups[n].passed === groups[n].total).length,
    total: names.length,
  }
}

function StudentView({ data, selectedId, setSelectedId, grades, onEdit }) {
  const student = data.students.find(s => s.id === selectedId)

  let totalScored = 0, totalMax = 0
  if (student) {
    data.questions.forEach(q => {
      const sc = data.scores[`${student.id}|${q.id}`]
      if (sc && !sc.excluded && sc.points !== null && sc.points !== undefined) {
        totalScored += sc.points
        totalMax += q.max_score
      }
    })
  }

  const { achieved: goalsAchieved, total: goalsTotal } = student
    ? computeGoals(data.questions, data.scores, student.id)
    : { achieved: 0, total: 0 }

  return (
    <div className="card">
      <div className="form-row" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Leerling</label>
          <select
            value={selectedId || ''}
            onChange={e => setSelectedId(Number(e.target.value))}
            style={{ minWidth: 200 }}
          >
            {data.students.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.route})</option>
            ))}
          </select>
        </div>
        {student && <div style={{ alignSelf: 'flex-end' }}><RouteBadge route={student.route} /></div>}
        {totalMax > 0 && (
          <div style={{ alignSelf: 'flex-end', fontSize: 14 }}>
            Totaal: <strong>{totalScored}/{totalMax}</strong>
            <span className="text-muted" style={{ marginLeft: 6 }}>
              ({Math.round(totalScored / totalMax * 100)}%)
            </span>
            {' · '}Cijfer: <strong>{formatCijfer(displayCijfer(data.test, totalScored, totalMax, grades?.[selectedId]?.grade, grades?.[selectedId]?.stars))}</strong>
          </div>
        )}
        {goalsTotal > 0 && (
          <div style={{ alignSelf: 'flex-end', fontSize: 14 }}>
            Leerdoelen:{' '}
            <strong style={{ color: goalsAchieved === goalsTotal ? '#15803d' : goalsAchieved > 0 ? '#b45309' : '#b91c1c' }}>
              {goalsAchieved} van {goalsTotal}
            </strong>{' '}
            behaald
          </div>
        )}
        {student && (
          <button
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-end' }}
            onClick={() => onEdit(student.id)}
          >
            Bewerken
          </button>
        )}
      </div>

      {student && (
        <table>
          <thead>
            <tr>
              <th>Opgave</th>
              <th>Domein</th>
              <th>Niveau</th>
              <th style={{ textAlign: 'center', width: 90 }}>Score / Max</th>
            </tr>
          </thead>
          <tbody>
            {data.questions.map(q => {
              const sc = data.scores[`${student.id}|${q.id}`]
              const isGoal = !!q.learning_goal && q.learning_goal_threshold != null
              const achieved = isGoal && sc && !sc.excluded && sc.points !== null && sc.points >= q.learning_goal_threshold
              return (
                <tr key={q.id} style={{ verticalAlign: 'top' }}>
                  <td>
                    <div style={{ fontWeight: 500 }}><MathText text={q.description} /></div>
                    {!sc?.excluded && <GoalRequirement question={q} fontSize={12} />}
                  </td>
                  <td>{q.domain || '—'}</td>
                  <td>
                    <span className={`level-pill level-${q.pyramid_level}`}>
                      {LEVEL_LABELS[q.pyramid_level] || q.pyramid_level}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 500 }}>
                    <ScoreCell sc={sc} maxScore={q.max_score} />
                    {isGoal && sc && !sc.excluded && sc.points !== null && goalBadge(achieved)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {student && (
        <div style={{ marginTop: 20 }}>
          <GoalSummary goals={learningGoalResults(data.questions, data.scores, student.id)} fontSize={13} />
        </div>
      )}
    </div>
  )
}

// Points and maximum over the graded, applicable questions of one student
function studentTotals(data, studentId) {
  let scored = 0, max = 0
  data.questions.forEach(q => {
    const sc = data.scores[`${studentId}|${q.id}`]
    if (sc && !sc.excluded && sc.points !== null && sc.points !== undefined) {
      scored += sc.points
      max += q.max_score
    }
  })
  return { scored, max, pct: max ? scored / max * 100 : null }
}

// One decimal with a comma; whole numbers without decimals
const formatNumber = n => (Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : n.toFixed(1).replace('.', ','))

function ClassView({ data }) {
  const colStyle = { textAlign: 'center', minWidth: 76, fontSize: 13 }

  const totals = Object.fromEntries(data.students.map(s => [s.id, studentTotals(data, s.id)]))
  // Class average over students with at least one graded question (inhalers without scores are left out)
  const graded = data.students.map(s => totals[s.id]).filter(t => t.max > 0)
  const classTotal = graded.length ? {
    pct: graded.reduce((acc, t) => acc + t.pct, 0) / graded.length,
    scored: graded.reduce((acc, t) => acc + t.scored, 0) / graded.length,
    max: graded.reduce((acc, t) => acc + t.max, 0) / graded.length,
  } : null

  const goalQuestions = data.questions.filter(q => q.learning_goal && q.learning_goal_threshold != null)
  const hasGoals = goalQuestions.length > 0

  const studentGoals = {}
  data.students.forEach(s => {
    studentGoals[s.id] = computeGoals(data.questions, data.scores, s.id)
  })

  const uniqueGoalNames = [...new Set(goalQuestions.map(q => q.learning_goal))]
  let classAvg = null
  if (hasGoals) {
    const studentsWithGoals = data.students.filter(s => studentGoals[s.id].total > 0)
    if (studentsWithGoals.length > 0) {
      const sumAchieved = studentsWithGoals.reduce((acc, s) => acc + studentGoals[s.id].achieved, 0)
      classAvg = (sumAchieved / studentsWithGoals.length).toFixed(1)
    }
  }

  return (
    <div className="card">
      {hasGoals && classAvg !== null && (
        <div style={{ marginBottom: 14, fontSize: 14 }}>
          Klasgemiddelde leerdoelen:{' '}
          <strong>{classAvg} van {uniqueGoalNames.length}</strong> behaald
        </div>
      )}
      <div className="heatmap">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 220, textAlign: 'left' }}>Vraag</th>
              {data.students.map(s => (
                <th key={s.id} style={colStyle}>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  <RouteBadge route={s.route} />
                  {hasGoals && studentGoals[s.id].total > 0 && (
                    <div style={{ fontSize: 11, marginTop: 2, color: '#555' }}>
                      {studentGoals[s.id].achieved}/{studentGoals[s.id].total} LG
                    </div>
                  )}
                </th>
              ))}
              <th style={{ ...colStyle, background: '#eef2f8', fontWeight: 700 }}>Gem.</th>
            </tr>
          </thead>
          <tbody>
            {data.questions.map((q, i) => {
              const avg = data.class_averages[String(q.id)]
              const isGoal = !!q.learning_goal && q.learning_goal_threshold != null
              return (
                <tr key={q.id}>
                  <td>
                    <span style={{ color: '#888', marginRight: 6, fontSize: 12 }}>{i + 1}.</span>
                    <span style={{ fontWeight: 500 }}><MathText text={q.description} /></span>
                    {isGoal && (
                      <span style={{ marginLeft: 6, fontSize: 11, background: '#e8f0fc', color: '#1a6ecc', borderRadius: 3, padding: '1px 4px' }}>
                        <MathText text={q.learning_goal} /> ≥{q.learning_goal_threshold}
                      </span>
                    )}
                    {(q.domain || q.pyramid_level) && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {q.domain}{q.domain && q.pyramid_level ? ' · ' : ''}
                        {LEVEL_LABELS[q.pyramid_level] || q.pyramid_level}
                      </div>
                    )}
                  </td>
                  {data.students.map(s => {
                    const sc = data.scores[`${s.id}|${q.id}`]
                    const achieved = isGoal && sc && !sc.excluded && sc.points !== null && sc.points >= q.learning_goal_threshold
                    return (
                      <td key={s.id} style={colStyle}>
                        <ScoreCell sc={sc} maxScore={q.max_score} />
                        {isGoal && sc && !sc.excluded && sc.points !== null && goalBadge(achieved)}
                      </td>
                    )
                  })}
                  <td style={{ ...colStyle, background: '#eef2f8', fontWeight: 600 }}>
                    {avg?.avg_points !== null && avg?.avg_points !== undefined
                      ? `${formatNumber(avg.avg_points)}/${q.max_score}`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #c9d1de' }}>
              <td style={{ fontWeight: 700 }}>Totaal per leerling</td>
              {data.students.map(s => {
                const t = totals[s.id]
                return (
                  <td key={s.id} style={{ ...colStyle, fontWeight: 600 }}>
                    {t.max > 0 ? (
                      <>
                        <div>{t.scored}<span className="text-muted">/{t.max}</span></div>
                        <div className="text-muted" style={{ fontSize: 12 }}>{Math.round(t.pct)}%</div>
                      </>
                    ) : '—'}
                  </td>
                )
              })}
              <td style={{ ...colStyle, background: '#dde5f2', fontWeight: 700 }}>
                {classTotal ? (
                  <>
                    <div>{formatNumber(classTotal.scored)}<span className="text-muted">/{formatNumber(classTotal.max)}</span></div>
                    <div style={{ fontSize: 12 }}>{Math.round(classTotal.pct)}%</div>
                  </>
                ) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

const GRADE_RANK = { expert: 3, beheerst: 2, in_ontwikkeling: 1 }
const GRADE_SHORT = { expert: 'E', beheerst: 'B', in_ontwikkeling: 'IO' }
const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }
const GRADE_BG = { expert: '#e8f5e9', beheerst: '#e8f0fc', in_ontwikkeling: '#fff3e0' }

// Sortable list of every student's result for this test
function ResultsView({ data, grades, onEdit }) {
  const [sort, setSort] = useState({ key: 'order', dir: 1 })
  const isCijferTest = data.test.grading_method === 'cijfer'
  const hasCategories = data.test.grading_method === 'points' || data.test.grading_method === 'goals'

  const rows = useMemo(() => {
    // computeGrade uses `${question.id}-${student.id}` keys
    const scoreMap = {}
    for (const [key, sc] of Object.entries(data.scores)) {
      if (!sc) continue
      const [sid, qid] = key.split('|')
      scoreMap[`${qid}-${sid}`] = sc
    }
    return data.students.map((s, i) => {
      const t = studentTotals(data, s.id)
      const g = grades[s.id]
      const stars = g?.stars || 0
      let result = null
      if (t.max > 0) {
        result = g?.grade ?? computeGrade(s, data.questions, scoreMap, data.test.grading_method, data.test.grade_config, stars)
      }
      const cijfer = t.max > 0 ? displayCijfer(data.test, t.scored, t.max, isCijferTest ? result : null, stars) : null
      return { student: s, order: i, ...t, result, cijfer: cijfer != null ? Number(cijfer) : null, stars }
    })
  }, [data, grades, isCijferTest])

  const resultValue = r => {
    if (r.result == null) return null
    if (isCijferGrade(r.result)) return Number(r.result)
    return GRADE_RANK[r.result] ?? null
  }

  const sorted = useMemo(() => {
    const value = {
      order: r => r.order,
      name: r => r.student.name,
      points: r => (r.max ? r.scored : null),
      pct: r => r.pct,
      result: r => resultValue(r),
      cijfer: r => r.cijfer,
      stars: r => r.stars,
    }[sort.key]
    return [...rows].sort((a, b) => {
      // Students without a result always go to the bottom
      if (!a.max !== !b.max) return a.max ? -1 : 1
      const va = value(a), vb = value(b)
      if (va == null || vb == null) {
        if (va == null && vb == null) return a.order - b.order
        return va == null ? 1 : -1
      }
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'nl') : va - vb
      if (cmp !== 0) return cmp * sort.dir
      // Equal results: higher percentage first, then grading order
      if (sort.key === 'result') return ((a.pct ?? 0) - (b.pct ?? 0)) * sort.dir
      return a.order - b.order
    })
  }, [rows, sort])

  function toggleSort(key) {
    // Results and numbers start high to low; name and order start at the top
    const firstDir = ['order', 'name'].includes(key) ? 1 : -1
    setSort(s => (s.key === key ? { key, dir: -s.dir } : { key, dir: firstDir }))
  }

  const withResult = rows.filter(r => r.max > 0)
  let summary = null
  if (withResult.length) {
    const avgPct = withResult.reduce((acc, r) => acc + r.pct, 0) / withResult.length
    if (hasCategories) {
      const counts = { expert: 0, beheerst: 0, in_ontwikkeling: 0 }
      withResult.forEach(r => { if (r.result in counts) counts[r.result]++ })
      summary = `${counts.expert} Expert · ${counts.beheerst} Beheerst · ${counts.in_ontwikkeling} In ontwikkeling · gem. ${Math.round(avgPct)}%`
    } else {
      const cijfers = withResult.map(r => r.cijfer).filter(c => c != null)
      const avg = cijfers.reduce((acc, c) => acc + c, 0) / cijfers.length
      const voldoende = cijfers.filter(c => c >= 5.5).length
      summary = `Gem. cijfer ${formatNumber(avg)} · ${voldoende} van ${cijfers.length} voldoende (${Math.round(voldoende / cijfers.length * 100)}%) · gem. ${Math.round(avgPct)}%`
    }
  }

  const header = (key, label, align = 'left') => (
    <th
      onClick={() => toggleSort(key)}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align, whiteSpace: 'nowrap' }}
      title="Klik om te sorteren"
    >
      {label}
      <span style={{ marginLeft: 4, opacity: sort.key === key ? 1 : 0.25 }}>
        {sort.key === key && sort.dir === -1 ? '▼' : '▲'}
      </span>
    </th>
  )

  return (
    <div className="card">
      {summary && <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 600 }}>{summary}</div>}
      <table>
        <thead>
          <tr>
            {header('order', '#')}
            {header('name', 'Naam')}
            <th>Route</th>
            {header('points', 'Punten', 'right')}
            {header('pct', '%', 'right')}
            {data.test.grading_method && header('result', 'Resultaat', 'center')}
            {!isCijferTest && header('cijfer', 'Cijfer', 'center')}
            {isCijferTest && header('stars', 'Sterretjes', 'center')}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr
              key={r.student.id}
              onClick={() => onEdit(r.student.id)}
              style={{ cursor: 'pointer' }}
              title="Klik om dit resultaat te bewerken"
            >
              <td style={{ color: '#888' }}>{r.order + 1}</td>
              <td style={{ fontWeight: 600 }}>{r.student.name}</td>
              <td><RouteBadge route={r.student.route} /></td>
              {r.max > 0 ? (
                <>
                  <td style={{ textAlign: 'right' }}>{r.scored}<span className="text-muted">/{r.max}</span></td>
                  <td style={{ textAlign: 'right' }}>{Math.round(r.pct)}%</td>
                  {data.test.grading_method && (
                    <td style={{ textAlign: 'center' }}>
                      {r.result == null ? <span className="text-muted">—</span> : isCijferGrade(r.result) ? (
                        <strong>{formatCijfer(r.result)}</strong>
                      ) : (
                        <span style={{
                          fontSize: 12, fontWeight: 700, borderRadius: 4, padding: '2px 8px',
                          background: GRADE_BG[r.result], color: GRADE_COLORS[r.result],
                        }} title={gradeLabel(r.result)}>
                          {GRADE_SHORT[r.result] ?? gradeLabel(r.result)}
                        </span>
                      )}
                    </td>
                  )}
                  {!isCijferTest && <td style={{ textAlign: 'center' }}>{r.cijfer != null ? formatCijfer(r.cijfer) : '—'}</td>}
                  {isCijferTest && (
                    <td style={{ textAlign: 'center', color: '#c07000' }}>{r.stars > 0 ? '★'.repeat(Math.min(r.stars, 8)) : ''}</td>
                  )}
                </>
              ) : (
                <td colSpan={2 + (data.test.grading_method ? 1 : 0) + 1} className="text-muted" style={{ fontStyle: 'italic' }}>
                  geen resultaat
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExportMenuItem({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
        background: 'none', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

const safeFilename = name => name.replace(/[\\/:*?"<>|]/g, '-')

export default function SessionReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [view, setViewState] = useState(searchParams.get('view') || 'student')
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [grades, setGrades] = useState([])
  const [exportTarget, setExportTarget] = useState(null)
  const [exportProgress, setExportProgress] = useState(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [showCijfer, setShowCijfer] = useState(false)
  const [showGoalsPage, setShowGoalsPage] = useState(true)
  const rubricRefs = useRef({})
  const exportMenuRef = useRef(null)

  // Keep the open tab and student in the URL so returning from Bewerken lands on the same spot
  function updateParams(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(changes)) next.set(k, String(v))
    setSearchParams(next, { replace: true })
  }

  function setView(v) {
    setViewState(v)
    updateParams({ view: v })
  }

  function selectStudent(sid) {
    setSelectedStudentId(sid)
    updateParams({ student: sid })
  }

  function handleEdit(studentId) {
    navigate(`/sessions/${id}/edit/${studentId}`)
  }

  useEffect(() => {
    api.getSessionReport(id)
      .then(d => {
        setData(d)
        setShowCijfer(d.test.grading_method === 'cijfer')
        const paramId = searchParams.get('student') ? parseInt(searchParams.get('student')) : null
        const initial = paramId && d.students.some(s => s.id === paramId)
          ? paramId
          : d.students[0]?.id ?? null
        setSelectedStudentId(initial)
      })
      .catch(() => setError('Fout bij laden van rapport.'))
  }, [id])

  useEffect(() => {
    api.getSessionGrades(id).then(setGrades).catch(() => {})
  }, [id])

  const gradeMap = useMemo(
    () => Object.fromEntries(grades.map(g => [g.student_id, g])),
    [grades]
  )

  useEffect(() => {
    if (!exportMenuOpen) return
    const close = e => { if (!exportMenuRef.current?.contains(e.target)) setExportMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [exportMenuOpen])

  useEffect(() => {
    if (!exportTarget || !data) return
    const timer = setTimeout(async () => {
      const onProgress = (done, total) => setExportProgress({ done, total })
      onProgress(0, exportTarget.studentIds.length)
      try {
        const testName = data.test.name
        const className = data.session.class_name
        if (exportTarget.mode === 'zip') {
          const pairs = exportTarget.studentIds.map(sid => {
            const student = data.students.find(s => s.id === sid)
            return { element: rubricRefs.current[sid], name: safeFilename(`toetsrapport - ${student?.name ?? sid} - ${testName}.pdf`) }
          })
          await exportRubricsZip(pairs, safeFilename(`toetsrapporten - ${className} - ${testName}.zip`), onProgress)
        } else {
          const elements = exportTarget.studentIds.map(sid => rubricRefs.current[sid])
          const filename = exportTarget.mode === 'student'
            ? `toetsrapport - ${data.students.find(s => s.id === exportTarget.studentIds[0])?.name ?? 'leerling'} - ${testName}.pdf`
            : `toetsrapporten - ${className} - ${testName}.pdf`
          await exportRubricsPDF(elements, safeFilename(filename), onProgress)
        }
      } finally {
        setExportTarget(null)
        setExportProgress(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [exportTarget])

  // mode: 'student' (one PDF), 'class' (all students in one PDF) or 'zip' (one PDF per student)
  function handleExportRubric(mode) {
    setExportMenuOpen(false)
    const studentIds = mode === 'student' ? [selectedStudentId] : data.students.map(s => s.id)
    rubricRefs.current = {}
    setExportTarget({ studentIds, mode, showCijfer, showGoalsPage })
  }

  if (!data) return <div className="page">{error || 'Laden...'}</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{data.test.name}</h1>
          <div className="text-muted" style={{ marginTop: 4 }}>
            Klas {data.session.class_name} · {new Date(data.session.created_at).toLocaleDateString('nl-NL')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, color: '#555' }}>
            <span style={{ fontWeight: 600 }}>Op het toetsrapport:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showCijfer}
                onChange={e => setShowCijfer(e.target.checked)}
              />
              Cijfer tonen
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showGoalsPage}
                onChange={e => setShowGoalsPage(e.target.checked)}
              />
              Leerdoelenbladzijde toevoegen
            </label>
          </div>
          <div ref={exportMenuRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-primary"
              onClick={() => setExportMenuOpen(o => !o)}
              disabled={!!exportTarget || !data.students.length}
            >
              {exportProgress
                ? `Bezig: ${exportProgress.done + 1} van ${exportProgress.total}`
                : 'Toetsrapport exporteren ▾'}
            </button>
            {exportMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 10,
                background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 260, padding: 4,
              }}>
                {view === 'student' && selectedStudentId && (
                  <ExportMenuItem onClick={() => handleExportRubric('student')}>
                    Huidige leerling ({data.students.find(s => s.id === selectedStudentId)?.name})
                  </ExportMenuItem>
                )}
                <ExportMenuItem onClick={() => handleExportRubric('class')}>
                  Hele klas, in 1 PDF
                </ExportMenuItem>
                <ExportMenuItem onClick={() => handleExportRubric('zip')}>
                  Hele klas, PDF per leerling (ZIP)
                </ExportMenuItem>
              </div>
            )}
          </div>
          <BackButton fallback="/reports" />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      <NeedsCheckBanner sessionId={id} students={data.students} onSelect={sid => { setView('student'); selectStudent(sid) }} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${view === 'student' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('student')}
        >
          Per leerling
        </button>
        <button
          className={`btn ${view === 'class' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('class')}
        >
          Klassenoverzicht
        </button>
        <button
          className={`btn ${view === 'results' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('results')}
        >
          Resultaten
        </button>
      </div>

      <div>
        {data.students.length === 0 ? (
          <div className="card"><p className="text-muted">Geen leerlingen gevonden voor klas {data.session.class_name}.</p></div>
        ) : view === 'student' ? (
          <StudentView
            data={data}
            selectedId={selectedStudentId}
            setSelectedId={selectStudent}
            grades={gradeMap}
            onEdit={handleEdit}
          />
        ) : view === 'results' ? (
          <ResultsView data={data} grades={gradeMap} onEdit={handleEdit} />
        ) : (
          <ClassView data={data} />
        )}
      </div>

      {/* Off-screen rubric renders used for PDF export */}
      {exportTarget && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1 }}>
          {exportTarget.studentIds.map(sid => {
            const student = data.students.find(s => s.id === sid)
            if (!student) return null
            return (
              <div key={sid} ref={el => { rubricRefs.current[sid] = el }}>
                <StudentRubric
                  student={student}
                  test={data.test}
                  session={data.session}
                  questions={data.questions}
                  scores={data.scores}
                  grade={gradeMap[sid] ?? null}
                  showCijfer={exportTarget.showCijfer}
                  showGoalsPage={exportTarget.showGoalsPage}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
