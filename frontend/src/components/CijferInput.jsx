import { useState, useEffect } from 'react'
import { parseCijfer, isCijfer, toStoredCijfer, formatCijfer, CIJFER_MIN, CIJFER_MAX } from '../utils/cijfer.js'

// Editable cijfer for the review round.
//  - value:     the cijfer to show, in stored form ("7.3"), or falsy when there is none yet
//  - autoValue: the cijfer calculated from the scores
//  - onChange:  called with the stored form when the teacher enters another cijfer
//  - onRestore: called when the teacher wants the calculated cijfer back
//  - onInvalidChange: called with true while the field holds something that is not a cijfer, so
//    the parent can hold back "Bevestigen" instead of confirming a value the teacher did not mean
// Typing is buffered and only committed on blur/Enter, so a half-typed "7," never reaches the parent.
export default function CijferInput({ value, autoValue, onChange, onRestore, onInvalidChange }) {
  const shown = isCijfer(value) ? formatCijfer(value) : ''
  const [draft, setDraft] = useState(shown)
  const [invalid, setInvalid] = useState(false)

  // Follow the parent: another student, a recalculated cijfer, a restored automatic cijfer.
  useEffect(() => { setDraft(shown); setInvalid(false) }, [shown])

  useEffect(() => {
    onInvalidChange?.(invalid)
    return () => onInvalidChange?.(false)
  }, [invalid])

  function commit() {
    if (draft.trim() === '') { setDraft(shown); setInvalid(false); return }
    const cijfer = parseCijfer(draft)
    if (cijfer === null) { setInvalid(true); return }
    const stored = toStoredCijfer(cijfer)
    setInvalid(false)
    setDraft(formatCijfer(stored))
    if (stored !== value) onChange(stored)
  }

  const hasAuto = isCijfer(autoValue)
  const overridden = hasAuto && isCijfer(value) && value !== autoValue

  return (
    <div>
      <div className="grade-score-row" style={{ marginBottom: 0 }}>
        <input
          type="text"
          inputMode="decimal"
          className="grade-score-input"
          aria-label="Cijfer"
          aria-invalid={invalid}
          placeholder="—"
          value={draft}
          style={invalid ? { borderColor: '#c0392b' } : undefined}
          onChange={e => { setDraft(e.target.value); setInvalid(false) }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(shown); setInvalid(false) }
          }}
        />
        <span className="grade-score-max">/ {CIJFER_MAX}</span>
      </div>

      {/* One fixed-height status line: text that appears when the field loses focus must not push the
          buttons below it away from a click that is already under way. */}
      <div style={{ minHeight: 24, paddingTop: 8, fontSize: 12, color: '#888' }}>
        {invalid ? (
          <span style={{ color: '#c0392b' }}>Vul een cijfer in tussen {CIJFER_MIN} en {CIJFER_MAX}.</span>
        ) : !hasAuto && !isCijfer(value) ? (
          <span>Geen automatisch cijfer mogelijk. Vul handmatig een cijfer in.</span>
        ) : overridden ? (
          <span>
            Automatisch: <strong>{formatCijfer(autoValue)}</strong>
            {' · '}
            <button
              onClick={onRestore}
              style={{ background: 'none', border: 'none', color: '#1a6ecc', cursor: 'pointer', padding: 0, fontSize: 12 }}
            >
              Herstel automatische beoordeling
            </button>
          </span>
        ) : null}
      </div>
    </div>
  )
}
