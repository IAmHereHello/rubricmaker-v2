export function isApplicableForQuestion(student, question) {
  return (question.routes || []).includes(student.route)
}

export function getOrderedStudents(sess, studs) {
  if (sess?.student_order?.length) {
    return sess.student_order.map(sid => studs.find(s => s.id === sid)).filter(Boolean)
  }
  return [...studs].sort((a, b) => a.name.localeCompare(b.name, 'nl'))
}

export function shouldEnterQ1Mode(sess, t, scoreMap) {
  if (!t?.questions.length) return false
  const order = sess.student_order || []
  if (order.length === 0) return true
  if (t.questions.length > 1) {
    const hasPostQ1Scores = t.questions
      .slice(1)
      .some(q => Object.keys(scoreMap).some(k => k.startsWith(`${q.id}-`)))
    return !hasPostQ1Scores
  }
  const q1 = t.questions[0]
  const allScored = order.every(sid => {
    const sc = scoreMap[`${q1.id}-${sid}`]
    return sc && (sc.points !== null || sc.excluded)
  })
  return !allScored
}

export function findResumePosition(t, orderedStudents, scoreMap) {
  for (let qi = 0; qi < t.questions.length; qi++) {
    const q = t.questions[qi]
    const applicable = orderedStudents.filter(s => isApplicableForQuestion(s, q))
    for (let si = 0; si < applicable.length; si++) {
      const key = `${q.id}-${applicable[si].id}`
      const sc = scoreMap[key]
      if (!sc || (sc.points === null && !sc.excluded)) return [qi, si]
    }
  }
  return [t.questions.length, 0]
}
