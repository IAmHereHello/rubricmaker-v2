import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

// ── Students ──────────────────────────────────────────────────────────────────

export const getStudents = (class_name) =>
  http.get('/students', { params: class_name ? { class_name } : {} }).then(r => r.data)

export const createStudent = (data) => http.post('/students', data).then(r => r.data)

export const updateStudent = (id, data) => http.put(`/students/${id}`, data).then(r => r.data)

export const deleteStudent = (id) => http.delete(`/students/${id}`).then(r => r.data)

// ── Tests ─────────────────────────────────────────────────────────────────────

export const getTests = () => http.get('/tests').then(r => r.data)

export const createTest = (data) => http.post('/tests', data).then(r => r.data)

export const getTest = (id) => http.get(`/tests/${id}`).then(r => r.data)

export const deleteTest = (id) => http.delete(`/tests/${id}`).then(r => r.data)

// ── Questions ─────────────────────────────────────────────────────────────────

export const getDomains = () => http.get('/questions/domains').then(r => r.data)

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

// ── Scores ────────────────────────────────────────────────────────────────────

export const upsertScore = (data) => http.put('/scores', data).then(r => r.data)

export const getSessionScores = (session_id) =>
  http.get(`/scores/session/${session_id}`).then(r => r.data)

// ── Progress ──────────────────────────────────────────────────────────────────

export const getStudentProgress = (student_id) =>
  http.get(`/progress/student/${student_id}`).then(r => r.data)

export const getClassProgress = (class_name, route) =>
  http.get(`/progress/class/${encodeURIComponent(class_name)}/${route}`).then(r => r.data)
