import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import RouteBadge from './RouteBadge.jsx'
import { LEVEL_LABELS, ROUTE_COLORS } from '../constants.js'

const GRADE_LABELS = { expert: 'Expert', beheerst: 'Beheerst', in_ontwikkeling: 'In Ontwikkeling' }
const GRADE_STYLES = {
  expert: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  beheerst: { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
  in_ontwikkeling: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
}

function computeGoals(questions, scores, studentId) {
  const groups = {}
  questions.forEach(q => {
    if (!q.learning_goal || q.learning_goal_threshold == null) return
    const sc = scores[`${studentId}|${q.id}`]
    if (sc?.excluded) return
    if (!groups[q.learning_goal]) groups[q.learning_goal] = { total: 0, passed: 0 }
    groups[q.learning_goal].total++
    if (sc && sc.points !== null && sc.points >= q.learning_goal_threshold)
      groups[q.learning_goal].passed++
  })
  return groups
}

export default function StudentRubric({ student, test, session, questions, scores, classAverages, grade }) {
  const applicable = questions.filter(q => !scores[`${student.id}|${q.id}`]?.excluded)

  let totalScored = 0, totalMax = 0
  applicable.forEach(q => {
    const sc = scores[`${student.id}|${q.id}`]
    if (sc && sc.points !== null && sc.points !== undefined) {
      totalScored += sc.points
      totalMax += q.max_score
    }
  })

  const goalGroups = computeGoals(questions, scores, student.id)
  const goalNames = Object.keys(goalGroups).filter(n => goalGroups[n].total > 0)
  const goalsAchieved = goalNames.filter(n => goalGroups[n].passed === goalGroups[n].total).length
  const goalsTotal = goalNames.length

  const barData = applicable.map((q, i) => {
    const sc = scores[`${student.id}|${q.id}`]
    const avg = classAverages[String(q.id)]
    return {
      name: `V${i + 1}`,
      leerling: sc && sc.points !== null ? sc.points : undefined,
      gemiddelde: avg?.avg_points != null ? avg.avg_points : undefined,
    }
  })

  const routeColor = ROUTE_COLORS[student.route] || '#6b7280'
  const date = new Date(session.created_at).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const hasBarData = barData.some(d => d.leerling !== undefined)

  return (
    <div style={{
      fontFamily: 'system-ui, Arial, sans-serif',
      fontSize: 13,
      color: '#111',
      background: '#ffffff',
      padding: '28px 36px',
      width: 794,
      boxSizing: 'border-box',
    }}>
      {/* Document header */}
      <div style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
          Toetsrapport
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 3 }}>{test.name}</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Klas {session.class_name} · {date}</div>
      </div>

      {/* Student info row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#f9fafb', borderRadius: 6, padding: '10px 14px', marginBottom: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{student.name}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
            {totalMax > 0 && (
              <span>Totaal: <strong>{totalScored}/{totalMax}</strong> ({Math.round(totalScored / totalMax * 100)}%)</span>
            )}
            {goalsTotal > 0 && (
              <span> · Leerdoelen:{' '}
                <strong style={{ color: goalsAchieved === goalsTotal ? '#15803d' : '#b91c1c' }}>
                  {goalsAchieved}/{goalsTotal}
                </strong>{' '}behaald
              </span>
            )}
          </div>
        </div>
        <RouteBadge route={student.route} />
        {grade?.grade && GRADE_STYLES[grade.grade] && (
          <span style={{ padding: '4px 12px', borderRadius: 4, fontWeight: 700, fontSize: 12, ...GRADE_STYLES[grade.grade] }}>
            {GRADE_LABELS[grade.grade]}
          </span>
        )}
      </div>

      {/* Score table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 22 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'center', width: 28 }}>#</th>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'left' }}>Vraag</th>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'left', width: 90 }}>Domein</th>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'left', width: 150 }}>Niveau</th>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'center', width: 82 }}>Score/Max</th>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'center', width: 58 }}>Gem.</th>
          </tr>
        </thead>
        <tbody>
          {applicable.map((q, i) => {
            const sc = scores[`${student.id}|${q.id}`]
            const avg = classAverages[String(q.id)]
            const isGoal = !!q.learning_goal && q.learning_goal_threshold != null
            const passed = isGoal && sc && sc.points !== null && sc.points >= q.learning_goal_threshold
            return (
              <tr key={q.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 10px', textAlign: 'center', color: '#9ca3af' }}>{i + 1}</td>
                <td style={{ padding: '6px 10px' }}>
                  {q.description}
                  {isGoal && (
                    <span style={{ marginLeft: 5, fontSize: 10, background: '#e8f0fc', color: '#1a6ecc', borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap' }}>
                      {q.learning_goal} ≥{q.learning_goal_threshold}
                    </span>
                  )}
                </td>
                <td style={{ padding: '6px 10px', color: '#6b7280' }}>{q.domain || '—'}</td>
                <td style={{ padding: '6px 10px', color: '#6b7280' }}>{LEVEL_LABELS[q.pyramid_level] || q.pyramid_level || '—'}</td>
                <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600 }}>
                  {sc && sc.points !== null ? sc.points : '—'}/{q.max_score}
                  {isGoal && sc && sc.points !== null && (
                    <span style={{ marginLeft: 3, color: passed ? '#15803d' : '#b91c1c' }}>{passed ? '✓' : '✗'}</span>
                  )}
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center', color: '#6b7280' }}>
                  {avg?.avg_points != null ? avg.avg_points : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Bar chart: student score vs class average per applicable question */}
      {hasBarData && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Scoreverdeling per vraag
          </div>
          <BarChart width={710} height={160} data={barData} margin={{ top: 4, right: 10, bottom: 0, left: -10 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(val, key) => [val ?? '—', key === 'leerling' ? student.name : 'Klasgemiddelde']} />
            <Legend formatter={key => key === 'leerling' ? student.name : 'Klasgemiddelde'} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="leerling" fill={routeColor} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="gemiddelde" fill="#d1d5db" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </div>
      )}
    </div>
  )
}
