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
