import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import OpdrachtCriterion from '../components/OpdrachtCriterion.jsx'
import { gradeLabel } from '../utils/gradingLogic.js'
import MathText from '../components/MathText.jsx'
import {
  sectionsOf, partOf, applies, MODE_LABELS, PART_LABELS, thresholdsFor, ROUTES, routeMax, LEVEL_BY_KEY,
} from '../utils/opdracht.js'

const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }
const GRADE_BG = { expert: '#e8f5e9', beheerst: '#e8f0fc', in_ontwikkeling: '#fff3e0' }

function GradeTag({ summary }) {
  if (!summary) return null
  if (!summary.complete) return <span className="text-muted" style={{ fontSize: 13 }}>nog geen eindresultaat</span>
  if (!summary.grade) return <span className="text-muted" style={{ fontSize: 13 }}>{summary.points}/{summary.max} pt · geen normering</span>
  return (
    <span style={{ fontSize: 13 }}>
      {summary.points}/{summary.max} pt{' '}
      <span style={{ fontWeight: 700, borderRadius: 4, padding: '2px 8px', background: GRADE_BG[summary.grade], color: GRADE_COLORS[summary.grade] }}>
        {gradeLabel(summary.grade)}
      </span>
    </span>
  )
}

const errorText = e => {
  const d = e?.response?.data?.detail
  return typeof d === 'string' ? d : 'Opslaan mislukt. Probeer het opnieuw.'
}

// Text field with a datalist that resolves a typed name to a student
function NamePicker({ students, onPick, placeholder, inputRef, listId }) {
  const [value, setValue] = useState('')
  function pick() {
    const v = value.trim().toLowerCase()
    if (!v) return
    const match = students.find(s => s.name.toLowerCase() === v)
      || (students.filter(s => s.name.toLowerCase().startsWith(v)).length === 1
        ? students.find(s => s.name.toLowerCase().startsWith(v)) : null)
    if (match) { onPick(match); setValue('') }
  }
  return (
    <>
      <input
        ref={inputRef}
        type="text"
        list={listId}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') setValue('')
          if (e.key === 'Enter') { e.preventDefault(); pick() }
        }}
        onBlur={() => { if (students.some(s => s.name.toLowerCase() === value.trim().toLowerCase())) pick() }}
        placeholder={placeholder}
        style={{ width: '100%', fontSize: 15, padding: '9px 12px' }}
        autoComplete="off"
      />
      <datalist id={listId}>
        {students.map(s => <option key={s.id} value={s.name} />)}
      </datalist>
    </>
  )
}

function MemberChips({ ids, byId, onRemove }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {ids.map(sid => (
        <span key={sid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#eef2f8', borderRadius: 16, fontSize: 14, fontWeight: 600 }}>
          {byId[sid]?.name}
          <RouteBadge route={byId[sid]?.route} />
          {onRemove && (
            <button onClick={() => onRemove(sid)} title="Weghalen" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
          )}
        </span>
      ))}
    </div>
  )
}

export default function OpdrachtGrade({ sessionId }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newMembers, setNewMembers] = useState([])
  const [roundTab, setRoundTab] = useState(null)
  const [editMembers, setEditMembers] = useState(null)
  const nameRef = useRef(null)

  const groupParam = searchParams.get('group') ? parseInt(searchParams.get('group')) : null
  const studentParam = searchParams.get('student') ? parseInt(searchParams.get('student')) : null
  const partParam = searchParams.get('part')
  const from = searchParams.get('from')

  useEffect(() => {
    api.getOpdrachtSession(sessionId).then(setData).catch(() => setError('Fout bij laden van de sessie.'))
  }, [sessionId])

  // Pick the grading mode automatically when there is only one kind of part
  useEffect(() => {
    if (!data || data.state.mode) return
    const present = data.parts_present
    if (present.length === 1) {
      api.setOpdrachtState(sessionId, { mode: present[0] === 'groep' ? 'groep' : 'individueel' }).then(setData).catch(() => {})
    }
  }, [data, sessionId])

  useEffect(() => { setEditMembers(null) }, [groupParam])

  const byId = useMemo(() => Object.fromEntries((data?.students || []).map(s => [s.id, s])), [data])
  const groupById = useMemo(() => Object.fromEntries((data?.groups || []).map(g => [g.id, g])), [data])
  const entryOf = (sid, part) => data?.entries.find(e => e.student_id === sid && e.part === part)
  const summaryOf = sid => data?.summaries[String(sid)]

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      const res = await fn()
      if (res?.data && res.group_id !== undefined) { setData(res.data); return res }
      if (res) setData(res)
      return res
    } catch (e) {
      setError(errorText(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  function go(params) {
    const next = new URLSearchParams()
    if (from) next.set('from', from)
    for (const [k, v] of Object.entries(params)) if (v != null) next.set(k, String(v))
    setSearchParams(next)
    window.scrollTo(0, 0)
  }

  function backToStack() {
    go({})
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  if (!data) return <div className="page">{error || 'Laden...'}</div>

  const test = data.test
  const mode = data.state.mode
  const sections = sectionsOf(test)
  const groupSections = sections.filter(s => partOf(s) === 'groep' && (s.criteria || []).length)
  const indSections = sections.filter(s => partOf(s) === 'individueel' && (s.criteria || []).length)

  // ── Level setters ───────────────────────────────────────────────────────────
  const setGroupLevel = (groupId, cid, patch) =>
    run(() => api.setOpdrachtLevel(sessionId, { group_id: groupId, criterion_id: cid, ...patch }))
  const setStudentLevel = (sid, cid, patch) =>
    run(() => api.setOpdrachtLevel(sessionId, { student_id: sid, criterion_id: cid, ...patch }))

  // ── Empty rubric ────────────────────────────────────────────────────────────
  if (!data.parts_present.length) {
    return (
      <div className="page">
        <div className="card">
          <p style={{ marginBottom: 12 }}>Deze Grote opdracht heeft nog geen onderdelen.</p>
          <Link to={`/tests/${test.id}/edit`} className="btn btn-primary">Onderdelen toevoegen</Link>
        </div>
      </div>
    )
  }

  // ── Mode choice ─────────────────────────────────────────────────────────────
  if (!mode) {
    if (data.parts_present.length === 1) return <div className="page">Laden...</div>
    const choose = m => run(() => api.setOpdrachtState(sessionId, { mode: m }))
    return (
      <div className="page" style={{ maxWidth: 820 }}>
        <div className="page-header">
          <div>
            <h1>{test.name}</h1>
            <div className="text-muted" style={{ marginTop: 4 }}>Klas {data.session.class_name} · hoe wil je nakijken?</div>
          </div>
          <Link to="/sessions/new" className="btn btn-secondary">← Terug</Link>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <button className="card opd-choice" onClick={() => choose('samen')} disabled={busy}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#1e3a5f' }}>{MODE_LABELS.samen}</div>
            <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Per poster: typ de groepsleden, beoordeel het gezamenlijke deel één keer en daarna meteen het individuele deel van elk lid.
            </div>
          </button>
          <button className="card opd-choice" onClick={() => choose('apart')} disabled={busy}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#1e3a5f' }}>{MODE_LABELS.apart}</div>
            <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Twee rondes: eerst het gezamenlijke deel van alle groepen, later het individuele deel per leerling (namen opnieuw typen).
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ── Header shared by the grading views ──────────────────────────────────────
  const backLink = from === 'report'
    ? <Link to={`/reports/session/${sessionId}?view=results`} className="btn btn-secondary">← Rapport</Link>
    : from === 'inhalers'
      ? <Link to="/inhalers" className="btn btn-secondary">← Inhalers</Link>
      : <button className="btn btn-secondary" onClick={backToStack}>← Stapel</button>

  // ── Group view ──────────────────────────────────────────────────────────────
  if (groupParam) {
    const group = groupById[groupParam]
    if (!group) {
      return (
        <div className="page">
          <div className="card">
            <p style={{ marginBottom: 12 }}>Deze groep bestaat niet meer.</p>
            <button className="btn btn-primary" onClick={backToStack}>Terug naar de stapel</button>
          </div>
        </div>
      )
    }
    const members = group.members.map(sid => byId[sid]).filter(Boolean)
    const memberRoutes = [...new Set(members.map(m => m.route))].filter(r => ROUTES.includes(r))
    const showIndividual = mode === 'samen' && indSections.length > 0
    const unfinished = members.filter(m => {
      const s = summaryOf(m.id)
      return s && Object.entries(s.parts).some(([p, v]) => (p === 'groep' || showIndividual) && v.status === 'open')
    })

    async function saveMembers(move = false) {
      const res = await run(() => api.updateOpdrachtGroup(group.id, editMembers, move))
      if (res) {
        setEditMembers(null)
        if (res.group_id == null) backToStack()
      }
    }

    async function trySaveMembers() {
      setBusy(true)
      setError('')
      try {
        const res = await api.updateOpdrachtGroup(group.id, editMembers, false)
        setData(res.data)
        setEditMembers(null)
        if (res.group_id == null) backToStack()
      } catch (e) {
        const conflicts = e?.response?.status === 409 ? e.response.data.detail.conflicts : null
        if (conflicts && window.confirm(`${conflicts.map(c => c.name).join(', ')} zit al in een andere groep. Verplaatsen naar deze groep?`)) {
          setBusy(false)
          await saveMembers(true)
          return
        }
        if (!conflicts) setError(errorText(e))
      } finally {
        setBusy(false)
      }
    }

    async function removeGroup() {
      if (!window.confirm('Deze groep verwijderen? De beoordeling van het gezamenlijke deel gaat verloren.')) return
      const res = await run(() => api.deleteOpdrachtGroup(group.id))
      if (res) backToStack()
    }

    return (
      <div className="page" style={{ maxWidth: 1040 }}>
        <div className="page-header">
          <div>
            <div className="text-muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {test.name} · {MODE_LABELS[mode]}
            </div>
            <h1 style={{ marginTop: 4 }}>Groep {group.order + 1}</h1>
          </div>
          {backLink}
        </div>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="card">
          {editMembers ? (
            <>
              <div style={{ marginBottom: 10 }}>
                <MemberChips ids={editMembers} byId={byId} onRemove={sid => setEditMembers(m => m.filter(x => x !== sid))} />
              </div>
              <NamePicker
                listId="opd-edit-members"
                students={data.students.filter(s => !editMembers.includes(s.id))}
                onPick={s => setEditMembers(m => [...m, s.id])}
                placeholder="Leerling toevoegen…"
              />
              <div className="gap-8" style={{ marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={trySaveMembers} disabled={busy || !editMembers.length}>Leden opslaan</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditMembers(null)}>Annuleren</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}><MemberChips ids={group.members} byId={byId} /></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditMembers(group.members)}>Leden wijzigen</button>
              <button className="btn btn-danger btn-sm" onClick={removeGroup}>Groep verwijderen</button>
            </div>
          )}
        </div>

        <div className="opd-part-title">{PART_LABELS.groep}</div>
        {groupSections.map(sec => {
          const crits = sec.criteria.filter(c => memberRoutes.some(r => applies(c, r)))
          if (!crits.length) return null
          return (
            <div key={sec.id} className="card">
              <h2 className="opd-section-title">{sec.name}</h2>
              {crits.map(c => {
                const forMembers = members.filter(m => applies(c, m.route))
                const routes = [...new Set(forMembers.map(m => m.route))]
                const gs = group.scores[c.id]
                const overrides = forMembers
                  .map(m => ({ m, eff: summaryOf(m.id)?.effective?.[c.id] }))
                  .filter(x => x.eff?.source === 'override')
                return (
                  <OpdrachtCriterion
                    key={c.id}
                    criterion={c}
                    routes={routes}
                    selected={gs?.level}
                    comment={gs?.comment}
                    busy={busy}
                    onSelect={level => setGroupLevel(group.id, c.id, { level })}
                    onComment={comment => setGroupLevel(group.id, c.id, { comment })}
                    note={forMembers.length < members.length ? `Alleen voor ${forMembers.map(m => m.name).join(', ')}` : null}
                    tag={overrides.length > 0 && (
                      <span style={{ fontSize: 12, color: '#7c3aed' }}>
                        Aangepast voor {overrides.map(x => `${x.m.name} (${LEVEL_BY_KEY[x.eff.level]?.label ?? 'leeg'})`).join(', ')}
                      </span>
                    )}
                  />
                )
              })}
            </div>
          )
        })}

        {showIndividual && (
          <>
            <div className="opd-part-title">{PART_LABELS.individueel}</div>
            {members.map(m => (
              <StudentIndividual
                key={m.id}
                student={m}
                sections={indSections}
                entry={entryOf(m.id, 'individueel')}
                summary={summaryOf(m.id)}
                busy={busy}
                onLevel={(cid, patch) => setStudentLevel(m.id, cid, patch)}
                onStatus={status => run(() => api.setOpdrachtEntry(sessionId, m.id, 'individueel', status))}
              />
            ))}
          </>
        )}

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 14 }}>
            {unfinished.length
              ? <span style={{ color: '#b45309' }}>Nog niet alles gekozen voor {unfinished.map(m => m.name).join(', ')}.</span>
              : <span style={{ color: '#15803d' }}>Alles beoordeeld.</span>}
            <div style={{ marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {members.map(m => (
                <span key={m.id}>{m.name}: <GradeTag summary={summaryOf(m.id)} /></span>
              ))}
            </div>
          </div>
          {from ? backLink : (
            <button className="btn btn-primary" onClick={backToStack}>Klaar, volgende poster →</button>
          )}
        </div>
      </div>
    )
  }

  // ── Student view (individual stack, inhaler or editing from the report) ─────
  if (studentParam) {
    const student = byId[studentParam]
    if (!student) return <div className="page"><div className="card">Leerling niet gevonden.</div></div>
    const summary = summaryOf(student.id)
    const showGroup = (!partParam || partParam === 'groep') && groupSections.some(s => s.criteria.some(c => applies(c, student.route)))
    const showInd = (!partParam || partParam === 'individueel') && indSections.some(s => s.criteria.some(c => applies(c, student.route)))
    const groupEntry = entryOf(student.id, 'groep')
    const group = groupEntry?.group_id ? groupById[groupEntry.group_id] : null

    async function startGroupPart() {
      const res = await run(() => api.setOpdrachtEntry(sessionId, student.id, 'groep'))
      const g = res?.entries.find(e => e.student_id === student.id && e.part === 'groep')
      if (g?.group_id) go({ group: g.group_id })
    }

    return (
      <div className="page" style={{ maxWidth: 1040 }}>
        <div className="page-header">
          <div>
            <div className="text-muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {test.name} · {partParam ? PART_LABELS[partParam] : 'Beoordeling'}
            </div>
            <h1 style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
              {student.name} <RouteBadge route={student.route} />
            </h1>
            <div style={{ marginTop: 6 }}><GradeTag summary={summary} /></div>
          </div>
          {backLink}
        </div>
        {error && <div className="alert alert-error">{error}</div>}

        {showGroup && (
          <>
            <div className="opd-part-title">{PART_LABELS.groep}</div>
            {!groupEntry ? (
              <div className="card">
                <p style={{ marginBottom: 10 }}>{student.name} zit nog niet in een groep.</p>
                <button className="btn btn-primary" onClick={startGroupPart} disabled={busy}>Gezamenlijk deel nakijken (als losse groep)</button>
              </div>
            ) : groupEntry.status === 'niet_ingeleverd' ? (
              <div className="card">
                <p style={{ marginBottom: 10 }}>Gezamenlijk deel staat op <strong>niet ingeleverd</strong>.</p>
                <button className="btn btn-primary" onClick={() => run(() => api.setOpdrachtEntry(sessionId, student.id, 'groep', 'ingeleverd'))} disabled={busy}>Toch ingeleverd</button>
              </div>
            ) : (
              <>
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, fontSize: 14 }}>
                    Groep {group ? group.order + 1 : ''}: {group?.members.map(sid => byId[sid]?.name).join(', ')}
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      Een keuze hier geldt alleen voor {student.name}. De rest van de groep houdt de groepsscore.
                    </div>
                  </div>
                  {group && <button className="btn btn-secondary btn-sm" onClick={() => go({ group: group.id })}>Hele groep bewerken</button>}
                </div>
                {groupSections.map(sec => {
                  const crits = sec.criteria.filter(c => applies(c, student.route))
                  if (!crits.length) return null
                  return (
                    <div key={sec.id} className="card">
                      <h2 className="opd-section-title">{sec.name}</h2>
                      {crits.map(c => {
                        const eff = summary?.effective?.[c.id]
                        const isOverride = eff?.source === 'override'
                        return (
                          <OpdrachtCriterion
                            key={c.id}
                            criterion={c}
                            routes={[student.route]}
                            selected={eff?.level}
                            comment={eff?.comment}
                            busy={busy}
                            onSelect={level => setStudentLevel(student.id, c.id, { level })}
                            onComment={comment => setStudentLevel(student.id, c.id, { comment })}
                            tag={isOverride ? (
                              <span style={{ fontSize: 12, color: '#7c3aed' }}>
                                Aangepast voor {student.name} ·{' '}
                                <button className="opd-link" onClick={() => setStudentLevel(student.id, c.id, { reset: true })}>↺ terug naar groepsscore</button>
                              </span>
                            ) : eff ? <span className="text-muted" style={{ fontSize: 12 }}>groepsscore</span> : null}
                          />
                        )
                      })}
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}

        {showInd && (
          <>
            <div className="opd-part-title">{PART_LABELS.individueel}</div>
            {!entryOf(student.id, 'individueel') ? (
              <div className="card">
                <p style={{ marginBottom: 10 }}>Het individuele deel van {student.name} is nog niet ingevoerd.</p>
                <button className="btn btn-primary" onClick={() => run(() => api.setOpdrachtEntry(sessionId, student.id, 'individueel'))} disabled={busy}>
                  Individueel deel nakijken
                </button>
              </div>
            ) : (
              <StudentIndividual
                student={student}
                sections={indSections}
                entry={entryOf(student.id, 'individueel')}
                summary={summary}
                busy={busy}
                hideName
                onLevel={(cid, patch) => setStudentLevel(student.id, cid, patch)}
                onStatus={status => run(() => api.setOpdrachtEntry(sessionId, student.id, 'individueel', status))}
              />
            )}
          </>
        )}

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}><GradeTag summary={summary} /></div>
          {from ? backLink : (
            <button className="btn btn-primary" onClick={backToStack}>Klaar, volgende →</button>
          )}
        </div>
      </div>
    )
  }

  // ── Stack view ──────────────────────────────────────────────────────────────
  const rounds = mode === 'apart' ? ['groep', 'individueel'] : mode === 'individueel' ? ['individueel'] : ['groep']
  const activeRound = rounds.includes(roundTab) ? roundTab
    : (mode === 'apart' && data.state.group_closed && !data.state.individual_closed ? 'individueel' : rounds[0])
  const closedKey = part => (part === 'groep' ? 'group_closed' : 'individual_closed')
  const isClosed = part => data.state[closedKey(part)]

  async function closeStack(part) {
    const msg = 'Stapel afronden? Leerlingen die niet zijn ingevoerd komen bij Inhalers.'
    if (!window.confirm(msg)) return
    const patch = mode === 'samen' ? { group_closed: true, individual_closed: true } : { [closedKey(part)]: true }
    await run(() => api.setOpdrachtState(sessionId, patch))
  }

  async function reopenStack(part) {
    const patch = mode === 'samen' ? { group_closed: false, individual_closed: false } : { [closedKey(part)]: false }
    await run(() => api.setOpdrachtState(sessionId, patch))
  }

  async function startGroup(move = false) {
    setBusy(true)
    setError('')
    try {
      const res = await api.createOpdrachtGroup(sessionId, newMembers, move)
      setData(res.data)
      setNewMembers([])
      go({ group: res.group_id })
    } catch (e) {
      const conflicts = e?.response?.status === 409 ? e.response.data.detail.conflicts : null
      if (conflicts) {
        if (window.confirm(`${conflicts.map(c => c.name).join(', ')} zit al in een andere groep. Verplaatsen naar deze nieuwe groep?`)) {
          setBusy(false)
          await startGroup(true)
          return
        }
      } else {
        setError(errorText(e))
      }
    } finally {
      setBusy(false)
    }
  }

  async function pickIndividual(student) {
    if (!entryOf(student.id, 'individueel')) {
      const res = await run(() => api.setOpdrachtEntry(sessionId, student.id, 'individueel'))
      if (!res) return
    }
    go({ student: student.id, part: 'individueel' })
  }

  const totals = Object.values(data.summaries)
  const completeCount = totals.filter(s => s.complete).length
  const inGroup = new Set(data.entries.filter(e => e.part === 'groep').map(e => e.student_id))
  const inInd = new Set(data.entries.filter(e => e.part === 'individueel').map(e => e.student_id))
  const allClosed = data.parts_present.every(p => isClosed(p))

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      {error && <div className="alert alert-error">{error}</div>}

      {allClosed && (
        <div className="card" style={{ background: data.done ? '#ecfdf5' : '#fffbeb', borderColor: data.done ? '#86efac' : '#fcd34d' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {data.done ? 'Nakijken klaar.' : 'Stapel afgerond, maar nog niet alles is beoordeeld.'}
          </div>
          <div className="text-muted" style={{ fontSize: 14, marginBottom: 10 }}>
            {completeCount} leerling{completeCount === 1 ? '' : 'en'} met eindresultaat
            {data.inhalers.length > 0 && ` · ${data.inhalers.length} bij Inhalers`}
          </div>
          <div className="gap-8">
            <Link to={`/reports/session/${sessionId}?view=results`} className="btn btn-primary">Resultaten bekijken</Link>
            {data.inhalers.length > 0 && <Link to="/inhalers" className="btn btn-secondary">Inhalers</Link>}
          </div>
        </div>
      )}

      <div className="grade-wrap">
        <div className="grade-main">
          {mode === 'apart' && (
            <div className="mode-switch" style={{ marginTop: 0, marginBottom: 20 }} role="group" aria-label="Ronde">
              <button className={activeRound === 'groep' ? 'active' : ''} onClick={() => setRoundTab('groep')}>
                Ronde 1: Gezamenlijk {isClosed('groep') && '✓'}
              </button>
              <button className={activeRound === 'individueel' ? 'active' : ''} onClick={() => setRoundTab('individueel')}>
                Ronde 2: Individueel {isClosed('individueel') && '✓'}
              </button>
            </div>
          )}

          {activeRound === 'groep' ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Namen op de poster
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                  ({inGroup.size} van {data.students.length} ingevoerd)
                </span>
              </div>
              {newMembers.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <MemberChips ids={newMembers} byId={byId} onRemove={sid => setNewMembers(m => m.filter(x => x !== sid))} />
                </div>
              )}
              <NamePicker
                inputRef={nameRef}
                listId="opd-group-names"
                students={data.students.filter(s => !newMembers.includes(s.id))}
                onPick={s => setNewMembers(m => [...m, s.id])}
                placeholder={newMembers.length ? 'Nog een groepslid, of klik Start nakijken' : 'Begin met typen om een leerling te zoeken…'}
              />
              <div style={{ minHeight: 56, marginTop: 14, marginBottom: 18 }}>
                {newMembers.length > 0 && (
                  <button className="btn btn-primary" onClick={() => startGroup(false)} disabled={busy}>
                    Start nakijken ({newMembers.length} {newMembers.length === 1 ? 'leerling' : 'leerlingen'}) →
                  </button>
                )}
              </div>

              {data.groups.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div className="opd-entered-title">Ingevoerd</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.groups.map(g => {
                      const done = g.members.every(sid => {
                        const s = summaryOf(sid)
                        return s && s.parts.groep?.status !== 'open' && (mode !== 'samen' || s.parts.individueel?.status !== 'open')
                      })
                      return (
                        <button key={g.id} className="opd-entered" onClick={() => go({ group: g.id })}>
                          {g.members.map(sid => byId[sid]?.name).join(', ')}{' '}
                          <span style={{ fontWeight: 700, color: done ? '#4caf50' : '#c07000' }}>{done ? '✓' : 'bezig'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Naam leerling
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                  ({inInd.size} van {data.students.length} ingevoerd)
                </span>
              </div>
              <NamePicker
                inputRef={nameRef}
                listId="opd-ind-names"
                students={data.students}
                onPick={pickIndividual}
                placeholder="Begin met typen om een leerling te zoeken…"
              />
              <div style={{ height: 24 }} />
              {inInd.size > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div className="opd-entered-title">Ingevoerd</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.entries.filter(e => e.part === 'individueel').map(e => {
                      const st = summaryOf(e.student_id)?.parts.individueel?.status
                      return (
                        <button key={e.student_id} className="opd-entered" onClick={() => go({ student: e.student_id, part: 'individueel' })}>
                          {byId[e.student_id]?.name}{' '}
                          <span style={{ fontWeight: 700, color: st === 'complete' ? '#4caf50' : st === 'missing' ? '#b91c1c' : '#c07000' }}>
                            {st === 'complete' ? '✓' : st === 'missing' ? 'niet ingeleverd' : 'bezig'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{ borderTop: '1px solid #e0e3ea', paddingTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            {isClosed(activeRound) ? (
              <>
                <span style={{ color: '#15803d', fontWeight: 600, fontSize: 14 }}>Stapel afgerond</span>
                <button className="btn btn-secondary btn-sm" onClick={() => reopenStack(activeRound)} disabled={busy}>Stapel heropenen</button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={() => closeStack(activeRound)} disabled={busy}>
                  Einde van de stapel
                </button>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Niet-ingevoerde leerlingen komen bij Inhalers.
                </span>
              </>
            )}
          </div>
        </div>

        <div className="grade-sidebar">
          <div className="card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{test.name}</div>
            <div className="text-muted">Klas {data.session.class_name}</div>
            <div className="text-muted" style={{ marginTop: 4 }}>{MODE_LABELS[mode]}</div>
            <hr className="divider" />
            {sections.filter(s => (s.criteria || []).length).map(s => (
              <div key={s.id} style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>
                  {s.name || 'Naamloos'} <span className="text-muted" style={{ fontWeight: 400 }}>· {s.group ? 'gezamenlijk' : 'individueel'}</span>
                </div>
                {s.criteria.map(c => <div key={c.id} style={{ color: '#888', paddingLeft: 8 }}><MathText text={c.name} /></div>)}
              </div>
            ))}
            <hr className="divider" />
            <div>{completeCount} van {data.students.length} met eindresultaat</div>
            <Link to={`/reports/session/${sessionId}?view=results`} style={{ display: 'inline-block', marginTop: 6, color: '#1a6ecc' }}>Resultaten bekijken →</Link>
          </div>
          <div className="card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Normering</div>
            {ROUTES.map(r => {
              const t = thresholdsFor(test, r)
              return (
                <div key={r} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span className={`badge badge-${r}`}>{r}</span>
                  {t ? <span>B ≥ {t.beheerst} · E ≥ {t.expert} <span className="text-muted">/ {routeMax(test, r)}</span></span> : <span className="text-muted">niet ingesteld</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Individual onderdelen for one student, with a "niet ingeleverd" switch
function StudentIndividual({ student, sections, entry, summary, busy, onLevel, onStatus, hideName }) {
  const crits = sections.flatMap(s => s.criteria.filter(c => applies(c, student.route)).map(c => ({ s, c })))
  const missing = entry?.status === 'niet_ingeleverd'
  if (!crits.length) {
    return hideName ? null : (
      <div className="card text-muted" style={{ fontSize: 14 }}>{student.name}: geen individuele onderdelen voor route {student.route}.</div>
    )
  }
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: missing ? 0 : 8, flexWrap: 'wrap' }}>
        {!hideName && (
          <h2 className="opd-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {student.name} <RouteBadge route={student.route} />
          </h2>
        )}
        <label style={{ marginLeft: hideName ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', color: missing ? '#b91c1c' : '#555', fontWeight: missing ? 700 : 400 }}>
          <input type="checkbox" checked={missing} disabled={busy} onChange={e => onStatus(e.target.checked ? 'niet_ingeleverd' : 'ingeleverd')} />
          Niet ingeleverd
        </label>
      </div>
      {missing ? (
        <div className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>
          {student.name} komt bij Inhalers voor het individuele deel. De groepsscore blijft staan.
        </div>
      ) : (
        sections.map(sec => {
          const list = sec.criteria.filter(c => applies(c, student.route))
          if (!list.length) return null
          return (
            <div key={sec.id}>
              {sections.length > 1 && <div style={{ fontSize: 13, fontWeight: 700, color: '#888', margin: '10px 0 2px' }}>{sec.name}</div>}
              {list.map(c => {
                const eff = summary?.effective?.[c.id]
                return (
                  <OpdrachtCriterion
                    key={c.id}
                    criterion={c}
                    routes={[student.route]}
                    selected={eff?.level}
                    comment={eff?.comment}
                    busy={busy}
                    onSelect={level => onLevel(c.id, { level })}
                    onComment={comment => onLevel(c.id, { comment })}
                  />
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}
