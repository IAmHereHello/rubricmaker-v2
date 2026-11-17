import { useNavigate } from 'react-router-dom'

// The student name as a dropdown of the whole class, with ‹ › for the previous and
// next student. Stays on the same page (`page`: 'progress', 'report' or 'leerlingrapport').
export default function StudentSwitcher({ student, students, page }) {
  const navigate = useNavigate()
  // Until the class list is loaded (or if it fails) the dropdown holds just this student
  const list = students.some(s => s.id === student.id) ? students : [student]
  const index = list.findIndex(s => s.id === student.id)
  const prev = list[index - 1]
  const next = list[index + 1]

  // replace: switching student is not a step for the back button
  const go = id => navigate(`/students/${id}/${page}`, { replace: true })

  return (
    <span className="student-switcher">
      <button
        type="button" className="btn btn-secondary btn-sm"
        onClick={() => go(prev.id)} disabled={!prev}
        title="Vorige leerling" aria-label="Vorige leerling"
      >‹</button>
      <select value={student.id} onChange={e => go(Number(e.target.value))} aria-label="Leerling">
        {list.map(s => (
          <option key={s.id} value={s.id}>{s.name} ({s.route})</option>
        ))}
      </select>
      <button
        type="button" className="btn btn-secondary btn-sm"
        onClick={() => go(next.id)} disabled={!next}
        title="Volgende leerling" aria-label="Volgende leerling"
      >›</button>
    </span>
  )
}
