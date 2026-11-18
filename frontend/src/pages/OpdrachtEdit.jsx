import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api.js'
import ShareLeaveGuard, { markUnshared } from '../components/ShareUpdatePrompt.jsx'
import BackButton from '../components/BackButton.jsx'
import MathText, { MathPreview, MathHint } from '../components/MathText.jsx'
import {
  ROUTES, LEVELS, newId, emptyLevels, applies, criterionMax, levelsFor,
} from '../utils/opdracht.js'

const clone = x => JSON.parse(JSON.stringify(x))

function newCriterion() {
  return { id: newId(), name: '', routes: [...ROUTES], feedback: false, per_route: false, levels: emptyLevels(), route_levels: {} }
}

function newSection(group) {
  return { id: newId(), name: '', group, criteria: [newCriterion()] }
}

function initialThresholds(test) {
  return Object.fromEntries(ROUTES.map(r => [r, {
    beheerst: test.grade_config?.[r]?.beheerst ?? '',
    expert: test.grade_config?.[r]?.expert ?? '',
  }]))
}

// Three columns (Niet / Voldoende / Goed) with a description and points each
function LevelsGrid({ levels, onChange }) {
  return (
    <div className="opd-levels-grid">
      {LEVELS.map(l => (
        <div key={l.key} className="opd-level-col" style={{ borderTopColor: l.color }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: l.color }}>{l.label}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' }}>
              <input
                type="number" min={0} max={100}
                value={levels?.[l.key]?.points ?? ''}
                onChange={e => onChange(l.key, 'points', e.target.value === '' ? '' : parseInt(e.target.value))}
                style={{ width: 56, padding: '4px 6px' }}
              />
              pt
            </label>
          </div>
          <textarea
            rows={3}
            value={levels?.[l.key]?.text ?? ''}
            onChange={e => onChange(l.key, 'text', e.target.value)}
            placeholder={`Hoe ziet ${l.label.toLowerCase()} eruit?`}
            style={{ width: '100%', fontSize: 13 }}
          />
          <MathPreview text={levels?.[l.key]?.text} />
        </div>
      ))}
      <div style={{ gridColumn: '1 / -1' }}><MathHint /></div>
    </div>
  )
}

function CriterionEditor({ criterion, onChange }) {
  const [routeTab, setRouteTab] = useState(criterion.routes[0] || 'oranje')
  const activeTab = criterion.routes.includes(routeTab) ? routeTab : criterion.routes[0]

  function set(patch) { onChange({ ...criterion, ...patch }) }

  function toggleRoute(r) {
    const routes = criterion.routes.includes(r)
      ? criterion.routes.filter(x => x !== r)
      : ROUTES.filter(x => x === r || criterion.routes.includes(x))
    set({ routes })
  }

  function togglePerRoute(on) {
    if (!on) { set({ per_route: false }); return }
    const route_levels = { ...(criterion.route_levels || {}) }
    for (const r of ROUTES) if (!route_levels[r]) route_levels[r] = clone(criterion.levels)
    set({ per_route: true, route_levels })
  }

  function setLevel(key, field, value) {
    set({ levels: { ...criterion.levels, [key]: { ...criterion.levels[key], [field]: value } } })
  }

  function setRouteLevel(route, key, field, value) {
    const rl = criterion.route_levels[route]
    set({ route_levels: { ...criterion.route_levels, [route]: { ...rl, [key]: { ...rl[key], [field]: value } } } })
  }

  return (
    <div style={{ padding: '12px 0 4px' }}>
      <div className="form-row" style={{ alignItems: 'center' }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Naam onderdeel</label>
          <input
            type="text" value={criterion.name} autoFocus={!criterion.name}
            onChange={e => set({ name: e.target.value })}
            placeholder="bijv. Staafdiagram"
          />
          <MathPreview text={criterion.name} />
        </div>
        <div className="field">
          <label>Routes</label>
          <div className="checkbox-row" style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {ROUTES.map(r => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={criterion.routes.includes(r)} onChange={() => toggleRoute(r)} />
                <span className={`badge badge-${r}`}>{r}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer', maxWidth: 420 }}>
          <input type="checkbox" checked={!!criterion.feedback} onChange={e => set({ feedback: e.target.checked })} style={{ marginTop: 2 }} />
          <span>
            <strong>Verplicht</strong>
            <span className="text-muted"> · Niet laten zien bij dit onderdeel betekent altijd In ontwikkeling</span>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!criterion.per_route} onChange={e => togglePerRoute(e.target.checked)} disabled={criterion.routes.length < 2 && !criterion.per_route} />
          <strong>Verschilt per route</strong>
        </label>
      </div>

      {criterion.per_route ? (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {criterion.routes.map(r => (
              <button
                key={r} type="button"
                className={`btn btn-sm badge badge-${r}`}
                style={{ opacity: activeTab === r ? 1 : 0.5, border: activeTab === r ? '2px solid #1e3a5f' : '2px solid transparent' }}
                onClick={() => setRouteTab(r)}
              >
                {r}
              </button>
            ))}
          </div>
          {activeTab && (
            <LevelsGrid
              key={activeTab}
              levels={criterion.route_levels[activeTab]}
              onChange={(k, f, v) => setRouteLevel(activeTab, k, f, v)}
            />
          )}
        </>
      ) : (
        <LevelsGrid levels={criterion.levels} onChange={setLevel} />
      )}
    </div>
  )
}

function pointsSummary(criterion) {
  if (!criterion.per_route) return LEVELS.map(l => criterion.levels?.[l.key]?.points ?? 0).join(' / ') + ' pt'
  return criterion.routes.map(r => `${r[0]}: ${LEVELS.map(l => levelsFor(criterion, r)?.[l.key]?.points ?? 0).join('/')}`).join(' · ')
}

export default function OpdrachtEdit({ initialTest }) {
  const [test, setTest] = useState(initialTest)
  const [name, setName] = useState(initialTest.name)
  const [sectionsState, setSections] = useState(() => clone(initialTest.grade_config?.opdracht?.sections || []))
  const [thresholds, setThresholds] = useState(() => initialThresholds(initialTest))
  const [open, setOpen] = useState(() => new Set())
  const [dirty, setDirty] = useState(false)
  const [usage, setUsage] = useState({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveCount, setSaveCount] = useState(0)   // Opslaan clicks that saved; each asks to share

  useEffect(() => { api.getOpdrachtUsage(test.id).then(setUsage).catch(() => {}) }, [test.id])

  useEffect(() => {
    if (!dirty) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Start with one empty group so the page is never blank
  useEffect(() => {
    if (sectionsState.length === 0) {
      const s = newSection(false)
      setSections([s])
      setOpen(new Set([s.criteria[0].id]))
    }
  }, [])

  function change(fn) {
    setSections(prev => { const next = clone(prev); fn(next); return next })
    setDirty(true)
    setSaved(false)
  }

  function toggleOpen(id) {
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function addCriterion(si) {
    const c = newCriterion()
    change(s => { s[si].criteria.push(c) })
    setOpen(prev => new Set(prev).add(c.id))
  }

  function addSection() {
    const s = newSection(false)
    change(all => { all.push(s) })
    setOpen(prev => new Set(prev).add(s.criteria[0].id))
  }

  function removeCriterion(si, ci) {
    const c = sectionsState[si].criteria[ci]
    const n = usage[c.id] || 0
    const label = c.name || 'dit onderdeel'
    const msg = n
      ? `"${label}" is al ${n}× beoordeeld. Bij opslaan worden die beoordelingen verwijderd en worden resultaten opnieuw berekend. Doorgaan?`
      : `"${label}" verwijderen?`
    if (!window.confirm(msg)) return
    change(s => { s[si].criteria.splice(ci, 1) })
  }

  function removeSection(si) {
    const sec = sectionsState[si]
    const n = sec.criteria.reduce((acc, c) => acc + (usage[c.id] || 0), 0)
    const label = sec.name || 'deze groep'
    const msg = n
      ? `"${label}" en de onderdelen erin zijn al ${n}× beoordeeld. Bij opslaan worden die beoordelingen verwijderd. Doorgaan?`
      : `"${label}" met ${sec.criteria.length} onderdeel/onderdelen verwijderen?`
    if (!window.confirm(msg)) return
    change(s => { s.splice(si, 1) })
  }

  function move(list, i, dir) {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
  }

  const maxPerRoute = useMemo(() => Object.fromEntries(ROUTES.map(r => [r, sectionsState
    .flatMap(s => s.criteria).filter(c => applies(c, r)).reduce((acc, c) => acc + criterionMax(c, r), 0)])), [sectionsState])

  const warnings = useMemo(() => {
    const w = []
    sectionsState.forEach((s, si) => {
      if (!s.name.trim()) w.push(`Groep ${si + 1} heeft nog geen naam.`)
      if (!s.criteria.length) w.push(`"${s.name || `Groep ${si + 1}`}" heeft geen onderdelen.`)
      s.criteria.forEach((c, ci) => {
        const label = c.name || `onderdeel ${ci + 1} van "${s.name || `Groep ${si + 1}`}"`
        if (!c.name.trim()) w.push(`Onderdeel ${ci + 1} van "${s.name || `Groep ${si + 1}`}" heeft nog geen naam.`)
        if (!c.routes.length) w.push(`"${label}" geldt voor geen enkele route.`)
        const sets = c.per_route ? c.routes.map(r => levelsFor(c, r)) : [c.levels]
        if (sets.some(ls => LEVELS.some(l => !String(ls?.[l.key]?.text || '').trim()))) w.push(`"${label}" mist nog een beschrijving.`)
        if (sets.some(ls => LEVELS.some(l => ls?.[l.key]?.points === '' || ls?.[l.key]?.points == null))) w.push(`"${label}" mist nog punten.`)
      })
    })
    ROUTES.forEach(r => {
      const hasCriteria = sectionsState.some(s => s.criteria.some(c => applies(c, r)))
      if (!hasCriteria) { w.push(`Route ${r} heeft geen onderdelen.`); return }
      const t = thresholds[r]
      if (t.beheerst === '' || t.expert === '') w.push(`Route ${r}: vul Beheerst en Expert in, anders krijgen leerlingen geen eindresultaat.`)
      else if (Number(t.expert) > maxPerRoute[r]) w.push(`Route ${r}: Expert (${t.expert}) is meer dan het maximum (${maxPerRoute[r]} punten).`)
    })
    return w
  }, [sectionsState, thresholds, maxPerRoute])

  async function save() {
    setError('')
    if (!name.trim()) { setError('Naam mag niet leeg zijn.'); return }
    const gradeConfig = { opdracht: { sections: sectionsState } }
    for (const r of ROUTES) {
      const b = thresholds[r].beheerst, e = thresholds[r].expert
      if (b === '' && e === '') continue
      if (b === '' || e === '') { setError(`Route ${r}: vul zowel Beheerst als Expert in, of laat beide leeg.`); return }
      const bi = parseInt(b), ei = parseInt(e)
      if (isNaN(bi) || isNaN(ei) || bi < 0 || ei < 0) { setError(`Route ${r}: drempels moeten hele getallen zijn.`); return }
      if (bi >= ei) { setError(`Route ${r}: Beheerst moet lager zijn dan Expert.`); return }
      gradeConfig[r] = { beheerst: bi, expert: ei }
    }
    // Empty point fields count as 0
    for (const s of gradeConfig.opdracht.sections) {
      s.name = s.name.trim()
      for (const c of s.criteria) {
        c.name = c.name.trim()
        const fix = ls => LEVELS.forEach(l => { if (ls?.[l.key] && (ls[l.key].points === '' || ls[l.key].points == null)) ls[l.key].points = 0 })
        fix(c.levels)
        ROUTES.forEach(r => fix(c.route_levels?.[r]))
      }
    }
    setSaving(true)
    try {
      const updated = await api.updateTest(test.id, { name: name.trim(), grading_method: 'opdracht', grade_config: gradeConfig })
      setTest(t => ({ ...t, ...updated }))
      setSections(clone(updated.grade_config?.opdracht?.sections || []))
      setDirty(false)
      setSaved(true)
      setSaveCount(n => n + 1)
      markUnshared(updated)
      api.getOpdrachtUsage(test.id).then(setUsage).catch(() => {})
    } catch {
      setError('Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <ShareLeaveGuard test={test} unsaved={dirty} saveCount={saveCount} askCount={saveCount} />
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <div className="text-muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
            Grote opdracht
          </div>
          <input
            type="text" value={name}
            onChange={e => { setName(e.target.value); setDirty(true); setSaved(false) }}
            style={{ fontSize: 20, fontWeight: 700, width: '100%', maxWidth: 480, color: '#1e3a5f' }}
          />
        </div>
        <BackButton fallback="/tests" />
      </div>

      {sectionsState.map((sec, si) => (
        <div key={sec.id} className="card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button className="btn btn-secondary btn-sm" style={{ padding: '1px 7px' }} disabled={si === 0} onClick={() => change(s => move(s, si, -1))}>▲</button>
              <button className="btn btn-secondary btn-sm" style={{ padding: '1px 7px' }} disabled={si === sectionsState.length - 1} onClick={() => change(s => move(s, si, 1))}>▼</button>
            </div>
            <input
              type="text" value={sec.name}
              onChange={e => change(s => { s[si].name = e.target.value })}
              placeholder="Naam groep, bijv. Diagrammen"
              style={{ flex: 1, minWidth: 200, fontWeight: 700, fontSize: 15 }}
            />
            <div className="mode-switch" style={{ marginTop: 0 }} role="group" aria-label="Soort deel">
              <button className={sec.group ? 'active' : ''} onClick={() => change(s => { s[si].group = true })}>Gezamenlijk</button>
              <button className={!sec.group ? 'active' : ''} onClick={() => change(s => { s[si].group = false })}>Individueel</button>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => removeSection(si)}>Verwijder groep</button>
          </div>

          {sec.criteria.map((c, ci) => {
            const isOpen = open.has(c.id)
            return (
              <div key={c.id} style={{ borderTop: '1px solid #eef0f4', padding: '8px 0 8px 34px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={() => toggleOpen(c.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1e3a5f', textAlign: 'left', flex: 1, display: 'flex', gap: 8, alignItems: 'center', padding: 0 }}
                    title={isOpen ? 'Inklappen' : 'Bewerken'}
                  >
                    <span style={{ color: '#888', width: 12 }}>{isOpen ? '▾' : '▸'}</span>
                    <span>{c.name ? <MathText text={c.name} /> : <em className="text-muted">Naamloos onderdeel</em>}</span>
                    {c.feedback && <span style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', borderRadius: 4, padding: '1px 6px' }}>Verplicht</span>}
                    <span style={{ display: 'flex', gap: 3 }}>
                      {c.routes.map(r => <span key={r} className={`badge badge-${r}`} style={{ padding: '1px 6px', fontSize: 10 }}>{r[0]}</span>)}
                    </span>
                    <span className="text-muted" style={{ fontSize: 12, fontWeight: 400 }}>{pointsSummary(c)}</span>
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '1px 7px' }} disabled={ci === 0} onClick={() => change(s => move(s[si].criteria, ci, -1))}>▲</button>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '1px 7px' }} disabled={ci === sec.criteria.length - 1} onClick={() => change(s => move(s[si].criteria, ci, 1))}>▼</button>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '1px 8px', color: '#b00' }} onClick={() => removeCriterion(si, ci)} title="Onderdeel verwijderen">✕</button>
                </div>
                {isOpen && (
                  <CriterionEditor
                    criterion={c}
                    onChange={updated => change(s => { s[si].criteria[ci] = updated })}
                  />
                )}
              </div>
            )
          })}

          <div style={{ paddingLeft: 34, marginTop: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => addCriterion(si)}>+ Onderdeel</button>
          </div>
        </div>
      ))}

      <button className="btn btn-secondary" onClick={addSection} style={{ marginBottom: 16 }}>+ Groep onderdelen</button>

      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#1e3a5f' }}>Normering</h2>
        <table style={{ fontSize: 13, width: 'auto' }}>
          <thead>
            <tr>
              <th>Route</th>
              <th style={{ textAlign: 'center' }}>Max. punten</th>
              <th style={{ textAlign: 'center' }}>Beheerst vanaf</th>
              <th style={{ textAlign: 'center' }}>Expert vanaf</th>
            </tr>
          </thead>
          <tbody>
            {ROUTES.map(r => (
              <tr key={r}>
                <td><span className={`badge badge-${r}`}>{r}</span></td>
                <td style={{ textAlign: 'center' }}>{maxPerRoute[r]}</td>
                {['beheerst', 'expert'].map(k => (
                  <td key={k} style={{ textAlign: 'center' }}>
                    <input
                      type="number" min={0} value={thresholds[r][k]}
                      onChange={e => { setThresholds(t => ({ ...t, [r]: { ...t[r], [k]: e.target.value } })); setDirty(true); setSaved(false) }}
                      style={{ width: 72 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
          In punten. Een verplicht onderdeel op Niet laten zien geeft altijd In ontwikkeling.
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="card" style={{ background: '#fffbeb', borderColor: '#fcd34d' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: '#92400e' }}>Nog niet compleet</div>
          <ul style={{ paddingLeft: 18, fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="opd-savebar">
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
          {error && <span style={{ color: '#b00', fontSize: 14 }}>{error}</span>}
          {!error && dirty && <span style={{ color: '#b45309', fontSize: 14 }}>Niet opgeslagen wijzigingen</span>}
          {!error && !dirty && saved && <span style={{ color: '#15803d', fontSize: 14 }}>Opgeslagen</span>}
        </div>
      </div>
    </div>
  )
}
