import { useState, useEffect } from 'react'
import { formatCijfer } from '../utils/gradingLogic.js'

// Editable cijfer (0-10, 1 decimal). Calls onChange with a string like "7.4".
export default function CijferInput({ value, onChange }) {
  const shown = value != null ? formatCijfer(value) : ''
  const [text, setText] = useState(shown)

  useEffect(() => {
    const parsed = parseFloat(text.replace(',', '.'))
    if (value == null || isNaN(parsed) || Math.abs(parsed - Number(value)) >= 0.05) setText(shown)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e) {
    const t = e.target.value
    setText(t)
    const n = parseFloat(t.replace(',', '.'))
    if (!isNaN(n) && n >= 0 && n <= 10) onChange((Math.round(n * 10) / 10).toFixed(1))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <input
        type="text" inputMode="decimal" value={text}
        onChange={handleChange}
        onBlur={() => setText(shown)}
        style={{ width: 90, fontSize: 22, fontWeight: 700, textAlign: 'center', padding: '6px 8px' }}
      />
      <span className="text-muted" style={{ fontSize: 12 }}>Cijfer (0 - 10), aan te passen</span>
    </div>
  )
}
