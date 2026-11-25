import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import BackButton from '../components/BackButton.jsx'
import { openScan, analyzePage, readPage, rectToDataUrl } from '../utils/scanReader.js'
import { groupPages } from '../utils/scanGroups.js'
import { firstIndex, rubricChanges, summarize, counts } from '../utils/scanImportLogic.js'

const JPEG = 0.8

const toBlob = async dataUrl => (await fetch(dataUrl)).blob()

// Importeer scans, step 1: read a PDF (or photos) of rubrics printed with Print rubric.
// Everything is stored straight away as a lopende scan-import, then checked per leerling
// in ScanReview.
export default function ScanImport() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const navigate = useNavigate()

  async function readFiles(files) {
    setError('')
    setBusy(true)
    const pages = []
    const other = []      // pages that need the teacher first: { index, label, kind, error, image }
    const sheetCache = {}
    let index = 0
    let empties = 0
    try {
      const studs = await api.getStudents()
      const known = new Set(studs.map(s => s.id))
      const studentById = Object.fromEntries(studs.map(s => [s.id, s]))
      for (const file of files) {
        const scan = await openScan(file)
        for (let n = 1; n <= scan.pages; n++) {
          index++
          setProgress({ text: `Pagina ${n} van ${scan.pages} lezen${files.length > 1 ? ` (${file.name})` : ''}...` })
          await new Promise(r => setTimeout(r, 0))   // let the progress text show
          const label = files.length > 1 ? `${file.name}, pagina ${n}` : `Pagina ${n}`
          try {
            const canvas = await scan.render(n)
            const res = analyzePage(canvas)
            if (res.empty) { empties++; continue }
            if (res.error) {
              other.push({ index, label, kind: 'failed', error: res.error, image: canvas.toDataURL('image/jpeg', 0.6) })
              continue
            }
            const image = rectToDataUrl(res.rect, null, JPEG)
            if (res.noQr) {
              other.push({ index, label, kind: 'assign', image,
                error: 'De QR-code is onleesbaar. Kies de toets en de leerling, dan worden de hokjes alsnog gelezen.' })
              continue
            }
            if (!(res.sheetId in sheetCache)) {
              const [sheet] = await api.getPrintSheets([res.sheetId])
              sheetCache[res.sheetId] = sheet || null
            }
            const sheet = sheetCache[res.sheetId]
            if (!sheet) {
              other.push({ index, label, kind: 'assign', image,
                error: 'Dit blad is niet met deze Rubricmaker geprint. Kies de toets en de leerling; de hokjes worden gelezen met de laatst geprinte indeling, als die er is.' })
              continue
            }
            pages.push({
              index, label, sheet, image,
              readings: readPage(res.rect, sheet.layout),
              nameImage: sheet.student_id == null && sheet.layout.name ? rectToDataUrl(res.rect, sheet.layout.name, 0.8) : null,
            })
          } catch {
            other.push({ index, label, kind: 'failed', error: 'Deze pagina kon niet gelezen worden.' })
          }
        }
        scan.close?.()
      }

      setProgress({ text: 'Opslaan...' })
      const tests = {}
      for (const id of new Set(pages.map(p => p.sheet.test_id))) {
        try { tests[id] = await api.getTest(id) } catch { /* deleted toets */ }
      }
      for (const p of pages) {
        if (!tests[p.sheet.test_id]) other.push({ index: p.index, label: p.label, kind: 'failed', error: 'De toets van dit blad bestaat niet meer.', image: p.image })
      }
      const images = {}
      for (const p of [...pages, ...other]) if (p.image) images[p.index] = p.image

      const rubricSteps = groupPages(pages.filter(p => tests[p.sheet.test_id])).map(r => {
        const lost = r.studentId && !known.has(r.studentId)
        const step = {
          kind: 'rubric', key: r.key, testId: r.testId, route: r.route,
          studentId: lost ? null : r.studentId, blank: r.blank, lostStudent: !!lost, duplicatePage: !!r.duplicate,
          pages: r.pages.map(({ index: i, label, sheet, readings, nameImage }) => ({ index: i, label, sheet, readings, nameImage })),
          missingPages: r.missingPages, items: r.items, status: 'open',
        }
        step.changes = rubricChanges(step, tests[r.testId], studentById[step.studentId]).length > 0
        return step
      })
      const otherSteps = other.map(o => ({ kind: o.kind, key: `${o.kind}:${o.index}`, index: o.index, label: o.label, error: o.error, hasImage: !!o.image, status: 'open' }))
      const steps = [...rubricSteps, ...otherSteps].sort((a, b) => firstIndex(a) - firstIndex(b))
      if (!steps.length) {
        setError(empties ? 'Alle pagina\'s in deze scan zijn leeg.' : 'Er is niets gevonden in deze scan.')
        return
      }

      const state = { steps, targets: {}, cur: 0, emptyPages: empties }
      const imp = await api.createScanImport({ summary: summarize(steps, tests, studentById), ...counts(steps), state })
      let n = 0
      for (const [i, dataUrl] of Object.entries(images)) {
        n++
        setProgress({ text: `Scans opslaan ${n} van ${Object.keys(images).length}...` })
        await api.putScanPage(imp.id, i, await toBlob(dataUrl))
      }
      navigate(`/scans/import/${imp.id}`, { replace: true })
    } catch (e) {
      setError(api.errorText(e, 'Lezen van de scan mislukt.'))
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <BackButton fallback="/sessions/new" />
      <div className="page-header"><h1>Importeer scans</h1></div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <p style={{ marginBottom: 12 }}>
          Scan de ingevulde rubrics (geprint met <strong>Print rubric</strong>) en kies hier de PDF. Meerdere leerlingen en
          toetsen in één PDF mag, de volgorde maakt niet uit. Foto's van de bladen werken ook, als alle vier de zwarte hoekjes erop staan.
        </p>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          De scan wordt op deze computer gelezen en daarna bewaard als lopende import bij Nakijken. Je controleert daarna per leerling;
          pas dan komen de punten in de nakijkronde.
        </p>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*" multiple style={{ display: 'none' }}
          onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) readFiles(f) }} />
        <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Bezig...' : 'Kies PDF of foto\'s'}
        </button>
        {progress && <span className="text-muted" style={{ marginLeft: 12 }}>{progress.text}</span>}
      </div>
    </div>
  )
}
