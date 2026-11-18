import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import * as api from '../api.js'
import { downloadJson, safeFileName } from '../utils/shareFiles.js'

// ── "Gewijzigd, nog niet gedeeld" label (Toetsen page), kept in this browser ──
const KEY = 'rubricmaker.unsharedChanges'

export function getUnshared() {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || '[]')
    return new Set(Array.isArray(ids) ? ids.map(Number) : [])
  } catch { return new Set() }
}

function writeUnshared(ids) {
  try { localStorage.setItem(KEY, JSON.stringify([...ids])) } catch { /* storage unavailable: label is a convenience */ }
}

export function markUnshared(test) {
  if (!test?.share_id) return
  const ids = getUnshared(); ids.add(Number(test.id)); writeUnshared(ids)
}

export function clearUnshared(testId) {
  const ids = getUnshared(); ids.delete(Number(testId)); writeUnshared(ids)
}

// ── Guard for the rubric edit pages ──
// Leaving the page (menu, Terug, browser back arrow):
//   1. with unsaved edits: "Toch weggaan?" (Blijven / Weggaan zonder opslaan);
//   2. then, if this visit saved a change to a shared rubric: "Wil je deze update delen?".
// Closing or reloading the tab with unsaved edits shows the browser's own warning.
// Render only one guard per page: the router supports a single blocker at a time.
export default function ShareLeaveGuard({ test, unsaved, savedChanges }) {
  const shared = !!test?.share_id
  const askShare = shared && savedChanges
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (unsaved || askShare) && currentLocation.pathname !== nextLocation.pathname)
  const [step, setStep] = useState(null)    // null | 'unsaved' | 'ask' | 'busy' | 'done' | 'error'
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (blocker.state === 'blocked' && step === null) setStep(unsaved ? 'unsaved' : 'ask')
    if (blocker.state !== 'blocked' && step !== null) setStep(null)
  }, [blocker.state])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!unsaved) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  function stay() { setStep(null); blocker.reset?.() }
  function leave() { setStep(null); blocker.proceed?.() }
  function leaveWithoutSaving() { askShare ? setStep('ask') : leave() }
  function decline() { clearUnshared(test.id); leave() }

  async function share() {
    setStep('busy')
    try {
      const file = await api.exportRubricFile(test.id)
      const name = `${safeFileName(file?.rubric?.name || test.name)}.rubric`
      downloadJson(file, name)
      clearUnshared(test.id)
      setFileName(name)
      setStep('done')
    } catch {
      setStep('error')
    }
  }

  if (!step || blocker.state !== 'blocked') return null
  return (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 460 }} role="dialog" aria-modal="true">
        {step === 'unsaved' && <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Niet opgeslagen</h2>
          <p style={{ marginBottom: 16 }}>Je hebt wijzigingen die nog niet zijn opgeslagen. Toch weggaan?</p>
          <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={leaveWithoutSaving}>Weggaan zonder opslaan</button>
            <button className="btn btn-primary" onClick={stay} autoFocus>Blijven</button>
          </div>
        </>}
        {(step === 'ask' || step === 'busy') && <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Update delen?</h2>
          <p style={{ marginBottom: 16 }}>Deze rubric is gedeeld met collega's. Wil je deze update delen met andere collega's?</p>
          <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={decline} disabled={step === 'busy'}>Nee</button>
            <button className="btn btn-primary" onClick={share} disabled={step === 'busy'} autoFocus>Ja</button>
          </div>
        </>}
        {step === 'done' && <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Update gedownload</h2>
          <p style={{ marginBottom: 8 }}>"{fileName}" staat in je Downloads.</p>
          <p style={{ marginBottom: 16 }}>Stuur dit bestand naar je collega's, bijvoorbeeld per mail. Zij kiezen Toetsen → Importeer rubric; bij wie de rubric al heeft wordt het een update.</p>
          <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={leave} autoFocus>OK</button>
          </div>
        </>}
        {step === 'error' && <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Downloaden mislukt</h2>
          <p style={{ marginBottom: 16 }}>Het updatebestand kon niet worden gemaakt. Je kunt het later downloaden via Toetsen → Deel rubric.</p>
          <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={leave}>OK</button>
          </div>
        </>}
      </div>
    </div>
  )
}
