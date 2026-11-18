import { useEffect, useState } from 'react'
import * as api from '../api.js'
import { downloadJson, safeFileName } from '../utils/shareFiles.js'

const METHOD_LABELS = { points: 'punten', goals: 'leerdoelen', cijfer: 'cijfer', opdracht: 'grote opdracht' }

function dateNL(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayStamp() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

// Klas overdragen: choose the toetsen, download a .klas file for a colleague.
export default function ClassTransferDialog({ className, onClose, onDeleted }) {
  const [info, setInfo] = useState(null)
  const [picked, setPicked] = useState(new Set())
  const [teacher, setTeacher] = useState('')
  const [deleteAfter, setDeleteAfter] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.getClassTransferOverview(className)
      .then(d => { setInfo(d); setPicked(new Set(d.sessions.map(s => s.session_id))); setTeacher(d.teacher_name || '') })
      .catch(e => setError(api.errorText(e, 'De klas kon niet geladen worden.')))
  }, [className])

  function toggle(id) {
    setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function transfer() {
    if (!teacher.trim()) { setError('Vul je naam in, zodat je collega ziet van wie de klas komt.'); return }
    setBusy(true); setError('')
    try {
      if (teacher.trim() !== (info.teacher_name || '')) await api.saveShareSettings(teacher.trim())
      const file = await api.exportClassFile(className, info.sessions.filter(s => picked.has(s.session_id)).map(s => s.session_id))
      downloadJson(file, `${safeFileName(`Klas ${className} - ${teacher.trim()} - ${todayStamp()}`)}.klas`)
      if (deleteAfter) {
        await api.deleteClassAfterTransfer(className)
        onDeleted()
        return
      }
      setDone(true)
    } catch (e) {
      setError(api.errorText(e, 'Overdragen mislukt.'))
    }
    setBusy(false)
  }

  return (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Klas {className} overdragen</h2>
        {!info && !error && <p className="text-muted">Laden…</p>}
        {info && !done && (
          <>
            <p className="text-muted" style={{ marginBottom: 12 }}>
              Je collega importeert het bestand via Leerlingen → Importeren → Importeren van collega.
              Alle {info.student_count} leerlingen gaan mee, met kleuren, notities en jaaroverzichten.
            </p>
            {!info.teacher_name && (
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Jouw naam</label>
                <input type="text" value={teacher} placeholder="bijv. Michael" onChange={e => { setTeacher(e.target.value); setError('') }} style={{ maxWidth: 240 }} />
              </div>
            )}
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Toetsen en grote opdrachten</div>
            {info.sessions.length === 0 && <p className="text-muted">Deze klas heeft nog geen toetsen.</p>}
            {info.sessions.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicked(picked.size === info.sessions.length ? new Set() : new Set(info.sessions.map(s => s.session_id)))}>
                  {picked.size === info.sessions.length ? 'Alles uit' : 'Alles aan'}
                </button>
              </div>
            )}
            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 12 }}>
              {info.sessions.map(s => (
                <label key={s.session_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', cursor: 'pointer', fontWeight: 400 }}>
                  <input type="checkbox" checked={picked.has(s.session_id)} onChange={() => toggle(s.session_id)} />
                  <span><strong>{s.test_name}</strong> <span className="text-muted">({METHOD_LABELS[s.grading_method] || 'toets'}, {dateNL(s.created_at)}, {s.graded} resultaten)</span></span>
                </label>
              ))}
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontWeight: 400, marginBottom: 6 }}>
              <input type="checkbox" checked={deleteAfter} onChange={e => setDeleteAfter(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Klas daarna bij mij verwijderen</span>
            </label>
            {deleteAfter && (
              <div className="text-muted" style={{ fontSize: 12, marginBottom: 8, marginLeft: 24 }}>
                Na het downloaden worden de leerlingen en toetsafnames van {className} bij jou verwijderd. Je kunt de klas later terugzetten met het bestand.
              </div>
            )}
            <div className="alert" style={{ background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', marginTop: 8 }}>
              Let op: Dit bestand bevat gevoelige gegevens. Denk voor je deelt.
            </div>
          </>
        )}
        {done && (
          <div className="alert alert-success">Het bestand is gedownload. Stuur het naar je collega.</div>
        )}
        {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}
        <div className="gap-8" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>{done ? 'Sluiten' : 'Annuleren'}</button>
          {info && !done && (
            <button className={`btn ${deleteAfter ? 'btn-danger' : 'btn-primary'}`} onClick={transfer} disabled={busy}>
              {busy ? 'Bezig…' : deleteAfter ? 'Overdragen en verwijderen' : 'Overdragen'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
