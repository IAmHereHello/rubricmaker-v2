import { useState } from 'react'

// Asks once for the teacher's name, shown to colleagues on the Vergelijken page.
export default function TeacherNameDialog({ initial = '', onSave, onCancel }) {
  const [name, setName] = useState(initial)
  const valid = name.trim().length > 0
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', margin: 0 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Jouw naam</h2>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          Collega's zien deze naam bij jouw resultaten als ze ze vergelijken. Leerlingnamen gaan niet mee in het bestand.
        </p>
        <input
          type="text" autoFocus value={name} placeholder="bijv. Michael"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && valid && onSave(name.trim())}
          style={{ width: '100%', marginBottom: 12 }}
        />
        <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Annuleren</button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(name.trim())}>Opslaan</button>
        </div>
      </div>
    </div>
  )
}
