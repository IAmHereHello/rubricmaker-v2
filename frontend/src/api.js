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

export const setSessionOrder = (id, data) =>
  http.put(`/sessions/${id}/order`, data).then(r => r.data)

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

// ── Grades ────────────────────────────────────────────────────────────────────

export const getSessionGrades = (session_id) =>
  http.get(`/grades/session/${session_id}`).then(r => r.data)

export const upsertStudentGrade = (session_id, student_id, data) =>
  http.put(`/grades/session/${session_id}/student/${student_id}`, data).then(r => r.data)
