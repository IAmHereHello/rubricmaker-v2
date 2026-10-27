// Learning goal display shared by the on-screen student view and the PDF report.
// Inline styles only, so html2canvas renders them the same in the PDF.

const GREEN = '#15803d'
const RED = '#b91c1c'

function Mark({ passed }) {
  return <span style={{ fontWeight: 700, color: passed ? GREEN : RED }}>{passed ? '✓' : '✗'}</span>
}

// Second line under a question: which goal it counts for and the minimum score.
export function GoalRequirement({ question, fontSize = 11 }) {
  if (!question.learning_goal || question.learning_goal_threshold == null) return null
  return (
    <div style={{ fontSize, color: '#1a6ecc', marginTop: 3 }}>
      Leerdoel: <strong>{question.learning_goal}</strong>
      {' · '}behaald bij minimaal {question.learning_goal_threshold} van {question.max_score} punten
    </div>
  )
}

// Block listing every goal, whether it is achieved and the questions it depends on.
export function GoalSummary({ goals, fontSize = 12, showTitle = true }) {
  if (!goals.length) return null
  return (
    <div>
      {showTitle && (
        <div style={{ fontSize: fontSize - 1, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          Leerdoelen
        </div>
      )}
      <div style={{ fontSize: fontSize - 1, color: '#6b7280', marginBottom: 8 }}>
        Een leerdoel is behaald als je bij elke opgave van dat leerdoel de minimumscore haalt.
      </div>
      {goals.map(g => (
        <div
          key={g.name}
          data-pdf-block
          style={{
            border: `1px solid ${g.achieved ? '#86efac' : '#fca5a5'}`,
            background: g.achieved ? '#f0fdf4' : '#fef2f2',
            borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              flexShrink: 0, fontWeight: 700, fontSize: fontSize - 1, borderRadius: 4, padding: '2px 8px',
              background: g.achieved ? '#dcfce7' : '#fee2e2', color: g.achieved ? '#166534' : '#991b1b',
            }}>
              {g.achieved ? '✓ Behaald' : '✗ Niet behaald'}
            </span>
            <strong>{g.name}</strong>
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {g.items.map(({ question: q, points, passed }) => (
              <div key={q.id} style={{ color: '#374151' }}>
                {q.description}: {points ?? '—'} van {q.max_score} punten (minimaal {q.learning_goal_threshold}) <Mark passed={passed} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
