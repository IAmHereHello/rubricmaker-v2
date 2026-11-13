import RouteBadge from './RouteBadge.jsx'
import { gradeLabel } from '../utils/gradingLogic.js'
import { LEVELS, sectionsOf, partOf, applies, levelsFor, levelPoints, criterionMax, opdrachtExplanation } from '../utils/opdracht.js'

const GRADE_STYLES = {
  expert: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  beheerst: { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
  in_ontwikkeling: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
}

// Same page setup as the toetsrapport (see exportRubric.js)
const PAGE_STYLE = {
  fontFamily: 'system-ui, Arial, sans-serif',
  fontSize: 12,
  color: '#111',
  background: '#ffffff',
  padding: '28px 32px',
  width: 794,
  boxSizing: 'border-box',
}

const cell = { padding: '7px 8px', border: '1px solid #e5e7eb', verticalAlign: 'top', lineHeight: 1.35 }
// Undo the app-wide table header style (uppercase, letter spacing) on the report
const head = { ...cell, fontSize: 11, textTransform: 'none', letterSpacing: 0, background: '#f3f4f6' }

const PART_STATUS_TEXT = {
  none: 'Niet ingeleverd',
  missing: 'Niet ingeleverd',
}

// Rubric report for one student: per onderdeel the three descriptions with the
// chosen level highlighted, the points and the teacher's comment.
export default function OpdrachtRubric({ student, test, session, summary }) {
  const date = session.created_at
    ? new Date(session.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  const explanation = opdrachtExplanation(test, student, summary)
  const route = student.route

  return (
    <div data-pdf-section style={PAGE_STYLE}>
      <div style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
          Grote opdracht
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 3 }}>{test.name}</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Klas {session.class_name}{date && ` · ${date}`}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f9fafb', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{student.name}</div>
          {summary?.max > 0 && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
              Totaal: <strong>{summary.points}/{summary.max}</strong> punten
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <RouteBadge route={route} />
          {summary?.grade && GRADE_STYLES[summary.grade] && (
            <span style={{ padding: '4px 12px', borderRadius: 4, fontWeight: 700, fontSize: 12, ...GRADE_STYLES[summary.grade] }}>
              {gradeLabel(summary.grade)}
            </span>
          )}
        </div>
      </div>

      {sectionsOf(test).map(sec => {
        const crits = (sec.criteria || []).filter(c => applies(c, route))
        if (!crits.length) return null
        const part = partOf(sec)
        const status = summary?.parts?.[part]?.status
        const notIn = PART_STATUS_TEXT[status]
        return (
          <div key={sec.id} style={{ marginBottom: 16 }}>
            <div data-pdf-block style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{sec.name}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{part === 'groep' ? 'gezamenlijk' : 'individueel'}</span>
              {notIn && <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>· {notIn}</span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
              <thead>
                <tr data-pdf-block style={{ background: '#f3f4f6' }}>
                  <th style={{ ...head, width: 120, textAlign: 'left', fontWeight: 600, color: '#374151' }}>Onderdeel</th>
                  {LEVELS.map(l => (
                    <th key={l.key} style={{ ...head, textAlign: 'left', fontWeight: 600, color: l.color }}>{l.label}</th>
                  ))}
                  <th style={{ ...head, width: 56, textAlign: 'center', fontWeight: 600, color: '#374151' }}>Punten</th>
                </tr>
              </thead>
              <tbody>
                {crits.map(c => {
                  const eff = notIn ? null : summary?.effective?.[c.id]
                  const chosen = eff?.level
                  const texts = levelsFor(c, route)
                  return (
                    <tr key={c.id} data-pdf-block>
                      <td style={{ ...cell, fontWeight: 600 }}>
                        {c.name}
                        {eff?.comment && (
                          <div style={{ fontWeight: 400, fontStyle: 'italic', color: '#4b5563', marginTop: 4 }}>{eff.comment}</div>
                        )}
                      </td>
                      {LEVELS.map(l => {
                        const active = chosen === l.key
                        return (
                          <td
                            key={l.key}
                            style={{
                              ...cell,
                              color: active ? '#111' : '#6b7280',
                              background: active ? l.bg : '#fff',
                              border: active ? `2px solid ${l.color}` : cell.border,
                              fontWeight: active ? 600 : 400,
                            }}
                          >
                            {active && <span style={{ color: l.color, fontWeight: 700 }}>✓ </span>}
                            {texts?.[l.key]?.text || ''}
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, fontWeight: 400 }}>
                              {levelPoints(c, route, l.key)} pt
                            </div>
                          </td>
                        )
                      })}
                      <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>
                        {chosen ? levelPoints(c, route, chosen) : '—'}/{criterionMax(c, route)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      {explanation && (
        <div data-pdf-block style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 14px', fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
          {explanation}
        </div>
      )}
    </div>
  )
}
