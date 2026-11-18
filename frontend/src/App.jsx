import { useState, useEffect } from 'react'
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route, NavLink, Navigate, Outlet } from 'react-router-dom'
import Students from './pages/Students.jsx'
import TestList from './pages/TestList.jsx'
import TestEdit from './pages/TestEdit.jsx'
import SessionNew from './pages/SessionNew.jsx'
import Grade from './pages/Grade.jsx'
import Review from './pages/Review.jsx'
import EditResult from './pages/EditResult.jsx'
import StudentProgress from './pages/StudentProgress.jsx'
import StudentReport from './pages/StudentReport.jsx'
import Leerlingrapport from './pages/Leerlingrapport.jsx'
import ClassOverview from './pages/ClassOverview.jsx'
import ClassImport from './pages/ClassImport.jsx'
import ClassRadar from './pages/ClassRadar.jsx'
import ReportHome from './pages/ReportHome.jsx'
import SessionReport from './pages/SessionReport.jsx'
import Inhalers from './pages/Inhalers.jsx'
import InhalerGrade from './pages/InhalerGrade.jsx'
import SchoolYearWizard from './pages/SchoolYearWizard.jsx'
import OpdrachtGrade from './pages/OpdrachtGrade.jsx'
import OpdrachtReport from './pages/OpdrachtReport.jsx'
import RubricImport from './pages/RubricImport.jsx'
import Compare from './pages/Compare.jsx'
import OpdrachtSwitch from './components/OpdrachtSwitch.jsx'
import { BackTrailTracker } from './components/BackButton.jsx'
import * as api from './api.js'

// Data router (not <BrowserRouter>) so edit pages can intercept leaving with useBlocker.
function Layout() {
  const [schoolYearStatus, setSchoolYearStatus] = useState(null)
  const [allStudents, setAllStudents] = useState([])
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    const month = new Date().getMonth() + 1
    if ([7, 8, 9].includes(month)) {
      api.getSchoolYearStatus().then(setSchoolYearStatus).catch(() => {})
      api.getStudents().then(setAllStudents).catch(() => {})
    }
  }, [])

  function handleWizardDone() {
    setWizardOpen(false)
    setSchoolYearStatus(null)
    window.location.reload()
  }

  const showButton = schoolYearStatus?.should_show

  return (
    <>
      <BackTrailTracker />
      <nav>
        <NavLink to="/students" className="nav-brand">Rubricmaker</NavLink>
        <NavLink to="/students">Leerlingen</NavLink>
        <NavLink to="/tests">Toetsen</NavLink>
        <NavLink to="/sessions/new">Nakijken</NavLink>
        <NavLink to="/inhalers">Inhalers</NavLink>
        <NavLink to="/reports">Rapporten</NavLink>
        <NavLink to="/compare">Vergelijken</NavLink>
        {showButton && (
          <button
            onClick={() => setWizardOpen(true)}
            style={{
              marginLeft: 'auto',
              padding: '5px 14px',
              borderRadius: 5,
              border: '2px solid #e65100',
              background: '#fff3e0',
              color: '#e65100',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Nieuw schooljaar
          </button>
        )}
      </nav>

      <Outlet />

      {wizardOpen && schoolYearStatus && (
        <SchoolYearWizard
          status={schoolYearStatus}
          allStudents={allStudents}
          onClose={() => setWizardOpen(false)}
          onDone={handleWizardDone}
        />
      )}
    </>
  )
}

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<Layout />}>
    <Route path="/" element={<Navigate to="/students" replace />} />
    <Route path="/students" element={<Students />} />
    <Route path="/students/:id/progress" element={<StudentProgress />} />
    <Route path="/students/:id/report" element={<StudentReport />} />
    <Route path="/students/:id/leerlingrapport" element={<Leerlingrapport />} />
    <Route path="/tests" element={<TestList />} />
    <Route path="/tests/import" element={<RubricImport />} />
    <Route path="/tests/:id/edit" element={<TestEdit />} />
    <Route path="/sessions/new" element={<SessionNew />} />
    <Route path="/sessions/:id/grade" element={<OpdrachtSwitch normal={Grade} opdracht={OpdrachtGrade} />} />
    <Route path="/sessions/:id/review" element={<OpdrachtSwitch normal={Review} redirect={p => `/reports/session/${p.id}?view=results`} />} />
    <Route path="/sessions/:id/edit/:studentId" element={<OpdrachtSwitch normal={EditResult} redirect={p => `/sessions/${p.id}/grade?student=${p.studentId}&from=report`} />} />
    <Route path="/classes/import" element={<ClassImport />} />
    <Route path="/classes/:class_name/overview" element={<ClassOverview />} />
    <Route path="/classes/:class_name/radar" element={<ClassRadar />} />
    <Route path="/inhalers" element={<Inhalers />} />
    <Route path="/sessions/:id/inhaler/:studentId" element={<OpdrachtSwitch normal={InhalerGrade} redirect={p => `/sessions/${p.id}/grade?student=${p.studentId}&from=inhalers`} />} />
    <Route path="/reports" element={<ReportHome />} />
    <Route path="/compare" element={<Compare />} />
    <Route path="/compare/:shareId" element={<Compare />} />
    <Route path="/reports/session/:id" element={<OpdrachtSwitch normal={SessionReport} opdracht={OpdrachtReport} />} />
  </Route>
))

export default function App() {
  return <RouterProvider router={router} />
}
