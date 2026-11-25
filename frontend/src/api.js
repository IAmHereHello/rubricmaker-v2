import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

// ── Students ──────────────────────────────────────────────────────────────────

export const getStudents = (class_name) =>
  http.get('/students', { params: class_name ? { class_name } : {} }).then(r => r.data)

export const createStudent = (data) => http.post('/students', data).then(r => r.data)

export const updateStudent = (id, data) => http.put(`/students/${id}`, data).then(r => r.data)

export const deleteStudent = (id) => http.delete(`/students/${id}`).then(r => r.data)

export const importStudents = (data) => http.post('/students/import', data).then(r => r.data)

export const deleteClass = (class_name) =>
  http.delete(`/students/class/${encodeURIComponent(class_name)}`).then(r => r.data)

// ── Tests ─────────────────────────────────────────────────────────────────────

export const getTests = () => http.get('/tests').then(r => r.data)

export const createTest = (data) => http.post('/tests', data).then(r => r.data)

export const getTest = (id) => http.get(`/tests/${id}`).then(r => r.data)

export const updateTest = (id, data) => http.put(`/tests/${id}`, data).then(r => r.data)

export const deleteTest = (id) => http.delete(`/tests/${id}`).then(r => r.data)

// ── Questions ─────────────────────────────────────────────────────────────────

export const createQuestion = (data) => http.post('/questions', data).then(r => r.data)

export const updateQuestion = (id, data) => http.put(`/questions/${id}`, data).then(r => r.data)

export const deleteQuestion = (id) => http.delete(`/questions/${id}`).then(r => r.data)

export const reorderQuestions = (items) => http.put('/questions/reorder', items).then(r => r.data)

// ── Sessions ──────────────────────────────────────────────────────────────────

export const getSessions = () => http.get('/sessions').then(r => r.data)

export const createSession = (data) => http.post('/sessions', data).then(r => r.data)

export const getSession = (id) => http.get(`/sessions/${id}`).then(r => r.data)

export const deleteSession = (id) => http.delete(`/sessions/${id}`).then(r => r.data)

export const setSessionOrder = (id, data) =>
  http.put(`/sessions/${id}/order`, data).then(r => r.data)

export const setSessionMode = (id, grading_mode) =>
  http.put(`/sessions/${id}/mode`, { grading_mode }).then(r => r.data)

// Switch a student's route while grading: permanent from this session on, earlier sessions keep theirs.
export const switchStudentRoute = (session_id, student_id, route) =>
  http.put(`/sessions/${session_id}/student/${student_id}/route`, { route }).then(r => r.data)

export const dismissInhaler = (session_id, student_id) =>
  http.post(`/sessions/${session_id}/dismiss-inhaler`, { student_id }).then(r => r.data)

export const undismissInhaler = (session_id, student_id) =>
  http.delete(`/sessions/${session_id}/dismiss-inhaler/${student_id}`).then(r => r.data)

// ── Scores ────────────────────────────────────────────────────────────────────

export const upsertScore = (data) => http.put('/scores', data).then(r => r.data)

export const getSessionScores = (session_id) =>
  http.get(`/scores/session/${session_id}`).then(r => r.data)

// ── Progress ──────────────────────────────────────────────────────────────────

export const getStudentProgress = (student_id) =>
  http.get(`/progress/student/${student_id}`).then(r => r.data)

export const getClassProgress = (class_name, route) =>
  http.get(`/progress/class/${encodeURIComponent(class_name)}/${route}`).then(r => r.data)

// ── Reports ───────────────────────────────────────────────────────────────────

export const getSessionReport = (session_id) =>
  http.get(`/reports/session/${session_id}`).then(r => r.data)

export const getStudentTimeline = (student_id) =>
  http.get(`/reports/student/${student_id}/timeline`).then(r => r.data)

export const getStudentRadar = (student_id) =>
  http.get(`/reports/student/${student_id}/radar`).then(r => r.data)

export const getClassRadar = (class_name) =>
  http.get(`/reports/class/${encodeURIComponent(class_name)}/radar`).then(r => r.data)

// ── Leerlingrapport ───────────────────────────────────────────────────────────

export const getLeerlingrapport = (student_id) =>
  http.get(`/leerlingrapport/student/${student_id}`).then(r => r.data)

export const saveStudentNotes = (student_id, notes) =>
  http.put(`/leerlingrapport/student/${student_id}/notes`, notes).then(r => r.data)

// ── Grades ────────────────────────────────────────────────────────────────────

export const getSessionGrades = (session_id) =>
  http.get(`/grades/session/${session_id}`).then(r => r.data)

export const upsertStudentGrade = (session_id, student_id, data) =>
  http.put(`/grades/session/${session_id}/student/${student_id}`, data).then(r => r.data)

// ── School year transition ─────────────────────────────────────────────────────

export const getSchoolYearStatus = () =>
  http.get('/school-year/status').then(r => r.data)

export const advanceSchoolYear = (data) =>
  http.post('/school-year/advance', data).then(r => r.data)

export const getSchoolYearExportUrl = () => '/api/school-year/export-csv'

// ── Grote opdracht ────────────────────────────────────────────────────────────

export const getOpdrachtSession = (session_id) =>
  http.get(`/opdracht/sessions/${session_id}`).then(r => r.data)

export const setOpdrachtState = (session_id, data) =>
  http.put(`/opdracht/sessions/${session_id}/state`, data).then(r => r.data)

// Returns { group_id, data }; a 409 means a student is already in another group
export const createOpdrachtGroup = (session_id, student_ids, move = false) =>
  http.post(`/opdracht/sessions/${session_id}/groups`, { student_ids, move }).then(r => r.data)

export const updateOpdrachtGroup = (group_id, student_ids, move = false) =>
  http.put(`/opdracht/groups/${group_id}`, { student_ids, move }).then(r => r.data)

export const deleteOpdrachtGroup = (group_id) =>
  http.delete(`/opdracht/groups/${group_id}`).then(r => r.data)

export const setOpdrachtEntry = (session_id, student_id, part, status = 'ingeleverd') =>
  http.post(`/opdracht/sessions/${session_id}/entries`, { student_id, part, status }).then(r => r.data)

export const deleteOpdrachtEntry = (session_id, student_id, part) =>
  http.delete(`/opdracht/sessions/${session_id}/entries/${student_id}/${part}`).then(r => r.data)

// data: { criterion_id, group_id | student_id, level?, comment?, reset? }
export const setOpdrachtLevel = (session_id, data) =>
  http.put(`/opdracht/sessions/${session_id}/levels`, data).then(r => r.data)

export const getOpdrachtUsage = (test_id) =>
  http.get(`/opdracht/tests/${test_id}/usage`).then(r => r.data)

// ── Delen met collega's ───────────────────────────────────────────────────────

export const getShareSettings = () => http.get('/sharing/settings').then(r => r.data)

export const saveShareSettings = (teacher_name) =>
  http.put('/sharing/settings', { teacher_name }).then(r => r.data)

export const exportRubricFile = (test_id) =>
  http.get(`/sharing/tests/${test_id}/rubric`).then(r => r.data)

export const exportResultsFile = (test_id) =>
  http.get(`/sharing/tests/${test_id}/results`).then(r => r.data)

export const getResultsExportOptions = () =>
  http.get('/sharing/results/options').then(r => r.data)

export const exportSelectedResults = (items) =>
  http.post('/sharing/results/export', { items }).then(r => r.data)

export const inspectRubricFile = (file) =>
  http.post('/sharing/rubric/inspect', { file }).then(r => r.data)

export const importRubricFile = (file) =>
  http.post('/sharing/rubric/import', { file }).then(r => r.data)

export const previewRubricUpdate = (file, accept) =>
  http.post('/sharing/rubric/update/preview', { file, accept }).then(r => r.data)

export const applyRubricUpdate = (file, accept) =>
  http.post('/sharing/rubric/update/apply', { file, accept }).then(r => r.data)

export const importResultsFile = (file) =>
  http.post('/sharing/compare/import', { file }).then(r => r.data)

export const getComparisons = () => http.get('/sharing/compare').then(r => r.data)

export const getComparison = (share_id, route) =>
  http.get(`/sharing/compare/${share_id}`, { params: route ? { route } : {} }).then(r => r.data)

export const deleteComparisonImport = (id) =>
  http.delete(`/sharing/compare/import/${id}`).then(r => r.data)

export const getNeedsCheck = () => http.get('/sharing/needs-check').then(r => r.data)

export const markStudentChecked = (session_id, student_id) =>
  http.put(`/sharing/sessions/${session_id}/students/${student_id}/checked`).then(r => r.data)

export const markSessionChecked = (session_id) =>
  http.put(`/sharing/sessions/${session_id}/checked`).then(r => r.data)

// Error text from the backend (Dutch), or a fallback
// ── Klas overdragen ───────────────────────────────────────────────────────────

export const getClassTransferOverview = (class_name) =>
  http.get('/klas/overview', { params: { class_name } }).then(r => r.data)

export const exportClassFile = (class_name, session_ids) =>
  http.post('/klas/export', { class_name, session_ids }).then(r => r.data)

export const deleteClassAfterTransfer = (class_name) =>
  http.post('/klas/delete', { class_name }).then(r => r.data)

export const inspectClassFile = (file) => http.post('/klas/inspect', { file }).then(r => r.data)

export const previewClassImport = (body) => http.post('/klas/preview', body).then(r => r.data)

export const applyClassImport = (body) => http.post('/klas/apply', body).then(r => r.data)

export const renameClass = (class_name, new_name) =>
  http.post('/klas/rename', { class_name, new_name }).then(r => r.data)

export const errorText = (e, fallback) => e?.response?.data?.detail && typeof e.response.data.detail === 'string'
  ? e.response.data.detail
  : fallback

// ── Leerjaar groups ───────────────────────────────────────────────────────────

export const getClassLevels = () => http.get('/levels/classes').then(r => r.data)

export const setClassLevel = (class_name, level) =>
  http.put('/levels/classes', { class_name, leerjaar: level?.leerjaar || null, niveaus: level?.niveaus || '' }).then(r => r.data)

export const getLevelSuggestions = () => http.get('/levels/suggestions').then(r => r.data)

export const fillLevelSuggestions = () => http.post('/levels/fill').then(r => r.data)

// ── Printbare rubrics (scan-import) ─────────────────────────────────────────────

export const savePrintSheets = (test_id, sheets) =>
  http.post('/print-sheets', { test_id, sheets }).then(r => r.data)

export const getPrintSheets = (ids) =>
  http.get('/print-sheets', { params: { ids: ids.join(',') } }).then(r => r.data)

export const getLatestPrintSheets = (test_id, student_id, route) =>
  http.get('/print-sheets/latest', { params: { test_id, student_id: student_id ?? undefined, route: route || undefined } }).then(r => r.data)
