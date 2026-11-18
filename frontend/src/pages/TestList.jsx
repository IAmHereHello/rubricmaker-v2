import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import TeacherNameDialog from '../components/TeacherNameDialog.jsx'
import { downloadJson, readJsonFile, safeFileName } from '../utils/shareFiles.js'
import { getUnshared, clearUnshared, UpdateDownloadedDialog } from '../components/ShareUpdatePrompt.jsx'

// ⋮ menu at the right of a toets: Bewerken, Deel rubric, Exporteer resultaten, Verwijder
function TestMenu({ onEdit, onShare, onExport, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const pick = fn => e => { e.stopPropagation(); setOpen(false); fn() }
  return (
    <span className="kebab" ref={ref} onClick={e => e.stopPropagation()}>
      <button type="button" className="kebab-toggle" title="Meer acties" aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>⋮</button>
      {open && (
        <div className="kebab-menu" role="menu">
          <button type="button" className="kebab-item" role="menuitem" onClick={pick(onEdit)}>Bewerken</button>
          <button type="button" className="kebab-item" role="menuitem" onClick={pick(onShare)} title="Download de rubric als bestand voor collega's">Deel rubric</button>
          <button type="button" className="kebab-item" role="menuitem" onClick={pick(onExport)} title="Download de resultaten zonder namen, om te vergelijken in een vergadering">Exporteer resultaten</button>
          <button type="button" className="kebab-item danger" role="menuitem" onClick={pick(onDelete)}>Verwijder</button>
        </div>
      )}
    </span>
  )
}

export default function TestList() {
  const [tests, setTests] = useState([])
  const [name, setName] = useState('')
  const [kind, setKind] = useState('toets')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [nameFor, setNameFor] = useState(null)   // test waiting for the teacher's name before exporting results
  const fileRef = useRef(null)
  const [unshared, setUnshared] = useState(getUnshared)
  const [downloaded, setDownloaded] = useState(null)   // file name for the "Update gedownload" popup
  const navigate = useNavigate()

  useEffect(() => { load() }, [])

  async function load() {
    try { setTests(await api.getTests()) }
    catch { setError('Fout bij laden van toetsen.') }
  }

  async function create() {
    if (!name.trim()) { setError('Naam is verplicht.'); return }
    try {
      const t = await api.createTest({ name: name.trim() })
      if (kind === 'opdracht') await api.updateTest(t.id, { grading_method: 'opdracht', grade_config: { opdracht: { sections: [] } } })
      navigate(`/tests/${t.id}/edit`)
    } catch { setError('Aanmaken mislukt.') }
  }

  async function remove(id) {
    if (!confirm('Toets en alle bijbehorende sessies verwijderen?')) return
    try { await api.deleteTest(id); await load() }
    catch { setError('Verwijderen mislukt.') }
  }

  async function shareRubric(t) {
    setError(''); setNotice('')
    try {
      const file = await api.exportRubricFile(t.id)
      downloadJson(file, `${safeFileName(t.name)}.rubric`)
      clearUnshared(t.id)
      setUnshared(getUnshared())
      setNotice(`"${t.name}.rubric" is gedownload. Stuur het bestand naar je collega's; zij kiezen Importeer rubric. Na wijzigingen kun je opnieuw exporteren: bij collega's die de rubric al hebben wordt het een update.`)
      await load()
    } catch { setError('Exporteren mislukt.') }
  }

  async function shareUpdates(t) {
    setError(''); setNotice('')
    try {
      const file = await api.exportRubricFile(t.id)
      const fileName = `${safeFileName(t.name)}.rubric`
      downloadJson(file, fileName)
      clearUnshared(t.id)
      setUnshared(getUnshared())
      setDownloaded(fileName)
    } catch { setError('Exporteren mislukt.') }
  }

  async function exportResults(t, nameKnown = false) {
    setError(''); setNotice('')
    try {
      if (!nameKnown) {
        const { teacher_name } = await api.getShareSettings()
        if (!teacher_name) { setNameFor(t); return }
      }
      const file = await api.exportResultsFile(t.id)
      const graded = file.classes.reduce((n, c) => n + c.graded, 0)
      const total = file.classes.reduce((n, c) => n + c.total, 0)
      if (!file.classes.length) { setError(`"${t.name}" is nog niet nagekeken in een klas.`); return }
      downloadJson(file, `${safeFileName(t.name)} - resultaten.resultaten`)
      setNotice(`Resultaten gedownload: ${graded} van ${total} leerlingen nagekeken (zonder namen). Alleen volledig nagekeken leerlingen zitten in het bestand.`)
      await load()
    } catch { setError('Exporteren mislukt.') }
  }

  async function saveName(name) {
    const t = nameFor
    setNameFor(null)
    try { await api.saveShareSettings(name) } catch { setError('Opslaan van je naam mislukt.'); return }
    exportResults(t, true)
  }

  async function chooseImport(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const data = await readJsonFile(f)
      navigate('/tests/import', { state: { file: data, fileName: f.name } })
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Toetsen</h1>
        <div className="gap-8">
          <input ref={fileRef} type="file" accept=".rubric,application/json" style={{ display: 'none' }} onChange={chooseImport} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Importeer rubric</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {downloaded && <UpdateDownloadedDialog fileName={downloaded} onClose={() => setDownloaded(null)} />}
      {nameFor && <TeacherNameDialog onSave={saveName} onCancel={() => setNameFor(null)} />}

      <div className="card">
        <div className="form-row">
          <div className="field">
            <label>Soort</label>
            <select value={kind} onChange={e => setKind(e.target.value)}>
              <option value="toets">Toets</option>
              <option value="opdracht">Grote opdracht</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{kind === 'opdracht' ? 'Naam nieuwe Grote opdracht' : 'Naam nieuwe toets'}</label>
            <input
              type="text" value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder={kind === 'opdracht' ? 'bijv. Poster statistiek' : 'bijv. Hoofdstuk 3 — Algebra'}
              onKeyDown={e => e.key === 'Enter' && create()}
            />
          </div>
          <button className="btn btn-primary" onClick={create}>Aanmaken & bewerken</button>
        </div>
      </div>

      {tests.length === 0 && (
        <div className="card text-muted">Nog geen toetsen.</div>
      )}

      {tests.map(t => {
        const edited = !!t.share_id && unshared.has(t.id)
        return (
          <div key={t.id} className="card test-card" onClick={() => navigate(`/tests/${t.id}/edit`)}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {t.name}
                {t.grading_method === 'opdracht' && (
                  <span className="test-tag" style={{ background: '#ede9fe', color: '#5b21b6' }}>Grote opdracht</span>
                )}
                {t.share_id && !edited && (
                  <span className="test-tag" title="Deze rubric is gedeeld met collega's (of van een collega)" style={{ background: '#e0f2fe', color: '#075985' }}
                    onClick={e => e.stopPropagation()}>Gedeeld</span>
                )}
                {edited && (
                  <span className="test-tag" title="Je hebt deze gedeelde rubric bewerkt en de update nog niet met collega's gedeeld." style={{ background: '#fee2e2', color: '#b91c1c' }}
                    onClick={e => e.stopPropagation()}>Gedeeld, bewerkt</span>
                )}
              </div>
              <div className="text-muted" style={{ marginTop: 2 }}>
                Aangemaakt op {new Date(t.created_at).toLocaleDateString('nl-NL')}
              </div>
            </div>
            <div className="gap-8" onClick={e => e.stopPropagation()}>
              {edited && (
                <button className="btn btn-primary btn-sm" onClick={() => shareUpdates(t)} title="Download het updatebestand voor je collega's">Deel updates</button>
              )}
              <TestMenu
                onEdit={() => navigate(`/tests/${t.id}/edit`)}
                onShare={() => shareRubric(t)}
                onExport={() => exportResults(t)}
                onDelete={() => remove(t.id)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
