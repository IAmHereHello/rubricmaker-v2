// Remembers the pages visited inside the app, so a "← Terug" button can go to the
// page you actually came from instead of one fixed page.
//
// The trail is a list of { key, url }. Pages that count as one place share a key:
// the pages of a student (Voortgang, Rapport & Radar, Leerlingrapport) for every student, so
// switching student or page there is not a step back.

const TOP_LEVEL = ['/students', '/tests', '/sessions/new', '/inhalers', '/reports']
const MAX_TRAIL = 30
const STORAGE_KEY = 'backTrail'

export function placeKey(pathname) {
  if (/^\/students\/[^/]+\/(progress|report|leerlingrapport)\/?$/.test(pathname)) return 'student'
  return pathname.replace(/\/+$/, '') || '/'
}

// The trail after visiting `url` (pathname + search). Pure: returns a new list.
export function visit(trail, pathname, search = '') {
  const key = placeKey(pathname)
  const entry = { key, url: pathname + search }
  // A page from the menu starts a fresh trail
  if (TOP_LEVEL.includes(key)) return [entry]
  // Coming back to a page already on the trail drops everything after it
  const at = trail.findIndex(e => e.key === key)
  const next = at >= 0 ? [...trail.slice(0, at), entry] : [...trail, entry]
  return next.slice(-MAX_TRAIL)
}

// Where "Terug" leads from this page, or null when the page was opened directly.
export function backTarget(trail, pathname, search = '') {
  const next = visit(trail, pathname, search)
  return next.length >= 2 ? next[next.length - 2].url : null
}

export function loadTrail() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY))
    return Array.isArray(raw) ? raw.filter(e => e && typeof e.key === 'string' && typeof e.url === 'string') : []
  } catch {
    return []
  }
}

export function saveTrail(trail) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trail))
  } catch {
    // No storage (private window): the trail then only lasts until a reload
  }
}
