"""Route (colour) per session.

A student's route is stored on the student. Sessions graded before a route change keep the
old route through a SessionStudentRoute row, so changing a route never recalculates
earlier tests."""
from typing import Dict, Iterable, Optional

from sqlalchemy.orm import Session as DBSession

from .models import OpdrachtEntry, OpdrachtScore, Score, SessionStudentRoute, StudentGrade, Student


def session_route_overrides(db: DBSession, session_id: int) -> Dict[int, str]:
    """{student_id: route} for students whose route in this session differs from their current one."""
    rows = db.query(SessionStudentRoute).filter(SessionStudentRoute.session_id == session_id).all()
    return {r.student_id: r.route for r in rows}


def effective_routes(db: DBSession, session_id: int, students: Iterable[Student]) -> Dict[int, str]:
    overrides = session_route_overrides(db, session_id)
    return {s.id: overrides.get(s.id, s.route) for s in students}


def change_student_route(db: DBSession, student: Student, new_route: str,
                         from_session_id: Optional[int] = None) -> None:
    """Set a student's route without changing sessions graded earlier.

    from_session_id: the session in which the switch is made. That session and later ones
    use the new route; earlier sessions keep theirs. Without it (Leerlingen page) every
    session in which the student already has scores, a grade or a Grote opdracht entry
    keeps its route.
    Does not commit."""
    old_route = student.route

    session_ids = {sid for (sid,) in db.query(Score.session_id).filter(Score.student_id == student.id).distinct()}
    session_ids |= {sid for (sid,) in db.query(StudentGrade.session_id).filter(StudentGrade.student_id == student.id).distinct()}
    # Grote opdrachten: handed in or graded
    session_ids |= {sid for (sid,) in db.query(OpdrachtEntry.session_id).filter(
        OpdrachtEntry.student_id == student.id, OpdrachtEntry.status != "niet_ingeleverd").distinct()}
    session_ids |= {sid for (sid,) in db.query(OpdrachtScore.session_id).filter(OpdrachtScore.student_id == student.id).distinct()}

    existing = {
        r.session_id: r
        for r in db.query(SessionStudentRoute).filter(SessionStudentRoute.student_id == student.id).all()
    }

    if from_session_id is not None:
        # This session and later ones follow the new route.
        for sid, row in existing.items():
            if sid >= from_session_id:
                db.delete(row)
        session_ids = {sid for sid in session_ids if sid < from_session_id}

    if old_route != new_route:
        for sid in session_ids:
            if sid not in existing:
                db.add(SessionStudentRoute(session_id=sid, student_id=student.id, route=old_route))

    student.route = new_route
