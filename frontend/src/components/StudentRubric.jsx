import RouteBadge from './RouteBadge.jsx'
import { GoalRequirement, GoalSummary } from './LearningGoals.jsx'
import { LEVEL_LABELS } from '../constants.js'
import { STAR_VALUE, isCijferGrade, gradeLabel, formatCijferFormula, formatCijfer, displayCijfer, learningGoalResults } from '../utils/gradingLogic.js'

const GRADE_STYLES = {
  expert: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  beheerst: { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
  in_ontwikkeling: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
}

function formatThreshold(test, route) {
  if (!test?.grading_method || !test?.grade_config) return null
  if (test.grading_method === 'cijfer') return `Cijfer = ${formatCijferFormula(test.grade_config)}`
  const cfg = test.grade_config[route]
  if (!cfg) return null
  if (test.grading_method === 'points') {
    return `Beheerst vanaf ${cfg.beheerst}%, Expert vanaf ${cfg.expert}%`
  }
  if (test.grading_method === 'goals') {
    const label = n => `${n} leerdoel${n === 1 ? '' : 'en'}`
    return `Beheerst vanaf ${label(cfg.beheerst)}, Expert vanaf ${label(cfg.expert)}`
  }
  return null
}

// Each section is rendered from the top of a new PDF page (see exportRubric.js).
const PAGE_STYLE = {
  fontFamily: 'system-ui, Arial, sans-serif',
  fontSize: 13,
  color: '#111',
  background: '#ffffff',
  padding: '28px 36px',
  width: 794,
  boxSizing: 'border-box',
}

export default function StudentRubric({ student, test, session, questions, scores, grade, showCijfer, showGoalsPage = true }) {
  const applicable = questions.filter(q => !scores[`${student.id}|${q.id}`]?.excluded)

  let totalScored = 0, totalMax = 0
  applicable.forEach(q => {
    const sc = scores[`${student.id}|${q.id}`]
    if (sc && sc.points !== null && sc.points !== undefined) {
      totalScored += sc.points
      totalMax += q.max_score
    }
  })

  const isCijferTest = test.grading_method === 'cijfer'
  const cijferValue = (showCijfer ?? isCijferTest)
    ? displayCijfer(test, totalScored, totalMax, grade?.grade, grade?.stars)
    : null

  const goals = learningGoalResults(questions, scores, student.id)
  const goalsAchieved = goals.filter(g => g.achieved).length
  const goalsTotal = goals.length

  const thresholdText = formatThreshold(test, student.route)
  const date = new Date(session.created_at).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
    <div data-pdf-section style={PAGE_STYLE}>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <RouteBadge route={student.route} />
            {!isCijferTest && grade?.grade && GRADE_STYLES[grade.grade] && (
              <span style={{ padding: '4px 12px', borderRadius: 4, fontWeight: 700, fontSize: 12, ...GRADE_STYLES[grade.grade] }}>
                {gradeLabel(grade.grade)}
              </span>
            )}
            {cijferValue && (
              <span style={{ padding: '4px 12px', borderRadius: 4, fontWeight: 700, fontSize: 16, ...GRADE_STYLES.beheerst }}>
                {formatCijfer(cijferValue)}
              </span>
            )}
          </div>
          {isCijferTest && cijferValue && grade?.stars > 0 && (
            <div style={{ fontSize: 11, color: '#b45309', textAlign: 'right' }}>
              {grade.stars} sterretje{grade.stars === 1 ? '' : 's'} (−{String(grade.stars * STAR_VALUE).replace('.', ',')})
            </div>
          )}
          {thresholdText && (
            <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'right' }}>{thresholdText}</div>
          )}
        </div>
      </div>

      {/* Score table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 22 }}>
        <thead>
          <tr data-pdf-block style={{ background: '#f3f4f6' }}>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'left' }}>Opgave</th>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'left', width: 90 }}>Domein</th>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'left', width: 150 }}>Niveau</th>
            <th style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'center', width: 82 }}>Score/Max</th>
          </tr>
        </thead>
        <tbody>
          {applicable.map(q => {
            const sc = scores[`${student.id}|${q.id}`]
            const isGoal = !!q.learning_goal && q.learning_goal_threshold != null
            const passed = isGoal && sc && sc.points !== null && sc.points >= q.learning_goal_threshold
            return (
              <tr key={q.id} data-pdf-block style={{ borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' }}>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600 }}>{q.description}</div>
                  <GoalRequirement question={q} />
                  {sc?.comment && (
                    <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 3 }}>
                      {sc.comment}
                    </div>
                  )}
                </td>
                <td style={{ padding: '8px 10px', color: '#6b7280' }}>{q.domain || '—'}</td>
                <td style={{ padding: '8px 10px', color: '#6b7280' }}>{LEVEL_LABELS[q.pyramid_level] || q.pyramid_level || '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>
                  {sc && sc.points !== null ? sc.points : '—'}/{q.max_score}
                  {isGoal && sc && sc.points !== null && (
                    <span style={{ marginLeft: 3, color: passed ? '#15803d' : '#b91c1c' }}>{passed ? '✓' : '✗'}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>

    {/* Learning goals page, printed on the back when exported double-sided */}
    {showGoalsPage && goalsTotal > 0 && (
      <div data-pdf-section style={PAGE_STYLE}>
        <div style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
            Leerdoelen
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 3 }}>{student.name}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {test.name} · Klas {session.class_name} · {date}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            <strong style={{ color: goalsAchieved === goalsTotal ? '#15803d' : '#b91c1c' }}>
              {goalsAchieved} van {goalsTotal}
            </strong>{' '}leerdoelen behaald
          </div>
        </div>
        <GoalSummary goals={goals} showTitle={false} />
      </div>
    )}
    </>
  )
}
