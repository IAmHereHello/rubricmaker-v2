import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import * as api from '../api.js'
import { downloadJson, safeFileName } from '../utils/shareFiles.js'

// ── "Gedeeld, bewerkt" tag (Toetsen page): shared rubric saved since it was last shared. Kept in this browser ──
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
// Share question "Wil je deze update delen?" for a shared rubric (share_id set):
//   - right after an Opslaan click (parent bumps `askCount`);
//   - when leaving the page (menu, Terug, browser back arrow) with saved changes not yet answered.
// Unsaved edits ask "Toch weggaan?" first (Blijven / Weggaan zonder opslaan); closing or
// reloading the tab with unsaved edits shows the browser's own warning.
// "Nee" keeps quiet for the rest of this visit (the tag on Toetsen stays); after "Ja" only later saves ask again.
// `saveCount` counts every saved change in this visit.
// Render only one guard per page: the router supports a single blocker at a time.
export default function ShareLeaveGuard({ test, unsaved, saveCount = 0, askCount = 0 }) {
  const shared = !!test?.share_id
  const [answeredAt, setAnsweredAt] = useState(0)   // saveCount covered by the last Ja
  const [declined, setDeclined] = useState(false)
  const askShare = shared && !declined && saveCount > answeredAt
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (unsaved || askShare) && currentLocation.pathname !== nextLocation.pathname)
  const [step, setStep] = useState(null)    // null | 'unsaved' | 'ask' | 'busy' | 'done' | 'error'
  const [fileName, setFileName] = useState('')
  const leaving = blocker.state === 'blocked'

  useEffect(() => {
    if (leaving && step === null) setStep(unsaved ? 'unsaved' : 'ask')
    if (!leaving && blocker.state !== 'unblocked' && step !== null) setStep(null)
  }, [blocker.state])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (askCount > 0 && shared && !declined) setStep('ask')
  }, [askCount])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!unsaved) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  function stay() { setStep(null); blocker.reset?.() }
  function close() { setStep(null); if (leaving) blocker.proceed?.() }
  function leaveWithoutSaving() { askShare ? setStep('ask') : close() }
  function decline() { setDeclined(true); close() }   // the "Gedeeld, bewerkt" tag stays as a reminder

  async function share() {
    setStep('busy')
    try {
      const file = await api.exportRubricFile(test.id)
      const name = `${safeFileName(file?.rubric?.name || test.name)}.rubric`
      downloadJson(file, name)
      clearUnshared(test.id)
      setAnsweredAt(saveCount)
      setFileName(name)
      setStep('done')
    } catch {
      setStep('error')
    }
  }

  if (!step) return null
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
        {step === 'done' && <UpdateDownloadedBody fileName={fileName} onClose={close} />}
        {step === 'error' && <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Downloaden mislukt</h2>
          <p style={{ marginBottom: 16 }}>Het updatebestand kon niet worden gemaakt. Je kunt het later downloaden via Toetsen → Deel rubric.</p>
          <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={close}>OK</button>
          </div>
        </>}
      </div>
    </div>
  )
}

function UpdateDownloadedBody({ fileName, onClose }) {
  return <>
    <h2 style={{ fontSize: 16, marginBottom: 8 }}>Update gedownload</h2>
    <p style={{ marginBottom: 8 }}>"{fileName}" staat in je Downloads.</p>
    <p style={{ marginBottom: 16 }}>Stuur dit bestand naar je collega's, bijvoorbeeld per mail. Zij kiezen Toetsen → Importeer rubric; bij wie de rubric al heeft wordt het een update.</p>
    <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
      <button className="btn btn-primary" onClick={onClose} autoFocus>OK</button>
    </div>
  </>
}

// "Update gedownload" popup on its own (Toetsen → Deel updates).
export function UpdateDownloadedDialog({ fileName, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 460 }} role="dialog" aria-modal="true">
        <UpdateDownloadedBody fileName={fileName} onClose={onClose} />
      </div>
    </div>
  )
}
