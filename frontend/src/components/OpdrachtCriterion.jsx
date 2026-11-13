import { useState, useEffect } from 'react'
import { LEVELS, LEVEL_BY_KEY, levelsFor, levelPoints } from '../utils/opdracht.js'

// Description text for one level; when routes differ, one line per route
function LevelText({ criterion, routes, level }) {
  const texts = routes.map(r => ({ route: r, text: levelsFor(criterion, r)?.[level]?.text || '' }))
  const distinct = [...new Set(texts.map(t => t.text))]
  if (distinct.length <= 1) {
    return <div className="opd-btn-text">{distinct[0] || <span className="text-muted">Geen beschrijving</span>}</div>
  }
  return (
    <div className="opd-btn-text">
      {texts.map(t => (
        <div key={t.route} style={{ marginTop: 3 }}>
          <span className={`badge badge-${t.route}`} style={{ padding: '0 5px', fontSize: 10, marginRight: 4 }}>{t.route[0]}</span>
          {t.text || <span className="text-muted">Geen beschrijving</span>}
        </div>
      ))}
    </div>
  )
}

function pointsLabel(criterion, routes, level) {
  const pts = routes.map(r => ({ route: r, p: levelPoints(criterion, r, level) }))
  const distinct = [...new Set(pts.map(x => x.p))]
  if (distinct.length <= 1) return `${distinct[0] ?? 0} pt`
  return pts.map(x => `${x.route[0]} ${x.p}`).join(' · ') + ' pt'
}

// One onderdeel while grading: three level buttons with their descriptions, plus a comment.
// `routes` are the routes whose descriptions/points apply (one student, or a group's members).
export default function OpdrachtCriterion({ criterion, routes, selected, comment, onSelect, onComment, note, tag, busy }) {
  const [showComment, setShowComment] = useState(!!comment)
  const [draft, setDraft] = useState(comment || '')

  useEffect(() => { setDraft(comment || ''); if (comment) setShowComment(true) }, [comment])

  return (
    <div className="opd-criterion">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1e3a5f' }}>{criterion.name || 'Naamloos onderdeel'}</span>
        {criterion.feedback && (
          <span title="Niet laten zien bij dit onderdeel betekent altijd In ontwikkeling" style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', borderRadius: 4, padding: '1px 6px' }}>
            Feedback
          </span>
        )}
        {tag}
        {note && <span className="text-muted" style={{ fontSize: 12 }}>{note}</span>}
      </div>
      <div className="opd-btn-row">
        {LEVELS.map(l => {
          const active = selected === l.key
          return (
            <button
              key={l.key}
              type="button"
              className={`opd-level-btn${active ? ' active' : ''}`}
              style={active ? { background: l.bg, borderColor: l.color, boxShadow: `inset 0 0 0 1px ${l.color}` } : undefined}
              onClick={() => onSelect(active ? null : l.key)}
              disabled={busy}
              title={active ? 'Klik nogmaals om de keuze te wissen' : l.label}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: l.color }}>
                  {active && '✓ '}{l.label}
                </span>
                <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>{pointsLabel(criterion, routes, l.key)}</span>
              </div>
              <LevelText criterion={criterion} routes={routes} level={l.key} />
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: 6 }}>
        {showComment ? (
          <textarea
            rows={2}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { if ((draft || '') !== (comment || '')) onComment(draft) }}
            placeholder="Opmerking voor op het rapport (optioneel)"
            style={{ width: '100%', fontSize: 13, minHeight: 44 }}
          />
        ) : (
          <button type="button" className="opd-link" onClick={() => setShowComment(true)}>+ opmerking</button>
        )}
      </div>
    </div>
  )
}

export function LevelChip({ level }) {
  const l = LEVEL_BY_KEY[level]
  if (!l) return <span className="text-muted">—</span>
  return (
    <span title={l.label} style={{ display: 'inline-block', minWidth: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, borderRadius: 4, padding: '1px 6px', background: l.bg, color: l.color }}>
      {l.short}
    </span>
  )
}
