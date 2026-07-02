import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import { LEVEL_LABELS } from '../constants.js'
import { exportPDF } from '../utils/exportPDF.js'
import { exportRubricsPDF, exportRubricsPerStudentPDF } from '../utils/exportRubric.js'
import StudentRubric from '../components/StudentRubric.jsx'

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

function StudentView({ data, selectedId, setSelectedId, onExportRubric, isExportingRubric }) {
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
            onClick={() => onExportRubric([student.id])}
            disabled={isExportingRubric}
          >
            {isExportingRubric ? 'Exporteren...' : 'Download rubric'}
          </button>
        )}
      </div>

      {student && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Vraag</th>
              <th>Domein</th>
              <th>Niveau</th>
              <th style={{ textAlign: 'center', width: 90 }}>Score / Max</th>
            </tr>
          </thead>
          <tbody>
            {data.questions.map((q, i) => {
              const sc = data.scores[`${student.id}|${q.id}`]
              const isGoal = !!q.learning_goal && q.learning_goal_threshold != null
              const achieved = isGoal && sc && !sc.excluded && sc.points !== null && sc.points >= q.learning_goal_threshold
              return (
                <tr key={q.id}>
                  <td style={{ color: '#888' }}>{i + 1}</td>
                  <td>
                    {q.description}
                    {isGoal && (
                      <span style={{ marginLeft: 6, fontSize: 11, background: '#e8f0fc', color: '#1a6ecc', borderRadius: 3, padding: '1px 5px' }}>
                        {q.learning_goal} ≥{q.learning_goal_threshold}
                      </span>
                    )}
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
    </div>
  )
}

function ClassView({ data }) {
  const colStyle = { textAlign: 'center', minWidth: 76, fontSize: 13 }

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
                    <span style={{ fontWeight: 500 }}>{q.description}</span>
                    {isGoal && (
                      <span style={{ marginLeft: 6, fontSize: 11, background: '#e8f0fc', color: '#1a6ecc', borderRadius: 3, padding: '1px 4px' }}>
                        {q.learning_goal} ≥{q.learning_goal_threshold}
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
                      ? `${avg.avg_points}/${q.max_score}`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SessionReport() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('student')
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [grades, setGrades] = useState([])
  const [exportTarget, setExportTarget] = useState(null)
  const [isExportingRubric, setIsExportingRubric] = useState(false)
  const [showClassAverage, setShowClassAverage] = useState(true)
  const reportRef = useRef(null)
  const rubricRefs = useRef({})

  useEffect(() => {
    api.getSessionReport(id)
      .then(d => {
        setData(d)
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
    if (!exportTarget || !data) return
    const timer = setTimeout(async () => {
      setIsExportingRubric(true)
      try {
        const date = data.session.created_at.slice(0, 10)
        if (exportTarget.perStudent) {
          const pairs = exportTarget.studentIds.map(sid => {
            const student = data.students.find(s => s.id === sid)
            return { element: rubricRefs.current[sid], name: `rubric-${student?.name ?? sid}-${date}.pdf` }
          })
          await exportRubricsPerStudentPDF(pairs)
        } else {
          const elements = exportTarget.studentIds.map(sid => rubricRefs.current[sid]).filter(Boolean)
          const filename = exportTarget.studentIds.length === 1
            ? `rubric-${data.students.find(s => s.id === exportTarget.studentIds[0])?.name ?? 'leerling'}-${date}.pdf`
            : `rubrieken-${data.session.class_name}-${date}.pdf`
          await exportRubricsPDF(elements, filename)
        }
      } finally {
        setExportTarget(null)
        setIsExportingRubric(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [exportTarget])

  async function handleExport() {
    if (!reportRef.current || !data) return
    setExporting(true)
    try {
      const date = data.session.created_at.slice(0, 10)
      await exportPDF(
        reportRef.current,
        `rapport-${data.test.name}-${data.session.class_name}-${date}.pdf`
      )
    } finally {
      setExporting(false)
    }
  }

  function handleExportRubric(studentIds, perStudent = false) {
    rubricRefs.current = {}
    setExportTarget({ studentIds, perStudent, showClassAverage })
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showClassAverage}
              onChange={e => setShowClassAverage(e.target.checked)}
            />
            Klasgemiddelde tonen op rapport
          </label>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporteren...' : 'Exporteer PDF'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleExportRubric(data.students.map(s => s.id))}
            disabled={isExportingRubric || !data?.students?.length}
          >
            {isExportingRubric ? 'Exporteren...' : 'Rubrieken exporteren'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleExportRubric(data.students.map(s => s.id), true)}
            disabled={isExportingRubric || !data?.students?.length}
          >
            {isExportingRubric ? 'Exporteren...' : 'Per leerling exporteren'}
          </button>
          <Link to="/reports" className="btn btn-secondary">← Terug</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

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
      </div>

      <div ref={reportRef}>
        {data.students.length === 0 ? (
          <div className="card"><p className="text-muted">Geen leerlingen gevonden voor klas {data.session.class_name}.</p></div>
        ) : view === 'student' ? (
          <StudentView
            data={data}
            selectedId={selectedStudentId}
            setSelectedId={setSelectedStudentId}
            onExportRubric={handleExportRubric}
            isExportingRubric={isExportingRubric}
          />
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
                  classAverages={data.class_averages}
                  grade={gradeMap[sid] ?? null}
                  showClassAverage={exportTarget.showClassAverage}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
