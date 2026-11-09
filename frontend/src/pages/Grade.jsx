import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import { pyramidLabel } from '../constants.js'
import {
  isApplicableForQuestion,
  getOrderedStudents,
  shouldEnterQ1Mode,
  findResumePosition,
  formatCijferFormula,
  getApplicableQuestionIndices,
  findVerticalResume,
  findMissingScores,
  findStaleScores,
  hasPostQ1Scores,
  needsRestEntry,
} from '../utils/gradingLogic.js'

export default function Grade() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [test, setTest] = useState(null)
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState({})
  const [qIdx, setQIdx] = useState(0)
  const [sIdx, setSIdx] = useState(0)
  const [inputVal, setInputVal] = useState('')
  const [commentVal, setCommentVal] = useState('')
  const [showComment, setShowComment] = useState(false)
  const [showPrev, setShowPrev] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [skipNotice, setSkipNotice] = useState('')
  // Up-to-date copy of `scores` for async handlers that read right after saving
  const scoresRef = useRef({})
  // Horizontal mode: missed { qIdx, studentId } pairs to catch up on at the end
  const [fixQueue, setFixQueue] = useState(null)
  const [fixPos, setFixPos] = useState(0)
  // Vertical mode: missed questions already sent back to once (not again if left empty)
  const revisitedRef = useRef(new Set())
  const scoreInputRef = useRef(null)
  const commentInputRef = useRef(null)

  // Q1 type-select state
  const [q1Mode, setQ1Mode] = useState(false)
  const [q1Name, setQ1Name] = useState('')
  const [q1ScoreVal, setQ1ScoreVal] = useState('')
  const [q1Saving, setQ1Saving] = useState(false)
  const q1NameRef = useRef(null)
  const q1ScoreRef = useRef(null)
  const q1AddRef = useRef(null)
  const prevQ1SelectedId = useRef(null)
  const [q1EditingItemId, setQ1EditingItemId] = useState(null)
  const [q1EditScoreVal, setQ1EditScoreVal] = useState('')

  // Vertical mode (per student): which student is open and which of their applicable questions
  const [vStudentId, setVStudentId] = useState(null)
  const [vPos, setVPos] = useState(0)
  const [vName, setVName] = useState('')
  const [vBusy, setVBusy] = useState(false)
  const vNameRef = useRef(null)
  const [switching, setSwitching] = useState(false)

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [sess, sc] = await Promise.all([api.getSession(id), api.getSessionScores(id)])
        const [t, studs] = await Promise.all([
          api.getTest(sess.test_id),
          api.getStudents(sess.class_name),
        ])

        const scoreMap = {}
        for (const s of sc) scoreMap[`${s.question_id}-${s.student_id}`] = s

        const sortedStuds = [...studs].sort((a, b) => a.name.localeCompare(b.name, 'nl'))

        setSession(sess)
        setTest(t)
        setStudents(sortedStuds)
        scoresRef.current = scoreMap
        setScores(scoreMap)
        enterMode(sess, t, sortedStuds, scoreMap)
      } catch {
        setError('Fout bij laden van sessie.')
      }
    }
    load()
  }, [id])

  // Open the right place in the session for its grading mode (on load and after switching).
  function enterMode(sess, t, studs, scoreMap) {
    setQ1Mode(false)
    setQ1Name('')
    setQ1ScoreVal('')
    setQ1EditingItemId(null)
    setVStudentId(null)
    setVPos(0)
    setVName('')
    setFixQueue(null)
    setFixPos(0)
    setQIdx(0)
    setSIdx(0)
    setDone(false)
    revisitedRef.current = new Set()

    if (sess.grading_mode === 'vertical') {
      const orderedStuds = (sess.student_order || []).length ? getOrderedStudents(sess, studs) : []
      const resume = findVerticalResume(t, orderedStuds, scoreMap)
      if (resume) {
        setVStudentId(resume.studentId)
        setVPos(resume.pos)
      } else if (sess.stack_closed) {
        setDone(true)
      }
    } else if (shouldEnterQ1Mode(sess, t, scoreMap) || needsRestEntry(sess, t, studs, scoreMap)) {
      setQ1Mode(true)
    } else {
      const orderedStuds = getOrderedStudents(sess, studs)
      const [rqIdx, rsIdx] = findResumePosition(t, orderedStuds, scoreMap)
      if (rqIdx >= t.questions.length) {
        const missing = findMissingScores(t, orderedStuds, scoreMap)
        if (missing.length) setFixQueue(missing)
        else setDone(true)
      } else {
        setQIdx(rqIdx)
        setSIdx(rsIdx)
      }
    }
  }

  // Switch between per vraag and per leerling. All scores stay; a typed score is saved first.
  async function switchMode(mode) {
    if (switching || !session || session.grading_mode === mode) return
    setSwitching(true)
    try {
      if (!q1Mode) await persistScore()
      const updated = await api.setSessionMode(id, mode)
      const fresh = await refreshStudents()
      setSession(updated)
      setSkipNotice('')
      enterMode(updated, test, fresh, scoresRef.current)
    } catch {
      setError('Wisselen mislukt.')
    } finally {
      setSwitching(false)
    }
  }

  // ── Derived state (regular mode) ─────────────────────────────────────────────
  const orderedStudents = useMemo(
    () => getOrderedStudents(session, students),
    [session?.student_order, students]
  )

  const isVertical = session?.grading_mode === 'vertical'
  const vStudent = useMemo(() => students.find(s => s.id === vStudentId) ?? null, [students, vStudentId])
  const vQIndices = useMemo(() => getApplicableQuestionIndices(test, vStudent), [test, vStudent])

  const fixItem = fixQueue ? fixQueue[fixPos] : null
  const currentQuestion = fixItem
    ? test?.questions[fixItem.qIdx]
    : isVertical ? test?.questions[vQIndices[vPos]] : test?.questions[qIdx]
  // Index of the open question within the whole test (qIdx in horizontal mode)
  const curQIdx = fixItem ? fixItem.qIdx : isVertical ? (vQIndices[vPos] ?? 0) : qIdx

  const applicableStudents = useMemo(() => {
    if (!currentQuestion) return []
    return orderedStudents.filter(s => (currentQuestion.routes || []).includes(s.route))
  }, [orderedStudents, currentQuestion])

  const currentStudent = fixItem
    ? students.find(s => s.id === fixItem.studentId)
    : isVertical ? vStudent : applicableStudents[sIdx]

  const scoreKey = (qid, sid) => `${qid}-${sid}`

  // Auto-clear skip notice after 5 seconds
  useEffect(() => {
    if (!skipNotice) return
    const t = setTimeout(() => setSkipNotice(''), 5000)
    return () => clearTimeout(t)
  }, [skipNotice])

  // ── Derived state (Q1 mode) ──────────────────────────────────────────────────
  const q1AvailableStudents = useMemo(() => {
    if (!q1Mode || !students.length) return []
    const addedIds = new Set(session?.student_order || [])
    return students.filter(s => !addedIds.has(s.id))
  }, [q1Mode, students, session?.student_order])

  const q1SelectedStudent = useMemo(() => {
    if (!q1Name.trim()) return null
    const needle = q1Name.trim().toLowerCase()
    return q1AvailableStudents.find(s => s.name.toLowerCase() === needle) ?? null
  }, [q1Name, q1AvailableStudents])

  const q1EnteredList = useMemo(() => {
    if (!q1Mode || !test) return []
    const q1 = test.questions[0]
    return (session?.student_order || [])
      .map(sid => {
        const stud = students.find(s => s.id === sid)
        const sc = scores[scoreKey(q1.id, sid)]
        return stud ? { id: sid, name: stud.name, points: sc?.points ?? null, excluded: sc?.excluded ?? false } : null
      })
      .filter(Boolean)
  }, [q1Mode, session?.student_order, students, scores, test])

  // ── Derived state (vertical name-pick) ───────────────────────────────────────
  const vAvailableStudents = useMemo(() => {
    if (!isVertical) return []
    const addedIds = new Set(session?.student_order || [])
    return students.filter(s => !addedIds.has(s.id))
  }, [isVertical, students, session?.student_order])

  const vSelectedStudent = useMemo(() => {
    if (!vName.trim()) return null
    const needle = vName.trim().toLowerCase()
    return vAvailableStudents.find(s => s.name.toLowerCase() === needle) ?? null
  }, [vName, vAvailableStudents])

  const vEnteredList = useMemo(() => {
    if (!isVertical || !test) return []
    return (session?.student_order || [])
      .map(sid => {
        const stud = students.find(s => s.id === sid)
        if (!stud) return null
        const idxs = getApplicableQuestionIndices(test, stud)
        const complete = idxs.every(i => {
          const sc = scores[scoreKey(test.questions[i].id, sid)]
          return sc && (sc.points !== null && sc.points !== undefined)
        })
        return { id: sid, name: stud.name, complete }
      })
      .filter(Boolean)
  }, [isVertical, session?.student_order, students, scores, test])

  // ── Effects ──
  // Vertical: focus the name input whenever we are (back) in the name-pick phase
  useEffect(() => {
    if (isVertical && test && !vStudentId && !done) vNameRef.current?.focus()
  }, [isVertical, test, vStudentId, done])

  // Vertical: auto-select the last remaining student
  useEffect(() => {
    if (isVertical && !vStudentId && vAvailableStudents.length === 1) {
      setVName(vAvailableStudents[0].name)
    }
  }, [isVertical, vStudentId, vAvailableStudents])
  // ── Effects (continued) ──────────────────────────────────────────
  // Sync input value when student/question changes (regular mode)
  useEffect(() => {
    if (!currentQuestion || !currentStudent) return
    const existing = scores[scoreKey(currentQuestion.id, currentStudent.id)]
    setInputVal(
      existing && existing.points !== null && existing.points !== undefined
        ? String(existing.points)
        : ''
    )
    setCommentVal(existing?.comment || '')
    setShowComment(false)
  }, [qIdx, sIdx, currentQuestion?.id, currentStudent?.id])

  // Focus the comment input when it's opened
  useEffect(() => {
    if (showComment) commentInputRef.current?.focus()
  }, [showComment])

  // Auto-focus score input when student/question changes (regular mode)
  useEffect(() => {
    if (!q1Mode && currentQuestion && currentStudent) {
      scoreInputRef.current?.focus()
      scoreInputRef.current?.select()
    }
  }, [q1Mode, qIdx, sIdx, currentQuestion?.id, currentStudent?.id])

  // Auto-focus name input when Q1 mode activates
  useEffect(() => {
    if (q1Mode) q1NameRef.current?.focus()
  }, [q1Mode])

  // Auto-focus the relevant input when a valid student is selected in Q1 mode
  useEffect(() => {
    const newId = q1SelectedStudent?.id ?? null
    if (newId !== null && newId !== prevQ1SelectedId.current) {
      const applicable = (test?.questions[0]?.routes || []).includes(q1SelectedStudent?.route)
      if (applicable) {
        q1ScoreRef.current?.focus()
        q1ScoreRef.current?.select()
      } else {
        q1AddRef.current?.focus()
      }
    }
    prevQ1SelectedId.current = newId
  }, [q1SelectedStudent?.id])

  // Auto-select the last remaining student in Q1 mode
  useEffect(() => {
    if (q1Mode && q1AvailableStudents.length === 1) {
      setQ1Name(q1AvailableStudents[0].name)
    }
  }, [q1Mode, q1AvailableStudents])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function putScore(key, saved) {
    scoresRef.current = { ...scoresRef.current, [key]: saved }
    setScores(scoresRef.current)
  }

  // Routes can be changed on the Leerlingen page while grading; reload them at each checkpoint.
  async function refreshStudents() {
    try {
      const fresh = (await api.getStudents(session.class_name)).sort((a, b) => a.name.localeCompare(b.name, 'nl'))
      setStudents(fresh)
      return fresh
    } catch {
      return students
    }
  }

  // After a route change: mark scores of questions outside the new route as n.v.t. (the
  // points are kept) and return the questions of the new route that still need a score.
  async function checkRouteChanges(stack) {
    for (const { question, student, score } of findStaleScores(test, stack, scoresRef.current)) {
      const saved = await api.upsertScore({
        session_id: parseInt(id),
        student_id: student.id,
        question_id: question.id,
        points: score.points,
        excluded: true,
        comment: score.comment ?? null,
      })
      putScore(scoreKey(question.id, student.id), saved)
    }
    return findMissingScores(test, stack, scoresRef.current)
  }

  // Horizontal mode reached the last question: catch up on missed questions before finishing.
  async function finishHorizontal(order) {
    const fresh = await refreshStudents()
    const missing = await checkRouteChanges(getOrderedStudents({ student_order: order }, fresh))
    if (missing.length) {
      setFixPos(0)
      setFixQueue(missing)
    } else {
      setDone(true)
    }
  }

  function questionList(qIdxs) {
    const nrs = [...new Set(qIdxs)].sort((a, b) => a - b).map(i => i + 1)
    return nrs.length === 1 ? `vraag ${nrs[0]}` : `vragen ${nrs.slice(0, -1).join(', ')} en ${nrs[nrs.length - 1]}`
  }
  async function persistScore() {
    if (!currentQuestion || !currentStudent || inputVal === '') return
    const points = parseInt(inputVal, 10)
    if (isNaN(points) || points < 0 || points > currentQuestion.max_score) return

    setSaving(true)
    try {
      const saved = await api.upsertScore({
        session_id: parseInt(id),
        student_id: currentStudent.id,
        question_id: currentQuestion.id,
        points,
        excluded: false,
        comment: commentVal.trim() || null,
      })
      putScore(scoreKey(currentQuestion.id, currentStudent.id), saved)
    } finally {
      setSaving(false)
    }
  }

  function toggleComment() {
    setShowComment(v => !v)
  }

  async function createExcludedScores(question, allStudents) {
    const excluded = allStudents.filter(s => !isApplicableForQuestion(s, question))
    for (const s of excluded) {
      const key = scoreKey(question.id, s.id)
      if (!scoresRef.current[key]) {
        const saved = await api.upsertScore({
          session_id: parseInt(id),
          student_id: s.id,
          question_id: question.id,
          points: null,
          excluded: true,
        })
        putScore(key, saved)
      }
    }
  }

  async function createExcludedForStudent(student) {
    for (const q of test.questions) {
      if (isApplicableForQuestion(student, q)) continue
      const key = scoreKey(q.id, student.id)
      if (!scoresRef.current[key]) {
        const saved = await api.upsertScore({
          session_id: parseInt(id),
          student_id: student.id,
          question_id: q.id,
          points: null,
          excluded: true,
        })
        putScore(key, saved)
      }
    }
  }

  // ── Vertical handlers ────────────────────────────────────────────────────────
  async function closeStack(order) {
    const updated = await api.setSessionOrder(id, { student_order: order, stack_closed: true })
    setSession(updated)
    setDone(true)
  }

  async function finishVStudent(student, order) {
    const fresh = await refreshStudents()
    const stack = order.map(sid => fresh.find(s => s.id === sid)).filter(Boolean)
    await createExcludedForStudent(fresh.find(s => s.id === student.id) ?? student)
    const allMissing = await checkRouteChanges(stack)
    const curPos = order.indexOf(student.id)
    const missing = allMissing
      .filter(m => order.indexOf(m.studentId) <= curPos)
      .filter(m => !revisitedRef.current.has(`${m.qIdx}-${m.studentId}`))
    // Students later in the stack with open questions (after switching from per vraag):
    // simply continue with the next one, after any route-change catch-up below
    const nextResume = findVerticalResume(test, stack.filter(s => order.indexOf(s.id) > curPos), scoresRef.current)
    if (!missing.length && nextResume) {
      setVStudentId(nextResume.studentId)
      setVPos(nextResume.pos)
      return
    }
    if (missing.length) {
      // Go back to the missed questions (this student's first) before the next student
      const targetId = missing.some(m => m.studentId === student.id) ? student.id : missing[0].studentId
      const target = fresh.find(s => s.id === targetId)
      const targetMissing = missing.filter(m => m.studentId === targetId)
      targetMissing.forEach(m => revisitedRef.current.add(`${m.qIdx}-${m.studentId}`))
      setSkipNotice(`${target.name} heeft nog ${questionList(targetMissing.map(m => m.qIdx))} open (route gewijzigd?). ${targetMissing.length === 1 ? 'Die komt' : 'Die komen'} nu eerst.`)
      setVStudentId(targetId)
      setVPos(getApplicableQuestionIndices(test, target).indexOf(targetMissing[0].qIdx))
      return
    }
    setVStudentId(null)
    setVPos(0)
    // A stack closed earlier (e.g. per vraag before switching) gets no new students
    if (order.length >= students.length || session?.stack_closed) await closeStack(order)
  }

  async function handleVPick() {
    if (vBusy || !vSelectedStudent) return
    setVBusy(true)
    try {
      const fresh = await refreshStudents()
      const student = fresh.find(s => s.id === vSelectedStudent.id) ?? vSelectedStudent
      const newOrder = [...(session.student_order || []), student.id]
      const updated = await api.setSessionOrder(id, { student_order: newOrder })
      setSession(updated)
      setVName('')
      if (getApplicableQuestionIndices(test, student).length === 0) {
        setSkipNotice(`${student.name} heeft geen vragen voor deze route en is overgeslagen.`)
        await finishVStudent(student, newOrder)
      } else {
        setVPos(0)
        setVStudentId(student.id)
      }
    } catch {
      setError('Opslaan mislukt.')
    } finally {
      setVBusy(false)
    }
  }

  async function handleEndVStack() {
    if (!(session?.student_order?.length)) return
    await closeStack(session.student_order)
  }

  // ── Q1 handlers ──────────────────────────────────────────────────────────────
  async function handleQ1Submit() {
    if (q1Saving || !q1SelectedStudent || !test?.questions[0]) return
    const points = parseInt(q1ScoreVal, 10)
    if (isNaN(points) || points < 0 || points > test.questions[0].max_score) return

    setQ1Saving(true)

    const saved = await api.upsertScore({
      session_id: parseInt(id),
      student_id: q1SelectedStudent.id,
      question_id: test.questions[0].id,
      points,
      excluded: false,
    })
    putScore(scoreKey(test.questions[0].id, q1SelectedStudent.id), saved)

    const newOrder = [...(session.student_order || []), q1SelectedStudent.id]
    const updated = await api.setSessionOrder(id, { student_order: newOrder })
    setSession(updated)

    setQ1Saving(false)
    setQ1Name('')
    setQ1ScoreVal('')

    if (newOrder.length >= students.length) {
      await finishQ1(newOrder)
    } else {
      q1NameRef.current?.focus()
    }
  }

  async function handleQ1AddToStack() {
    if (q1Saving || !q1SelectedStudent || !test?.questions[0]) return

    setQ1Saving(true)

    const saved = await api.upsertScore({
      session_id: parseInt(id),
      student_id: q1SelectedStudent.id,
      question_id: test.questions[0].id,
      points: null,
      excluded: true,
    })
    putScore(scoreKey(test.questions[0].id, q1SelectedStudent.id), saved)

    const newOrder = [...(session.student_order || []), q1SelectedStudent.id]
    const updated = await api.setSessionOrder(id, { student_order: newOrder })
    setSession(updated)

    setQ1Saving(false)
    setQ1Name('')
    setQ1ScoreVal('')

    if (newOrder.length >= students.length) {
      await finishQ1(newOrder)
    } else {
      q1NameRef.current?.focus()
    }
  }

  async function finishQ1(newStudentOrder) {
    const ordered = newStudentOrder
      .map(sid => students.find(s => s.id === sid))
      .filter(Boolean)

    // Ensure excluded Q1 scores exist for any non-applicable students in the stack
    await createExcludedScores(test.questions[0], ordered)

    // The stack is complete: students not entered now are inhalers (also after switching modes)
    const updated = await api.setSessionOrder(id, { student_order: newStudentOrder, stack_closed: true })
    setSession(updated)

    setQ1Mode(false)

    // Coming from per leerling: part of the stack already has later questions graded
    if (hasPostQ1Scores(test, scoresRef.current)) {
      const fresh = await refreshStudents()
      const stack = getOrderedStudents(updated, fresh)
      const [rqIdx, rsIdx] = findResumePosition(test, stack, scoresRef.current)
      if (rqIdx >= test.questions.length) {
        await finishHorizontal(newStudentOrder)
      } else {
        setQIdx(rqIdx)
        setSIdx(rsIdx)
      }
      return
    }

    if (test.questions.length <= 1) {
      await finishHorizontal(newStudentOrder)
      return
    }

    let startQIdx = 1
    const skippedIndices = []

    while (startQIdx < test.questions.length) {
      const q = test.questions[startQIdx]
      const applicable = ordered.filter(s => isApplicableForQuestion(s, q))
      if (applicable.length > 0) break
      skippedIndices.push(startQIdx)
      await createExcludedScores(q, ordered)
      startQIdx++
    }

    if (skippedIndices.length > 0) {
      const routeNames = [...new Set(
        skippedIndices.flatMap(qi => test.questions[qi].routes || [])
      )].join('/')
      setSkipNotice(
        skippedIndices.length === 1
          ? `Vraag ${skippedIndices[0] + 1} overgeslagen: geen leerlingen met route ${routeNames} in de stapel.`
          : `Vragen ${skippedIndices.map(qi => qi + 1).join(', ')} overgeslagen: geen leerlingen met de betreffende routes in de stapel.`
      )
    }

    if (startQIdx >= test.questions.length) {
      await finishHorizontal(newStudentOrder)
      return
    }

    setQIdx(startQIdx)
    setSIdx(0)
  }

  async function handleEndQ1() {
    if (!(session?.student_order?.length)) return
    await finishQ1(session.student_order)
  }

  function startQ1EditItem(item) {
    setQ1EditingItemId(item.id)
    setQ1EditScoreVal(item.points !== null ? String(item.points) : '')
  }

  async function saveQ1EditItem(item) {
    if (!test?.questions[0]) return
    const q1 = test.questions[0]
    const pts = parseInt(q1EditScoreVal, 10)
    if (!isNaN(pts) && pts >= 0 && pts <= q1.max_score) {
      const saved = await api.upsertScore({
        session_id: parseInt(id),
        student_id: item.id,
        question_id: q1.id,
        points: pts,
        excluded: false,
      })
      putScore(scoreKey(q1.id, item.id), saved)
    }
    setQ1EditingItemId(null)
  }

  // ── Regular navigation ───────────────────────────────────────────────────────
  async function handlePrev() {
    await persistScore()
    if (fixQueue) {
      if (fixPos > 0) setFixPos(p => p - 1)
      return
    }
    if (isVertical) {
      if (vPos > 0) setVPos(p => p - 1)
      return
    }
    if (sIdx > 0) {
      setSIdx(s => s - 1)
    } else if (qIdx > 0) {
      let prevQIdx = qIdx - 1
      while (prevQIdx > 0) {
        const applicable = orderedStudents.filter(s => isApplicableForQuestion(s, test.questions[prevQIdx]))
        if (applicable.length > 0) break
        prevQIdx--
      }
      const prevApplicable = orderedStudents.filter(s => isApplicableForQuestion(s, test.questions[prevQIdx]))
      setQIdx(prevQIdx)
      setSIdx(Math.max(0, prevApplicable.length - 1))
    }
  }

  async function handleNext() {
    await persistScore()
    if (fixQueue) {
      if (fixPos < fixQueue.length - 1) setFixPos(p => p + 1)
      return
    }
    if (isVertical) {
      if (vPos < vQIndices.length - 1) setVPos(p => p + 1)
      return
    }
    if (sIdx < applicableStudents.length - 1) setSIdx(s => s + 1)
  }

  async function handleNextQuestion() {
    await persistScore()
    if (fixQueue) {
      setFixQueue(null)
      setDone(true)
      return
    }
    if (isVertical) {
      await finishVStudent(vStudent, session.student_order || [])
      return
    }
    const fresh = await refreshStudents()
    const orderedStudents = getOrderedStudents(session, fresh)
    await createExcludedScores(currentQuestion, orderedStudents)

    let nextQIdx = qIdx + 1
    const skippedIndices = []

    // Skip any questions whose routes exclude every student in the current stack.
    // Create excluded-score rows for those questions (same pattern as non-applicable
    // students on regular questions) and collect their indices for the notice.
    while (nextQIdx < test.questions.length) {
      const q = test.questions[nextQIdx]
      const applicable = orderedStudents.filter(s => isApplicableForQuestion(s, q))
      if (applicable.length > 0) break
      skippedIndices.push(nextQIdx)
      await createExcludedScores(q, orderedStudents)
      nextQIdx++
    }

    if (skippedIndices.length > 0) {
      const routeNames = [...new Set(
        skippedIndices.flatMap(qi => test.questions[qi].routes || [])
      )].join('/')
      setSkipNotice(
        skippedIndices.length === 1
          ? `Vraag ${skippedIndices[0] + 1} overgeslagen: geen leerlingen met route ${routeNames} in de stapel.`
          : `Vragen ${skippedIndices.map(qi => qi + 1).join(', ')} overgeslagen: geen leerlingen met de betreffende routes in de stapel.`
      )
    }

    if (nextQIdx >= test.questions.length) {
      await finishHorizontal(session.student_order || [])
      return
    }
    setQIdx(nextQIdx)
    setSIdx(0)
  }

  // ── Previous scores for sidebar ──────────────────────────────────────────────
  const prevScores = useMemo(() => {
    if (!currentStudent || !test) return []
    return test.questions.slice(0, curQIdx).map((q, i) => {
      const sc = scores[scoreKey(q.id, currentStudent.id)]
      return {
        nr: i + 1,
        domain: q.domain,
        max_score: q.max_score,
        points: sc?.excluded
          ? 'n.v.t.'
          : sc?.points !== null && sc?.points !== undefined
          ? sc.points
          : '—',
        comment: sc?.comment || '',
      }
    })
  }, [currentStudent?.id, curQIdx, scores, test])

  // ── Render ───────────────────────────────────────────────────────────────────
  // Vertical: "last" means the student's last applicable question
  const isLastStudent = fixQueue
    ? fixPos === fixQueue.length - 1
    : isVertical ? vPos === vQIndices.length - 1 : sIdx === applicableStudents.length - 1
  const isLastQuestion = fixQueue ? true : isVertical ? false : qIdx === test?.questions.length - 1

  if (!test || !session) return <div className="page"><p>Laden...</p></div>

  if (done) {
    if (test.grading_method) {
      navigate(`/sessions/${id}/review`, { replace: true })
      return null
    }
    return (
      <div className="page">
        <div className="card session-done">
          <h2>Nakijken afgerond</h2>
          <p className="text-muted" style={{ marginBottom: 20 }}>
            Alle vragen van <strong>{test.name}</strong> zijn nagekeken voor klas <strong>{session.class_name}</strong>.
          </p>
          <div className="gap-8" style={{ justifyContent: 'center' }}>
            <Link to="/sessions/new" className="btn btn-primary">Nieuwe sessie</Link>
            <Link to={`/classes/${session.class_name}/overview`} className="btn btn-secondary">Klasoverzicht bekijken</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Vertical name-pick render ────────────────────────────────────────────────
  if (isVertical && !vStudent) {
    const enteredCount = session.student_order?.length || 0
    return (
      <div className="page" style={{ maxWidth: 1040, marginLeft: 'auto', marginRight: 'auto' }}>
        {error && <div className="alert alert-error">{error}</div>}
        {skipNotice && (
          <div className="alert" style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '10px 14px', marginBottom: 12, color: '#856404' }}>
            {skipNotice}
          </div>
        )}

        <div style={{ background: '#e0e3ea', borderRadius: 6, height: 6, marginBottom: 20 }}>
          <div style={{
            background: '#1e3a5f',
            borderRadius: 6,
            height: 6,
            width: `${(vEnteredList.filter(e => e.complete).length / Math.max(students.length, 1)) * 100}%`,
            transition: 'width .3s',
          }} />
        </div>

        <div className="grade-wrap">
          <div className="grade-main">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Naam leerling
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                  ({enteredCount} van {students.length} ingevoerd)
                </span>
              </div>
              <input
                ref={vNameRef}
                type="text"
                list="v-student-list"
                value={vName}
                onChange={e => setVName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setVName('')
                  if (e.key === 'Enter') handleVPick()
                }}
                placeholder="Begin met typen om een leerling te zoeken…"
                style={{ width: '100%', fontSize: 15, padding: '9px 12px' }}
                autoComplete="off"
              />
              <datalist id="v-student-list">
                {vAvailableStudents.map(s => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>

            <div style={{ minHeight: 56, marginBottom: 28 }}>
              {vSelectedStudent && (
                <div className="grade-score-row">
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1e3a5f' }}>{vSelectedStudent.name}</span>
                  <RouteBadge route={vSelectedStudent.route} />
                  <button className="btn btn-primary" onClick={handleVPick} disabled={vBusy}>
                    {vBusy ? 'Laden…' : 'Start nakijken →'}
                  </button>
                </div>
              )}
            </div>

            {vEnteredList.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                  Ingevoerd
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {vEnteredList.map(item => (
                    <div key={item.id} style={{ padding: '4px 10px', background: '#f0f3f8', borderRadius: 6, fontSize: 13 }}>
                      {item.name}{' '}
                      <span style={{ fontWeight: 700, color: item.complete ? '#4caf50' : '#c07000' }}>
                        {item.complete ? '✓' : 'bezig'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid #e0e3ea', paddingTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="btn btn-secondary"
                onClick={handleEndVStack}
                disabled={enteredCount === 0}
                title="Stop met invoeren en rond de sessie af"
              >
                Einde van de stapel
              </button>
              <span className="text-muted" style={{ fontSize: 12 }}>
                Niet-ingevoerde leerlingen worden overgeslagen in deze sessie.
              </span>
            </div>
          </div>

          <div className="grade-sidebar">
            <div className="card" style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{test.name}</div>
              <div className="text-muted">Klas {session.class_name}</div>
              <ModeSwitch mode={session.grading_mode} onSwitch={switchMode} busy={switching} />
              <hr className="divider" />
              {test.questions.map((q, i) => (
                <div key={q.id} style={{ padding: '3px 0', color: '#aaa', fontSize: 13 }}>
                  V{i + 1} {q.domain}
                </div>
              ))}
            </div>
            {test.grading_method && test.grade_config && (
              <NormeringCard gradeConfig={test.grade_config} gradingMethod={test.grading_method} />
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Q1 type-select render ────────────────────────────────────────────────────
  if (q1Mode) {
    const q1 = test.questions[0]
    const enteredCount = session?.student_order?.length || 0
    const q1ApplicableStudents = students.filter(s => (q1.routes || []).includes(s.route))
    const q1TotalApplicable = q1ApplicableStudents.length
    const q1EnteredApplicable = (session?.student_order || []).filter(sid => {
      const s = students.find(st => st.id === sid)
      return s && (q1.routes || []).includes(s.route)
    }).length
    const q1IsApplicable = !q1SelectedStudent || isApplicableForQuestion(q1SelectedStudent, q1)
    const isRestEntry = hasPostQ1Scores(test, scores)

    return (
      <div className="page" style={{ maxWidth: 1040, marginLeft: 'auto', marginRight: 'auto' }}>
        {error && <div className="alert alert-error">{error}</div>}

        {isRestEntry && (
          <div className="alert" style={{ background: '#e8f0fc', border: '1px solid #b6cdf2', borderRadius: 6, padding: '10px 14px', marginBottom: 12, color: '#1e3a5f' }}>
            Typ eerst de overige leerlingen in, in de volgorde van je stapel. Daarna ga je per vraag verder waar je was.
          </div>
        )}

        <div style={{ background: '#e0e3ea', borderRadius: 6, height: 6, marginBottom: 20 }}>
          <div style={{
            background: '#1e3a5f',
            borderRadius: 6,
            height: 6,
            width: `${(q1EnteredApplicable / Math.max(q1TotalApplicable, 1) / test.questions.length) * 100}%`,
            transition: 'width .3s',
          }} />
        </div>

        <div className="grade-wrap">
          <div className="grade-main">
            <div className="grade-question-box">
              <div className="grade-question-label">
                Vraag 1 · {q1.domain} · {pyramidLabel(q1.pyramid_level)} · max {q1.max_score} pt
              </div>
              <div className="grade-question-desc">{q1.description}</div>
              {q1.answer && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 4 }}>Modelantwoord</div>
                  <div className="grade-answer">{q1.answer}</div>
                </div>
              )}
            </div>

            {/* Name input */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Naam leerling
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                  ({q1EnteredApplicable} van {q1TotalApplicable} ingevoerd)
                </span>
              </div>
              <input
                ref={q1NameRef}
                type="text"
                list="q1-student-list"
                value={q1Name}
                onChange={e => setQ1Name(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setQ1Name(''); setQ1ScoreVal('') }
                  if (e.key === 'Enter' && q1SelectedStudent && !q1IsApplicable) handleQ1AddToStack()
                }}
                placeholder="Begin met typen om een leerling te zoeken…"
                style={{ width: '100%', fontSize: 15, padding: '9px 12px' }}
                autoComplete="off"
              />
              <datalist id="q1-student-list">
                {q1AvailableStudents.map(s => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>

            {/* Score entry — only shown when a valid student name is matched */}
            <div style={{ minHeight: 56, marginBottom: 28 }}>
              {q1SelectedStudent && (
                <div className="grade-score-row">
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1e3a5f' }}>
                    {q1SelectedStudent.name}
                  </span>
                  <RouteBadge route={q1SelectedStudent.route} />
                  {q1IsApplicable ? (
                    <>
                      <input
                        ref={q1ScoreRef}
                        type="number"
                        className="grade-score-input"
                        min={0}
                        max={q1.max_score}
                        value={q1ScoreVal}
                        onChange={e => setQ1ScoreVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQ1Submit() }}
                      />
                      <span className="grade-score-max">/ {q1.max_score}</span>
                      <button
                        className="btn btn-primary"
                        onClick={handleQ1Submit}
                        disabled={q1Saving || q1ScoreVal === ''}
                      >
                        {q1Saving ? 'Opslaan…' : 'Opslaan →'}
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#888', fontStyle: 'italic', fontSize: 14 }}>n.v.t.</span>
                      <button
                        ref={q1AddRef}
                        className="btn btn-primary"
                        onClick={handleQ1AddToStack}
                        disabled={q1Saving}
                      >
                        {q1Saving ? 'Toevoegen…' : 'Toevoegen →'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Already-entered students */}
            {q1EnteredList.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                  Ingevoerd
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {q1EnteredList.map(item => (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', background: '#f0f3f8', borderRadius: 6, fontSize: 13,
                    }}>
                      <span>{item.name}</span>
                      {q1EditingItemId === item.id ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={test.questions[0]?.max_score}
                            value={q1EditScoreVal}
                            onChange={e => setQ1EditScoreVal(e.target.value)}
                            style={{ width: 50, fontSize: 12, padding: '1px 4px' }}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveQ1EditItem(item)
                              if (e.key === 'Escape') setQ1EditingItemId(null)
                            }}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => saveQ1EditItem(item)}
                            style={{ padding: '1px 6px', fontSize: 11 }}
                          >✓</button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setQ1EditingItemId(null)}
                            style={{ padding: '1px 6px', fontSize: 11 }}
                          >✗</button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontWeight: 700, color: item.excluded ? '#888' : '#1e3a5f' }}>
                            {item.excluded ? 'n.v.t.' : (item.points !== null ? item.points : '—')}
                          </span>
                          {!item.excluded && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => startQ1EditItem(item)}
                              style={{ padding: '1px 5px', fontSize: 11, lineHeight: 1 }}
                            >✏</button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* End-of-stack button */}
            <div style={{ borderTop: '1px solid #e0e3ea', paddingTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="btn btn-secondary"
                onClick={handleEndQ1}
                disabled={enteredCount === 0}
                title="Stop met invoeren en ga verder met de volgende vraag"
              >
                Einde van de stapel
              </button>
              <span className="text-muted" style={{ fontSize: 12 }}>
                Niet-ingevoerde leerlingen worden overgeslagen in deze sessie.
              </span>
            </div>
          </div>

          {/* Sidebar */}
          <div className="grade-sidebar">
            <div className="card" style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{test.name}</div>
              <div className="text-muted">Klas {session.class_name}</div>
              <ModeSwitch mode={session.grading_mode} onSwitch={switchMode} busy={switching} />
              <hr className="divider" />
              {test.questions.map((q, i) => (
                <div key={q.id} style={{
                  padding: '3px 0',
                  color: i === 0 ? '#1e3a5f' : '#aaa',
                  fontWeight: i === 0 ? 700 : 400,
                  fontSize: 13,
                }}>
                  {i === 0 ? '▶ ' : '  '}V{i + 1} {q.domain}
                </div>
              ))}
            </div>
            {test.grading_method && test.grade_config && (
              <NormeringCard gradeConfig={test.grade_config} gradingMethod={test.grading_method} />
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Regular grading render (Q2+) ─────────────────────────────────────────────
  if (!currentQuestion || !currentStudent) {
    return <div className="page"><p>Laden...</p></div>
  }

  return (
    <div className="page" style={{ maxWidth: 1040, marginLeft: 'auto', marginRight: 'auto' }}>
      {error && <div className="alert alert-error">{error}</div>}
      {skipNotice && (
        <div className="alert" style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '10px 14px', marginBottom: 12, color: '#856404' }}>
          {skipNotice}
        </div>
      )}

      {fixQueue && (
        <div className="alert" style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '10px 14px', marginBottom: 12, color: '#856404' }}>
          Nog {fixQueue.length === 1 ? '1 vraag' : `${fixQueue.length} vragen`} open, bijvoorbeeld omdat een route is gewijzigd. Kijk deze eerst na.
        </div>
      )}

      <div style={{ background: '#e0e3ea', borderRadius: 6, height: 6, marginBottom: 20 }}>
        <div style={{
          background: '#1e3a5f',
          borderRadius: 6,
          height: 6,
          width: fixQueue
            ? `${((fixPos + 1) / fixQueue.length) * 100}%`
            : isVertical
            ? `${(((session.student_order?.length || 1) - 1 + (vPos + 1) / Math.max(vQIndices.length, 1)) / Math.max(students.length, 1)) * 100}%`
            : `${((qIdx * applicableStudents.length + sIdx + 1) / (test.questions.length * Math.max(applicableStudents.length, 1))) * 100}%`,
          transition: 'width .3s',
        }} />
      </div>

      <div className="grade-wrap">
        <div className="grade-main">
          <div className="grade-student-name">{currentStudent.name}</div>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <RouteBadge route={currentStudent.route} />
            <span className="grade-progress">
              {fixQueue
                ? `Inhalen: ${fixPos + 1} van ${fixQueue.length} — Vraag ${curQIdx + 1}`
                : isVertical
                ? `Vraag ${curQIdx + 1} van ${test.questions.length} — Leerling ${(session.student_order || []).indexOf(currentStudent.id) + 1} van ${session.stack_closed ? (session.student_order || []).length : students.length}`
                : `Vraag ${qIdx + 1} van ${test.questions.length} — Leerling ${sIdx + 1} van ${applicableStudents.length}`}
            </span>
          </div>

          <div className="grade-question-box">
            <div className="grade-question-label">
              Vraag {curQIdx + 1} · {currentQuestion.domain} · {pyramidLabel(currentQuestion.pyramid_level)} · max {currentQuestion.max_score} pt
            </div>
            <div className="grade-question-desc">{currentQuestion.description}</div>
            {currentQuestion.answer && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 4 }}>Modelantwoord</div>
                <div className="grade-answer">{currentQuestion.answer}</div>
              </div>
            )}
          </div>

          <div className="grade-score-row" style={{ marginBottom: showComment ? 8 : 24 }}>
            <input
              ref={scoreInputRef}
              type="number"
              className="grade-score-input"
              min={0}
              max={currentQuestion.max_score}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') isLastStudent ? handleNextQuestion() : handleNext()
                if (e.key === 'ArrowRight') isLastStudent ? handleNextQuestion() : handleNext()
                if (e.key === 'ArrowLeft') handlePrev()
                if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); toggleComment() }
              }}
            />
            <span className="grade-score-max">/ {currentQuestion.max_score}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={toggleComment}
              title="Opmerking toevoegen (Ctrl+/)"
            >
              {commentVal ? '💬 opmerking' : '+ opmerking'}
            </button>
            {saving && <span className="text-muted">Opslaan...</span>}
          </div>

          {showComment && (
            <div style={{ marginBottom: 24 }}>
              <input
                ref={commentInputRef}
                type="text"
                value={commentVal}
                onChange={e => setCommentVal(e.target.value)}
                placeholder="Opmerking voor deze leerling (optioneel)…"
                style={{ width: '100%' }}
                onKeyDown={e => {
                  if (e.key === 'Enter') isLastStudent ? handleNextQuestion() : handleNext()
                  if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
                    e.preventDefault()
                    setShowComment(false)
                    scoreInputRef.current?.focus()
                  }
                }}
              />
            </div>
          )}

          <div className="grade-nav-buttons">
            <button
              className="btn btn-secondary"
              onClick={handlePrev}
              disabled={fixQueue ? fixPos === 0 : isVertical ? vPos === 0 : sIdx === 0 && qIdx === 0}
            >
              {fixQueue ? '← Vorige' : isVertical ? '← Vorige vraag' : '← Vorige leerling'}
            </button>

            {!isLastStudent && (
              <button className="btn btn-primary" onClick={handleNext}>
                {fixQueue ? 'Volgende →' : isVertical ? 'Volgende vraag →' : 'Volgende leerling →'}
              </button>
            )}

            {isVertical && isLastStudent && (
              <button className="btn btn-primary" onClick={handleNextQuestion}>
                Volgende leerling ↓
              </button>
            )}

            {!isVertical && isLastStudent && !isLastQuestion && (
              <button className="btn btn-primary" onClick={handleNextQuestion}>
                Volgende vraag ↓
              </button>
            )}

            {!isVertical && isLastStudent && isLastQuestion && (
              <button className="btn btn-primary" onClick={handleNextQuestion}>
                Afronden ✓
              </button>
            )}
          </div>
        </div>

        <div className="grade-sidebar">
          <div>
            <div className="collapsible-header" onClick={() => setShowPrev(v => !v)}>
              <span>Vorige scores {currentStudent.name}</span>
              <span>{showPrev ? '▲' : '▼'}</span>
            </div>
            {showPrev && (
              <div className="collapsible-body">
                {prevScores.length === 0 ? (
                  <p className="text-muted">Nog geen eerdere vragen.</p>
                ) : (
                  <table style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '4px 6px' }}>V#</th>
                        <th style={{ padding: '4px 6px' }}>Domein</th>
                        <th style={{ padding: '4px 6px' }}>Max</th>
                        <th style={{ padding: '4px 6px' }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prevScores.map(ps => (
                        <tr key={ps.nr}>
                          <td style={{ padding: '4px 6px' }}>{ps.nr}</td>
                          <td style={{ padding: '4px 6px' }}>{ps.domain || '—'}</td>
                          <td style={{ padding: '4px 6px' }}>{ps.max_score}</td>
                          <td style={{ padding: '4px 6px', fontWeight: 700 }}>
                            {ps.points}
                            {ps.comment && <span title={ps.comment} style={{ marginLeft: 4, fontWeight: 400 }}>💬</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div className="card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{test.name}</div>
            <div className="text-muted">Klas {session.class_name}</div>
            <ModeSwitch mode={session.grading_mode} onSwitch={switchMode} busy={switching} />
            <hr className="divider" />
            {test.questions.map((q, i) => {
              const isPast = i < curQIdx
              const isCurrent = i === curQIdx
              return (
                <div key={q.id} style={{
                  padding: '3px 0',
                  color: isPast ? '#4caf50' : isCurrent ? '#1e3a5f' : '#aaa',
                  fontWeight: isCurrent ? 700 : 400,
                  fontSize: 13,
                }}>
                  {isPast ? '✓ ' : isCurrent ? '▶ ' : '  '}V{i + 1} {q.domain}
                </div>
              )
            })}
          </div>
          {test.grading_method && test.grade_config && (
            <NormeringCard gradeConfig={test.grade_config} gradingMethod={test.grading_method} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Per vraag / per leerling switch ─────────────────────────────────────────────

function ModeSwitch({ mode, onSwitch, busy }) {
  const current = mode === 'vertical' ? 'vertical' : 'horizontal'
  const opts = [['horizontal', 'Per vraag'], ['vertical', 'Per leerling']]
  return (
    <div className="mode-switch" role="group" aria-label="Nakijkvolgorde">
      {opts.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={current === value ? 'active' : ''}
          aria-pressed={current === value}
          disabled={busy}
          onClick={() => onSwitch(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Normering sidebar card ─────────────────────────────────────────────────────

const ROUTE_ORDER = ['oranje', 'geel', 'blauw']
const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }

function NormeringCard({ gradeConfig, gradingMethod }) {
  if (gradingMethod === 'cijfer') {
    return (
      <div className="card" style={{ fontSize: 12, marginTop: 0 }}>
        <div style={{ fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
          Normering
        </div>
        Cijfer = {formatCijferFormula(gradeConfig)}
      </div>
    )
  }
  const unit = gradingMethod === 'points' ? '%' : ' LD'
  const routes = ROUTE_ORDER.filter(r => gradeConfig[r])
  return (
    <div className="card" style={{ fontSize: 12, marginTop: 0 }}>
      <div style={{ fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
        Normering
      </div>
      {routes.map(route => {
        const cfg = gradeConfig[route]
        return (
          <div key={route} style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 600, textTransform: 'capitalize', color: '#444', marginBottom: 2 }}>{route}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ padding: '1px 6px', borderRadius: 3, background: '#e8f5e9', color: GRADE_COLORS.expert, fontWeight: 600 }}>
                Expert ≥ {cfg.expert}{unit}
              </span>
              <span style={{ padding: '1px 6px', borderRadius: 3, background: '#e8f0fc', color: GRADE_COLORS.beheerst, fontWeight: 600 }}>
                Beheerst ≥ {cfg.beheerst}{unit}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
