// Files for sharing with colleagues: plain JSON with a .rubric or .resultaten extension.

export function safeFileName(name) {
  return (name || 'toets').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'toets'
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Resolves to the parsed file, or rejects with a Dutch message.
export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)) }
      catch { reject(new Error('Dit bestand kan niet gelezen worden. Kies een .rubric- of .resultaten-bestand.')) }
    }
    reader.onerror = () => reject(new Error('Dit bestand kan niet gelezen worden.'))
    reader.readAsText(file)
  })
}

export const GRADE_NAMES = { in_ontwikkeling: 'In ontwikkeling', beheerst: 'Beheerst', expert: 'Expert' }

export function resultLabel(grade) {
  if (grade === null || grade === undefined || grade === '') return 'geen resultaat'
  if (GRADE_NAMES[grade]) return GRADE_NAMES[grade]
  const n = Number(grade)
  return Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : String(grade)
}
