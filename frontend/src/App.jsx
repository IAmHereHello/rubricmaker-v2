import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Students from './pages/Students.jsx'
import TestList from './pages/TestList.jsx'
import TestEdit from './pages/TestEdit.jsx'
import SessionNew from './pages/SessionNew.jsx'
import Grade from './pages/Grade.jsx'
import StudentProgress from './pages/StudentProgress.jsx'
import ClassOverview from './pages/ClassOverview.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <nav>
        <NavLink to="/students" className="nav-brand">Rubricmaker</NavLink>
        <NavLink to="/students">Leerlingen</NavLink>
        <NavLink to="/tests">Toetsen</NavLink>
        <NavLink to="/sessions/new">Nakijken</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/students" replace />} />
        <Route path="/students" element={<Students />} />
        <Route path="/students/:id/progress" element={<StudentProgress />} />
        <Route path="/tests" element={<TestList />} />
        <Route path="/tests/:id/edit" element={<TestEdit />} />
        <Route path="/sessions/new" element={<SessionNew />} />
        <Route path="/sessions/:id/grade" element={<Grade />} />
        <Route path="/classes/:class_name/overview" element={<ClassOverview />} />
      </Routes>
    </BrowserRouter>
  )
}
