import { useEffect, useState } from 'react'
import * as api from '../api.js'
import LevelPicker from './LevelPicker.jsx'
import { levelLabel, sortLabels } from '../utils/levels.js'

// Leerjaar groups of a rubric (Toetsen page sorts on these). Saved right away on each click,
// separately from the rubric itself, so it never marks a shared rubric as edited.
export default function RubricLevels({ test, onChange }) {
  const [classLabels, setClassLabels] = useState([])
  const [extra, setExtra] = useState(null)       // level being added via "Andere toevoegen"
  const [status, setStatus] = useState('')
  const levels = test.levels || []

  useEffect(() => {
    api.getClassLevels()
      .then(lv => setClassLabels(Object.values(lv).map(levelLabel).filter(Boolean)))
      .catch(() => {})
  }, [])

  const options = sortLabels([...classLabels, ...levels])

  async function save(next) {
    const sorted = sortLabels(next)
    setStatus('')
    try {
      const updated = await api.updateTest(test.id, { levels: sorted })
      onChange(updated.levels || [])
      setStatus('Opgeslagen')
    } catch { setStatus('Opslaan mislukt') }
  }

  function toggle(label) {
    save(levels.includes(label) ? levels.filter(l => l !== label) : [...levels, label])
  }

  function addExtra() {
    const label = levelLabel(extra)
    if (!label) return
    setExtra(null)
    if (!levels.includes(label)) save([...levels, label])
  }

  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14, color: '#1e3a5f' }}>Leerjaar</strong>
        <div className="rubric-levels">
          {options.length === 0 && !extra && (
            <span className="text-muted" style={{ fontSize: 13 }}>Nog geen klassen met een leerjaar. Stel dat in bij Leerlingen → Klas bewerken, of voeg er hier een toe.</span>
          )}
          {options.map(label => (
            <label key={label} className={`chip${levels.includes(label) ? ' on' : ''}`}>
              <input type="checkbox" checked={levels.includes(label)} onChange={() => toggle(label)} />
              {label}
            </label>
          ))}
          {extra ? (
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <LevelPicker compact value={extra} onChange={setExtra} />
              <button className="btn btn-primary btn-sm" onClick={addExtra} disabled={!levelLabel(extra)}>Toevoegen</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setExtra(null)}>Annuleer</button>
            </span>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setExtra({ leerjaar: null, niveaus: '' })}>+ Andere toevoegen</button>
          )}
        </div>
        {status && <span className="text-muted" style={{ fontSize: 12 }}>{status}</span>}
      </div>
    </div>
  )
}
