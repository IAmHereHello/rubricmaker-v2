import { LEERJAREN, NIVEAUS, cleanNiveaus } from '../utils/levels.js'

// Leerjaar dropdown + mavo/havo/vwo ticks. value: { leerjaar, niveaus } or null.
export default function LevelPicker({ value, onChange, compact = false }) {
  const leerjaar = value?.leerjaar || ''
  const niveaus = value?.niveaus || ''
  function setYear(v) {
    onChange(v ? { leerjaar: Number(v), niveaus } : null)
  }
  function toggle(key) {
    const next = niveaus.includes(key) ? niveaus.replace(key, '') : niveaus + key
    onChange({ leerjaar: leerjaar || null, niveaus: cleanNiveaus(next) })
  }
  return (
    <div className="level-picker" style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 12, flexWrap: 'wrap' }}>
      <select value={leerjaar} onChange={e => setYear(e.target.value)} aria-label="Leerjaar">
        <option value="">{compact ? 'Leerjaar…' : 'Kies leerjaar…'}</option>
        {LEERJAREN.map(n => <option key={n} value={n}>Leerjaar {n}</option>)}
      </select>
      {NIVEAUS.map(n => (
        <label key={n.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 400, margin: 0, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={niveaus.includes(n.key)} onChange={() => toggle(n.key)} disabled={!leerjaar} />
          {n.label}
        </label>
      ))}
    </div>
  )
}
