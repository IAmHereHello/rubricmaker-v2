import { useState, useEffect, useRef } from 'react'
import RouteBadge from './RouteBadge.jsx'

const ROUTES = ['oranje', 'geel', 'blauw']

// Clickable route badge for the grading screen. Clicking it opens a small popup to pick
// another route. `describe(route)` returns { block, confirm } texts: `block` when the new
// route has no questions (switching is still possible), `confirm` when scores would become
// n.v.t. Without either, the switch happens right away.
export default function RoutePicker({ route, studentName, describe, onSwitch, busy }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(null)   // { route, block, confirm }
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close()
    }
    function onKey(e) { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function close() {
    setOpen(false)
    setPending(null)
  }

  async function doSwitch(r) {
    close()
    await onSwitch(r)
  }

  function pick(r) {
    if (r === route) { close(); return }
    const info = describe ? describe(r) : {}
    if (info.block || info.confirm) setPending({ route: r, ...info })
    else doSwitch(r)
  }

  return (
    <span className="route-picker" ref={wrapRef}>
      <button
        type="button"
        className="route-picker-toggle"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={busy}
        title="Route van deze leerling wijzigen"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <RouteBadge route={route} />
        <span className="route-picker-caret">{busy ? '…' : '▾'}</span>
      </button>
      {open && (
        <div className="route-picker-pop" role="dialog" aria-label="Route wijzigen">
          {!pending ? (
            <>
              <div className="route-picker-title">Route van {studentName}</div>
              <div className="route-picker-options">
                {ROUTES.map(r => (
                  <button
                    key={r}
                    type="button"
                    className={`route-picker-option${r === route ? ' current' : ''}`}
                    onClick={() => pick(r)}
                  >
                    <RouteBadge route={r} />
                    {r === route && <span className="route-picker-now">nu</span>}
                  </button>
                ))}
              </div>
              <div className="route-picker-hint">Geldt vanaf deze toets. Eerdere toetsen houden hun route.</div>
            </>
          ) : (
            <>
              <div className="route-picker-title">
                Route van {studentName} wijzigen naar <RouteBadge route={pending.route} />?
              </div>
              {pending.block && <p className="route-picker-warn">{pending.block}</p>}
              {pending.confirm && <p className="route-picker-text">{pending.confirm}</p>}
              <div className="route-picker-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => doSwitch(pending.route)}>
                  {pending.block ? 'Toch wisselen' : 'Wisselen'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={close}>
                  Annuleren
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  )
}
