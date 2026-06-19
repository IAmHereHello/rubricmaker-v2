// Shared domain constants for the test builder and progress views.

// De Lange pyramid levels. The `value` is the stable code stored in the
// database (and used as the CSS pill class + heatmap key); `label` is the
// Dutch label shown in the UI.
export const PYRAMID_LEVELS = [
  { value: 'reproductie', label: 'Reproduceren' },
  { value: 'verbinding', label: 'Wiskundig gereedschap kiezen' },
  { value: 'reflectie', label: 'Generaliseren' },
]

export const pyramidLabel = (value) =>
  PYRAMID_LEVELS.find(l => l.value === value)?.label ?? value

// Fixed set of domains the teacher works with.
export const DOMAINS = ['Algebra', 'Meetkunde', 'Rekenen', 'Statistiek']

// Convenience aliases used by the report pages.
export const LEVELS = PYRAMID_LEVELS.map(l => l.value)
export const LEVEL_LABELS = Object.fromEntries(PYRAMID_LEVELS.map(l => [l.value, l.label]))

export const ROUTE_COLORS = {
  oranje: '#e07820',
  geel: '#a08b00',
  blauw: '#1a6ecc',
}

export const STUDENT_COLORS = [
  '#1e3a5f', '#059669', '#dc2626', '#7c3aed', '#0891b2', '#d97706', '#be185d',
]
