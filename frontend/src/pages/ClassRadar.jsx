import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Legend, Tooltip, ResponsiveContainer,
} from 'recharts'
import * as api from '../api.js'
import { DOMAINS, LEVELS, LEVEL_LABELS, ROUTE_COLORS } from '../constants.js'
import { exportPDF } from '../utils/exportPDF.js'

const ROUTES = ['oranje', 'geel', 'blauw']

function buildRadarData(routeData, keys, getValueFn) {
  return keys.map(k => {
    const row = { subject: k }
    ROUTES.forEach(route => {
      const rd = routeData[route]
      if (!rd) { row[route] = 0; return }
      const match = getValueFn(rd, k)
      row[route] = match?.pct ?? 0
      row[`_raw_${route}`] = match?.pct
    })
    return row
  })
}

function RadarPanel({ routeData, type, title }) {
  const activeRoutes = ROUTES.filter(r => routeData[r])

  const keys    = type === 'domain' ? DOMAINS : LEVELS.map(l => LEVEL_LABELS[l])
  const rawKeys = type === 'domain' ? DOMAINS : LEVELS

  const chartData = rawKeys.map((k, i) => {
    const row = { subject: keys[i] }
    ROUTES.forEach(route => {
      const rd = routeData[route]
      if (!rd) { row[route] = 0; return }
      const list = type === 'domain' ? rd.domain_scores : rd.level_scores
      const match = type === 'domain'
        ? list.find(d => d.domain === k)
        : list.find(d => d.level === k)
      row[route] = match?.pct ?? 0
      row[`_raw_${route}`] = match?.pct
    })
    return row
  })

  const hasData = activeRoutes.some(route => {
    const rd = routeData[route]
    const list = type === 'domain' ? rd.domain_scores : rd.level_scores
    return list.some(item => item.pct !== null)
  })

  if (!hasData) {
    return <p className="text-muted">Geen gegevens beschikbaar voor dit diagram.</p>
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1e3a5f' }}>{title}</h3>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickCount={5} />
          {activeRoutes.map(route => (
            <Radar
              key={route}
              name={route.charAt(0).toUpperCase() + route.slice(1)}
              dataKey={route}
              stroke={ROUTE_COLORS[route]}
              fill={ROUTE_COLORS[route]}
              fillOpacity={0.2}
            />
          ))}
          <Tooltip
            formatter={(value, name, props) => {
              const routeKey = name.toLowerCase()
              const raw = props.payload?.[`_raw_${routeKey}`]
              return [raw === null ? 'Geen gegevens' : `${raw}%`, name]
            }}
          />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 12, color: '#888', marginTop: 8, display: 'flex', gap: 16 }}>
        {activeRoutes.map(route => (
          <span key={route}>
            <span style={{ color: ROUTE_COLORS[route], fontWeight: 700 }}>■</span>{' '}
            {route.charAt(0).toUpperCase() + route.slice(1)}: {routeData[route].student_count} leerlingen
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ClassRadar() {
  const { class_name } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef(null)

  useEffect(() => {
    api.getClassRadar(class_name)
      .then(setData)
      .catch(() => setError('Fout bij laden van radardiagram.'))
  }, [class_name])

  async function handleExport() {
    if (!reportRef.current || !data) return
    setExporting(true)
    try {
      await exportPDF(reportRef.current, `radar-klas-${class_name}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  if (!data) return <div className="page">{error || 'Laden...'}</div>

  const hasAnyData = Object.keys(data.routes).length > 0

  return (
    <div className="page">
      <div className="page-header">
        <h1>Radardiagram — Klas {class_name}</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporteren...' : 'Exporteer PDF'}
          </button>
          <Link to={`/classes/${class_name}/overview`} className="btn btn-secondary">← Klasoverzicht</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!hasAnyData ? (
        <div className="card">
          <p className="text-muted">Geen leerlingen of toetsdata gevonden voor klas {class_name}.</p>
        </div>
      ) : (
        <div ref={reportRef}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <RadarPanel routeData={data.routes} type="domain" title="Radar — Domein" />
            <RadarPanel routeData={data.routes} type="level" title="Radar — Niveaulaag" />
          </div>
        </div>
      )}
    </div>
  )
}
