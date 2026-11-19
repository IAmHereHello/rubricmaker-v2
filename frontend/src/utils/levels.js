// Leerjaar groups. A class has a leerjaar (1-6) and niveaus (m/h/v); its group label is
// leerjaar + niveaus, e.g. "2mhv" or "3" (no niveau ticked). Rubrics list the labels they belong to.

export const NIVEAUS = [
  { key: 'm', label: 'mavo' },
  { key: 'h', label: 'havo' },
  { key: 'v', label: 'vwo' },
]
export const LEERJAREN = [1, 2, 3, 4, 5, 6]

export function cleanNiveaus(value) {
  const v = (value || '').toLowerCase()
  return NIVEAUS.map(n => n.key).filter(k => v.includes(k)).join('')
}

// Best guess from a class name: "2mhv1" -> 2 + mhv, "4H2" -> 4 + h, "2k" -> 2 only.
export function guessLevel(className) {
  const m = /^\s*([1-6])([a-z]*)/i.exec(className || '')
  if (!m) return { leerjaar: null, niveaus: '' }
  const letters = m[2].toLowerCase()
  const niveaus = letters && [...letters].every(ch => 'mhv'.includes(ch)) ? cleanNiveaus(letters) : ''
  return { leerjaar: Number(m[1]), niveaus }
}

export function levelLabel(level) {
  if (!level || !level.leerjaar) return null
  return `${level.leerjaar}${cleanNiveaus(level.niveaus)}`
}

export function parseLabel(label) {
  const m = /^([1-6])([mhv]*)$/.exec(label || '')
  return m ? { leerjaar: Number(m[1]), niveaus: m[2] } : null
}

const NIVEAU_ORDER = ['', 'm', 'mh', 'mhv', 'mv', 'h', 'hv', 'v']

export function compareLabels(a, b) {
  const pa = parseLabel(a), pb = parseLabel(b)
  if (!pa || !pb) return String(a).localeCompare(String(b))
  if (pa.leerjaar !== pb.leerjaar) return pa.leerjaar - pb.leerjaar
  return NIVEAU_ORDER.indexOf(pa.niveaus) - NIVEAU_ORDER.indexOf(pb.niveaus)
}

export function sortLabels(labels) {
  return [...new Set(labels)].sort(compareLabels)
}

// Level one school year later: leerjaar + 1; past 6 the class has no leerjaar any more.
export function nextYearLevel(level) {
  if (!level || !level.leerjaar) return null
  const next = level.leerjaar + 1
  return next > 6 ? null : { leerjaar: next, niveaus: level.niveaus || '' }
}
