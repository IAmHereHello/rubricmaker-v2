import { STAR_VALUE } from '../utils/gradingLogic.js'

// Stepper for "sterretjes": each one is half a point off the cijfer.
export default function StarInput({ value, onChange }) {
  const stars = value || 0
  const btn = { width: 32, height: 32, fontSize: 18, fontWeight: 700, cursor: 'pointer', borderRadius: 6, border: '1px solid #dde', background: '#fff' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <button type="button" style={btn} onClick={() => onChange(Math.max(0, stars - 1))} disabled={stars === 0}>−</button>
      <span style={{ minWidth: 90, textAlign: 'center', fontSize: 20, color: '#c07000' }}>
        {stars > 0 ? '★'.repeat(Math.min(stars, 8)) + (stars > 8 ? ` ${stars}` : '') : <span className="text-muted" style={{ fontSize: 14 }}>geen</span>}
      </span>
      <button type="button" style={btn} onClick={() => onChange(stars + 1)}>+</button>
      <span className="text-muted" style={{ fontSize: 12 }}>
        Sterretjes{stars > 0 ? ` (−${String(stars * STAR_VALUE).replace('.', ',')})` : ''}
      </span>
    </div>
  )
}
