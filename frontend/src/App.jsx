import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Students from './pages/Students.jsx'
import TestList from './pages/TestList.jsx'
import TestEdit from './pages/TestEdit.jsx'
import SessionNew from './pages/SessionNew.jsx'
import Grade from './pages/Grade.jsx'
import Review from './pages/Review.jsx'
import StudentProgress from './pages/StudentProgress.jsx'
import StudentReport from './pages/StudentReport.jsx'
import ClassOverview from './pages/ClassOverview.jsx'
import ClassRadar from './pages/ClassRadar.jsx'
import ReportHome from './pages/ReportHome.jsx'
import SessionReport from './pages/SessionReport.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <nav>
        <NavLink to="/students" className="nav-brand">Rubricmaker</NavLink>
        <NavLink to="/students">Leerlingen</NavLink>
        <NavLink to="/tests">Toetsen</NavLink>
        <NavLink to="/sessions/new">Nakijken</NavLink>
        <NavLink to="/reports">Rapporten</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/students" replace />} />
        <Route path="/students" element={<Students />} />
        <Route path="/students/:id/progress" element={<StudentProgress />} />
        <Route path="/students/:id/report" element={<StudentReport />} />
        <Route path="/tests" element={<TestList />} />
        <Route path="/tests/:id/edit" element={<TestEdit />} />
        <Route path="/sessions/new" element={<SessionNew />} />
        <Route path="/sessions/:id/grade" element={<Grade />} />
        <Route path="/sessions/:id/review" element={<Review />} />
        <Route path="/classes/:class_name/overview" element={<ClassOverview />} />
        <Route path="/classes/:class_name/radar" element={<ClassRadar />} />
        <Route path="/reports" element={<ReportHome />} />
        <Route path="/reports/session/:id" element={<SessionReport />} />
      </Routes>
    </BrowserRouter>
  )
}
