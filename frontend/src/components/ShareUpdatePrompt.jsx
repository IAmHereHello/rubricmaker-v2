import { useState } from 'react'
import * as api from '../api.js'
import { downloadJson, safeFileName } from '../utils/shareFiles.js'

// After a change to a rubric that was shared with colleagues (it has a share_id), ask
// whether to send them an update. "Nee" keeps quiet for the rest of this visit to the
// edit page; after "Ja" a later change asks again, because the downloaded file is then outdated.
export function useShareUpdatePrompt(test) {
  const [step, setStep] = useState(null)       // null | 'ask' | 'busy' | 'done' | 'error'
  const [declined, setDeclined] = useState(false)
  const [fileName, setFileName] = useState('')

  function changed() {
    if (test?.share_id && !declined) setStep('ask')
  }

  async function share() {
    setStep('busy')
    try {
      const file = await api.exportRubricFile(test.id)
      const name = `${safeFileName(file?.rubric?.name || test.name)}.rubric`
      downloadJson(file, name)
      setFileName(name)
      setStep('done')
    } catch {
      setStep('error')
    }
  }

  function decline() {
    setDeclined(true)
    setStep(null)
  }

  const dialog = step && (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 460 }} role="dialog" aria-modal="true">
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
            <button className="btn btn-primary" onClick={() => setStep(null)} autoFocus>OK</button>
          </div>
        </>}
        {step === 'error' && <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Downloaden mislukt</h2>
          <p style={{ marginBottom: 16 }}>Het updatebestand kon niet worden gemaakt. Je kunt het later downloaden via Toetsen → Deel rubric.</p>
          <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => setStep(null)}>OK</button>
          </div>
        </>}
      </div>
    </div>
  )

  return { changed, dialog }
}
