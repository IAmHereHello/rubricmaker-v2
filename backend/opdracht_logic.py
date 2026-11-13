"""Grote opdracht: rubric helpers, per-student results and grade syncing.

The rubric lives in Test.grade_config:
    {
      "opdracht": {"sections": [
          {"id": "s1", "name": "Diagrammen", "group": true, "criteria": [
              {"id": "c1", "name": "Staafdiagram", "routes": ["oranje", "geel", "blauw"],
               "feedback": false, "per_route": false,
               "levels": {"niet": {"text": "", "points": 0}, "voldoende": {...}, "goed": {...}},
               "route_levels": {"oranje": {"niet": {...}, ...}, ...}}
          ]}
      ]},
      "oranje": {"beheerst": 6, "expert": 10}, "geel": {...}, "blauw": {...}
    }
Thresholds are in points. A student's result only exists once every part that
applies to them is handed in and fully graded.
"""
from sqlalchemy.orm import Session as DBSession
from .route_history import effective_routes

from .models import (
    Student, StudentGrade, Session as SessionModel, Test,
    OpdrachtSessionState, OpdrachtGroup, OpdrachtGroupScore, OpdrachtEntry, OpdrachtScore,
)

LEVELS = ["niet", "voldoende", "goed"]
PARTS = ["groep", "individueel"]
ROUTES = ["oranje", "geel", "blauw"]


# ── Rubric helpers ─────────────────────────────────────────────────────────────

def sections(test):
    cfg = test.grade_config or {}
    return (cfg.get("opdracht") or {}).get("sections") or []


def part_of(section):
    return "groep" if section.get("group") else "individueel"


def all_criteria(test):
    """[(section, criterion)] in builder order."""
    return [(s, c) for s in sections(test) for c in (s.get("criteria") or [])]


def criterion_ids(test):
    return {c.get("id") for _, c in all_criteria(test)}


def parts_present(test):
    return [p for p in PARTS if any(part_of(s) == p and s.get("criteria") for s in sections(test))]


def levels_for(criterion, route):
    if criterion.get("per_route"):
        rl = (criterion.get("route_levels") or {}).get(route)
        if rl:
            return rl
    return criterion.get("levels") or {}


def level_points(criterion, route, level):
    try:
        return int((levels_for(criterion, route).get(level) or {}).get("points") or 0)
    except (TypeError, ValueError):
        return 0


def criterion_max(criterion, route):
    return max(level_points(criterion, route, lv) for lv in LEVELS)


def applies(criterion, route):
    return route in (criterion.get("routes") or [])


# ── Loading ────────────────────────────────────────────────────────────────────

class Context:
    def __init__(self, db: DBSession, session: SessionModel):
        self.db = db
        self.session = session
        self.test = db.query(Test).filter(Test.id == session.test_id).first()
        self.state = db.query(OpdrachtSessionState).filter(OpdrachtSessionState.session_id == session.id).first()
        self.groups = (
            db.query(OpdrachtGroup).filter(OpdrachtGroup.session_id == session.id)
            .order_by(OpdrachtGroup.order, OpdrachtGroup.id).all()
        )
        group_ids = [g.id for g in self.groups]
        self.group_scores = {}
        if group_ids:
            for gs in db.query(OpdrachtGroupScore).filter(OpdrachtGroupScore.group_id.in_(group_ids)).all():
                self.group_scores[(gs.group_id, gs.criterion_id)] = gs
        self.entries = {}
        for e in db.query(OpdrachtEntry).filter(OpdrachtEntry.session_id == session.id).all():
            self.entries[(e.student_id, e.part)] = e
        self.scores = {}
        for sc in db.query(OpdrachtScore).filter(OpdrachtScore.session_id == session.id).all():
            self.scores[(sc.student_id, sc.criterion_id)] = sc

        class_students = (
            db.query(Student).filter(Student.class_name == session.class_name).order_by(Student.name).all()
        )
        known = {s.id for s in class_students}
        extra_ids = {sid for (sid, _) in self.entries} - known
        extra = db.query(Student).filter(Student.id.in_(extra_ids)).all() if extra_ids else []
        self.students = class_students + sorted(extra, key=lambda s: s.name)
        # Route per student in this session: an opdracht graded before a route change keeps the old route
        self.routes = effective_routes(db, session.id, self.students)

    def route_of(self, student):
        return self.routes.get(student.id, student.route)

    @property
    def mode(self):
        return self.state.mode if self.state else None

    def part_closed(self, part):
        if not self.state:
            return False
        return bool(self.state.group_closed if part == "groep" else self.state.individual_closed)


# ── Results ────────────────────────────────────────────────────────────────────

def effective_level(ctx: Context, student_id, section, criterion):
    """{level, comment, source} for one onderdeel, or None when nothing is chosen."""
    cid = criterion.get("id")
    own = ctx.scores.get((student_id, cid))
    if part_of(section) == "groep":
        if own is not None:
            return {"level": own.level, "comment": own.comment, "source": "override"}
        entry = ctx.entries.get((student_id, "groep"))
        if entry and entry.group_id:
            gs = ctx.group_scores.get((entry.group_id, cid))
            if gs is not None and (gs.level or gs.comment):
                return {"level": gs.level, "comment": gs.comment, "source": "group"}
        return None
    if own is not None:
        return {"level": own.level, "comment": own.comment, "source": "student"}
    return None


def compute_grade(test, route, points, feedback_failed):
    cfg = (test.grade_config or {}).get(route) or {}
    b, e = cfg.get("beheerst"), cfg.get("expert")
    if b is None or e is None:
        return None
    if feedback_failed:
        return "in_ontwikkeling"
    if points >= e:
        return "expert"
    if points >= b:
        return "beheerst"
    return "in_ontwikkeling"


def student_summary(ctx: Context, student):
    route = ctx.route_of(student)
    test = ctx.test
    effective = {}
    parts = {}
    points = 0
    max_points = 0
    feedback_failed = []

    for part in PARTS:
        items = [(s, c) for s, c in all_criteria(test) if part_of(s) == part and applies(c, route)]
        if not items:
            parts[part] = {"status": "nvt"}
            continue
        entry = ctx.entries.get((student.id, part))
        graded = 0
        for s, c in items:
            eff = effective_level(ctx, student.id, s, c)
            if eff:
                effective[c["id"]] = eff
            if eff and eff.get("level") in LEVELS:
                graded += 1
        if entry is None:
            status = "none"
        elif entry.status == "niet_ingeleverd":
            status = "missing"
        else:
            status = "complete" if graded == len(items) else "open"
        parts[part] = {
            "status": status,
            "group_id": entry.group_id if entry else None,
            "graded": graded,
            "total": len(items),
            "inhaler": status in ("none", "missing") and ctx.part_closed(part),
        }
        if status in ("open", "complete"):
            for s, c in items:
                max_points += criterion_max(c, route)
                eff = effective.get(c["id"])
                if eff and eff.get("level") in LEVELS:
                    points += level_points(c, route, eff["level"])
                    if c.get("feedback") and eff["level"] == "niet":
                        feedback_failed.append(c.get("name") or "")

    relevant = [p for p in parts.values() if p["status"] != "nvt"]
    complete = bool(relevant) and all(p["status"] == "complete" for p in relevant)
    grade = compute_grade(test, route, points, bool(feedback_failed)) if complete else None
    return {
        "student_id": student.id,
        "parts": parts,
        "points": points,
        "max": max_points,
        "complete": complete,
        "grade": grade,
        "feedback_failed": feedback_failed,
        "effective": effective,
        "inhaler_parts": [p for p, v in parts.items() if v.get("inhaler")],
    }


def summaries(ctx: Context):
    return {s.id: student_summary(ctx, s) for s in ctx.students}


def sync_grades(ctx: Context, sums=None):
    """Store each complete student's result as a StudentGrade (used by progress pages)."""
    sums = sums if sums is not None else summaries(ctx)
    db = ctx.db
    existing = {
        g.student_id: g
        for g in db.query(StudentGrade).filter(StudentGrade.session_id == ctx.session.id).all()
    }
    for sid, summ in sums.items():
        g = existing.get(sid)
        if summ["grade"]:
            if g:
                g.grade = summ["grade"]
                g.is_manual = False
                g.review_done = True
            else:
                db.add(StudentGrade(session_id=ctx.session.id, student_id=sid, grade=summ["grade"],
                                    is_manual=False, review_done=True, stars=0))
        elif g:
            db.delete(g)
    db.commit()


def session_done(ctx: Context, sums):
    """All parts' stacks finished and every entered student fully graded."""
    present = parts_present(ctx.test)
    if not present or not all(ctx.part_closed(p) for p in present):
        return False
    for summ in sums.values():
        if any(v["status"] == "open" for v in summ["parts"].values()):
            return False
    return True


def payload(ctx: Context, sync=True):
    sums = summaries(ctx)
    if sync:
        sync_grades(ctx, sums)
    test = ctx.test
    session = ctx.session
    dismissed = set(session.dismissed_inhalers or [])
    groups = []
    for g in ctx.groups:
        members = sorted(
            [e for e in ctx.entries.values() if e.part == "groep" and e.group_id == g.id],
            key=lambda e: (e.order, e.id),
        )
        groups.append({
            "id": g.id,
            "order": g.order,
            "members": [e.student_id for e in members],
            "scores": {
                cid: {"level": gs.level, "comment": gs.comment}
                for (gid, cid), gs in ctx.group_scores.items() if gid == g.id
            },
        })
    return {
        "session": {
            "id": session.id,
            "class_name": session.class_name,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "test_id": session.test_id,
            "dismissed_inhalers": list(dismissed),
        },
        "test": {
            "id": test.id,
            "name": test.name,
            "grading_method": test.grading_method,
            "grade_config": test.grade_config,
        },
        "state": {
            "mode": ctx.mode,
            "group_closed": ctx.part_closed("groep"),
            "individual_closed": ctx.part_closed("individueel"),
        },
        "parts_present": parts_present(test),
        "students": [
            {"id": s.id, "name": s.name, "route": ctx.route_of(s), "class_name": s.class_name}
            for s in ctx.students
        ],
        "groups": groups,
        "entries": [
            {"student_id": e.student_id, "part": e.part, "status": e.status,
             "group_id": e.group_id, "order": e.order}
            for e in sorted(ctx.entries.values(), key=lambda e: (e.order, e.id))
        ],
        "scores": {
            f"{sid}|{cid}": {"level": sc.level, "comment": sc.comment}
            for (sid, cid), sc in ctx.scores.items()
        },
        "summaries": {str(k): v for k, v in sums.items()},
        "inhalers": [
            {"student_id": sid, "parts": v["inhaler_parts"]}
            for sid, v in sums.items() if v["inhaler_parts"] and sid not in dismissed
        ],
        "done": session_done(ctx, sums),
    }


def sync_test(db: DBSession, test):
    """After the rubric changed: drop levels of deleted onderdelen and recompute results."""
    ids = criterion_ids(test)
    for session in db.query(SessionModel).filter(SessionModel.test_id == test.id).all():
        for sc in db.query(OpdrachtScore).filter(OpdrachtScore.session_id == session.id).all():
            if sc.criterion_id not in ids:
                db.delete(sc)
        group_ids = [g.id for g in db.query(OpdrachtGroup).filter(OpdrachtGroup.session_id == session.id).all()]
        if group_ids:
            for gs in db.query(OpdrachtGroupScore).filter(OpdrachtGroupScore.group_id.in_(group_ids)).all():
                if gs.criterion_id not in ids:
                    db.delete(gs)
        db.commit()
        sync_grades(Context(db, session))


def sync_student(db: DBSession, student_id):
    """After a student's route or class changed: recompute their Grote opdracht results."""
    session_ids = {e.session_id for e in db.query(OpdrachtEntry).filter(OpdrachtEntry.student_id == student_id).all()}
    for session in db.query(SessionModel).filter(SessionModel.id.in_(session_ids)).all() if session_ids else []:
        sync_grades(Context(db, session))


def usage(db: DBSession, test):
    """Number of stored levels per onderdeel, over all sessions of this test."""
    counts = {}
    session_ids = [s.id for s in db.query(SessionModel).filter(SessionModel.test_id == test.id).all()]
    if not session_ids:
        return counts
    for sc in db.query(OpdrachtScore).filter(OpdrachtScore.session_id.in_(session_ids)).all():
        if sc.level:
            counts[sc.criterion_id] = counts.get(sc.criterion_id, 0) + 1
    group_ids = [g.id for g in db.query(OpdrachtGroup).filter(OpdrachtGroup.session_id.in_(session_ids)).all()]
    if group_ids:
        for gs in db.query(OpdrachtGroupScore).filter(OpdrachtGroupScore.group_id.in_(group_ids)).all():
            if gs.level:
                counts[gs.criterion_id] = counts.get(gs.criterion_id, 0) + 1
    return counts
