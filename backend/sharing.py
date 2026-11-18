"""Delen met collega's: rubrics as files, rubric updates, results files and comparing.

Every colleague runs their own copy of the app, so data moves between apps as files:

- A rubric file (.rubric) holds one toets or Grote opdracht. A test gets a "family id"
  (Test.share_id) the first time it is exported, and each vraag a stable key
  (Question.share_key). Copies imported elsewhere keep both, so the apps know which
  tests and vragen belong together, even after edits.
- Importing a rubric whose family is already present is an update: the teacher sees
  per vraag (or onderdeel) what is new, changed or not in the file, ticks what to accept,
  and sees which students' results change before anything is saved.
- A results file (.resultaten) holds the rubric plus anonymous results (klas, route,
  scores; no names) of fully graded students. The Vergelijken page imports these and
  compares them with the teacher's own results.
"""
import copy
import json
import math
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session as DBSession

from . import opdracht_logic
from .models import (
    AppSetting, ComparisonImport, OpdrachtGroup, OpdrachtGroupScore, OpdrachtScore,
    Question, Score, Session as SessionModel, Student, StudentGrade, Test,
)
from .route_history import effective_routes

RUBRIC_FORMAT = "rubricmaker-rubric"
RESULTS_FORMAT = "rubricmaker-resultaten"
FILE_VERSION = 1

ROUTES = ["oranje", "geel", "blauw"]
PYRAMID = ["reproductie", "verbinding", "reflectie"]
QUESTION_FIELDS = [
    "description", "answer", "max_score", "routes", "domain",
    "pyramid_level", "learning_goal", "learning_goal_threshold",
]
FIELD_LABELS = {
    "description": "omschrijving",
    "answer": "antwoord",
    "max_score": "maximumscore",
    "routes": "routes",
    "domain": "domein",
    "pyramid_level": "pyramidelaag",
    "learning_goal": "leerdoel",
    "learning_goal_threshold": "drempel leerdoel",
}
# Fields that must be equal for a vraag to be compared between colleagues
COMPARE_FIELDS = ["max_score", "pyramid_level", "domain", "learning_goal"]


class SharingError(ValueError):
    """Message is shown to the teacher as is (Dutch)."""


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id():
    return uuid.uuid4().hex


# ── Settings ───────────────────────────────────────────────────────────────────

def get_setting(db: DBSession, key, default=None):
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row and row.value is not None else default


def set_setting(db: DBSession, key, value):
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


def installation_id(db: DBSession):
    value = get_setting(db, "installation_id")
    if not value:
        value = new_id()
        set_setting(db, "installation_id", value)
    return value


def teacher_name(db: DBSession):
    return get_setting(db, "teacher_name", "") or ""


# ── Rubric files ───────────────────────────────────────────────────────────────

def is_opdracht(method):
    return method == "opdracht"


def ensure_share_ids(db: DBSession, test: Test):
    changed = False
    if not test.share_id:
        test.share_id = new_id()
        changed = True
    for q in test.questions:
        if not q.share_key:
            q.share_key = new_id()
            changed = True
    if changed:
        db.commit()
        db.refresh(test)


def _question_dict(q):
    return {
        "share_key": q.share_key,
        "description": q.description or "",
        "answer": q.answer or "",
        "max_score": q.max_score,
        "routes": list(q.routes or []),
        "domain": q.domain or "",
        "pyramid_level": q.pyramid_level,
        "learning_goal": q.learning_goal or None,
        "learning_goal_threshold": q.learning_goal_threshold,
    }


def rubric_dict(test: Test):
    return {
        "share_id": test.share_id,
        "name": test.name,
        "grading_method": test.grading_method,
        "grade_config": copy.deepcopy(test.grade_config),
        "questions": [_question_dict(q) for q in sorted(test.questions, key=lambda q: (q.order, q.id))],
    }


def rubric_file(db: DBSession, test: Test):
    ensure_share_ids(db, test)
    return {
        "format": RUBRIC_FORMAT,
        "version": FILE_VERSION,
        "exported_at": _now(),
        "rubric": rubric_dict(test),
    }


def _check_format(data, expected):
    if not isinstance(data, dict):
        raise SharingError("Dit bestand kan niet gelezen worden.")
    fmt = data.get("format")
    if fmt != expected:
        if fmt == RUBRIC_FORMAT:
            raise SharingError("Dit is een rubricbestand. Importeer het bij Toetsen.")
        if fmt == RESULTS_FORMAT:
            raise SharingError("Dit is een resultatenbestand. Importeer het bij Vergelijken.")
        raise SharingError("Dit is geen bestand van Rubricmaker.")
    try:
        version = int(data.get("version") or 0)
    except (TypeError, ValueError):
        version = 0
    if version > FILE_VERSION:
        raise SharingError(
            "Dit bestand is gemaakt met een nieuwere versie van Rubricmaker. "
            "Start de app opnieuw om bij te werken en probeer het dan nog eens."
        )


def validate_rubric(rubric):
    if not isinstance(rubric, dict) or not rubric.get("share_id") or not isinstance(rubric.get("name"), str):
        raise SharingError("Het rubricbestand is onvolledig.")
    questions = rubric.get("questions")
    if not isinstance(questions, list):
        raise SharingError("Het rubricbestand is onvolledig.")
    keys = set()
    for q in questions:
        if not isinstance(q, dict) or not q.get("share_key"):
            raise SharingError("Het rubricbestand is onvolledig.")
        if q["share_key"] in keys:
            raise SharingError("Het rubricbestand bevat dubbele vragen.")
        keys.add(q["share_key"])
        try:
            q["max_score"] = int(q.get("max_score"))
        except (TypeError, ValueError):
            raise SharingError("Het rubricbestand bevat een vraag zonder geldige maximumscore.")
        if q.get("pyramid_level") not in PYRAMID:
            q["pyramid_level"] = q.get("pyramid_level") or "reproductie"
        q["routes"] = [r for r in (q.get("routes") or []) if r in ROUTES]
    if rubric.get("grade_config") is not None and not isinstance(rubric["grade_config"], dict):
        raise SharingError("Het rubricbestand bevat een ongeldige normering.")
    return rubric


def read_rubric_file(data):
    _check_format(data, RUBRIC_FORMAT)
    return validate_rubric(copy.deepcopy(data.get("rubric")))


def find_family(db: DBSession, share_id):
    return db.query(Test).filter(Test.share_id == share_id).order_by(Test.id).first()


def _new_question(test_id, rq, order):
    return Question(
        test_id=test_id,
        order=order,
        share_key=rq["share_key"],
        description=rq.get("description") or "",
        answer=rq.get("answer") or "",
        max_score=rq["max_score"],
        routes=list(rq.get("routes") or []),
        domain=rq.get("domain") or "",
        pyramid_level=rq.get("pyramid_level") or "reproductie",
        learning_goal=rq.get("learning_goal") or None,
        learning_goal_threshold=rq.get("learning_goal_threshold"),
    )


def import_new(db: DBSession, rubric):
    if find_family(db, rubric["share_id"]):
        raise SharingError("Deze rubric staat al in je Toetsen. Importeer het bestand als update.")
    test = Test(
        name=rubric["name"],
        grading_method=rubric.get("grading_method"),
        grade_config=copy.deepcopy(rubric.get("grade_config")),
        share_id=rubric["share_id"],
    )
    db.add(test)
    db.flush()
    for i, rq in enumerate(rubric["questions"]):
        db.add(_new_question(test.id, rq, i))
    db.commit()
    return test


def rubric_summary(rubric):
    method = rubric.get("grading_method")
    out = {"name": rubric.get("name"), "grading_method": method, "question_count": len(rubric.get("questions") or [])}
    if is_opdracht(method):
        crits = [c for s in ((rubric.get("grade_config") or {}).get("opdracht") or {}).get("sections") or []
                 for c in (s.get("criteria") or [])]
        out["criterion_count"] = len(crits)
    return out


# ── Grades for normal toetsen (mirror of computeGrade in gradingLogic.js) ──────

def _js_round1(value):
    return math.floor(value * 10 + 0.5) / 10


def calc_cijfer(scored, max_pts, grade_config, stars=0):
    if not max_pts:
        return None
    c = (grade_config or {}).get("cijfer") or {}
    try:
        multiplier = float(c["multiplier"]) if c.get("multiplier") is not None else 9.0
    except (TypeError, ValueError):
        multiplier = 9.0
    try:
        offset = float(c["offset"]) if c.get("offset") is not None else 1.0
    except (TypeError, ValueError):
        offset = 1.0
    value = max(1.0, scored / max_pts * multiplier + offset - 0.5 * (stars or 0))
    return f"{_js_round1(value):.1f}"


def compute_grade(route, questions, scores, method, grade_config, stars=0):
    """questions: dicts with id-like key 'key'; scores: {key: {'points', 'excluded'}}."""
    if not method or not grade_config:
        return None
    applicable = [q for q in questions if route in (q["routes"] or [])]

    def counted(q):
        sc = scores.get(q["key"])
        return sc is not None and not sc.get("excluded") and sc.get("points") is not None

    if method in ("cijfer", "points"):
        scored = sum(scores[q["key"]]["points"] for q in applicable if counted(q))
        max_pts = sum(q["max_score"] for q in applicable if counted(q))
        if method == "cijfer":
            return calc_cijfer(scored, max_pts, grade_config, stars)
        cfg = grade_config.get(route)
        if not cfg or not max_pts:
            return None
        pct = scored / max_pts * 100
        if pct >= cfg.get("expert", 1e9):
            return "expert"
        if pct >= cfg.get("beheerst", 1e9):
            return "beheerst"
        return "in_ontwikkeling"

    if method == "goals":
        cfg = grade_config.get(route)
        if not cfg:
            return None
        goals = {}
        for q in applicable:
            if not q.get("learning_goal") or q.get("learning_goal_threshold") is None:
                continue
            goals.setdefault(q["learning_goal"], []).append(q)
        achieved = 0
        for qs in goals.values():
            if all(counted(q) and scores[q["key"]]["points"] >= q["learning_goal_threshold"] for q in qs):
                achieved += 1
        if achieved >= cfg.get("expert", 1e9):
            return "expert"
        if achieved >= cfg.get("beheerst", 1e9):
            return "beheerst"
        return "in_ontwikkeling"
    return None


def _session_students(db: DBSession, session):
    order = session.student_order or []
    if order:
        by_id = {s.id: s for s in db.query(Student).filter(Student.id.in_(order)).all()}
        return [by_id[sid] for sid in order if sid in by_id]
    return db.query(Student).filter(Student.class_name == session.class_name).order_by(Student.name).all()


def _local_questions(db: DBSession, test_id):
    qs = db.query(Question).filter(Question.test_id == test_id).order_by(Question.order, Question.id).all()
    return [{
        "key": q.id, "max_score": q.max_score, "routes": q.routes or [],
        "learning_goal": q.learning_goal, "learning_goal_threshold": q.learning_goal_threshold,
    } for q in qs]


def _auto_grades(db: DBSession, test: Test):
    """{(session_id, student_id): auto grade} for every student with a stored result."""
    questions = _local_questions(db, test.id)
    out = {}
    for session in db.query(SessionModel).filter(SessionModel.test_id == test.id).all():
        grades = db.query(StudentGrade).filter(StudentGrade.session_id == session.id).all()
        if not grades:
            continue
        students = db.query(Student).filter(Student.id.in_([g.student_id for g in grades])).all()
        routes = effective_routes(db, session.id, students)
        scores = {}
        for sc in db.query(Score).filter(Score.session_id == session.id).all():
            scores.setdefault(sc.student_id, {})[sc.question_id] = {"points": sc.points, "excluded": sc.excluded}
        for g in grades:
            route = routes.get(g.student_id)
            if route is None:
                continue
            out[(session.id, g.student_id)] = compute_grade(
                route, questions, scores.get(g.student_id, {}),
                test.grading_method, test.grade_config, g.stars or 0,
            )
    return out


# ── Updates ────────────────────────────────────────────────────────────────────

def _norm(value):
    if value == "":
        return None
    if isinstance(value, list):
        return sorted(value)
    return value


def _normering_of(method, config):
    """The part of a test's settings that decides results (thresholds, cijfer formula)."""
    if is_opdracht(method):
        return {"method": method, "config": {r: (config or {}).get(r) for r in ROUTES}}
    return {"method": method, "config": config or None}


def _same(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def _criteria(sections):
    """{criterion id: (section, criterion, index)} in rubric order."""
    out = {}
    i = 0
    for s in sections or []:
        for c in s.get("criteria") or []:
            out[c.get("id")] = (s, c, i)
            i += 1
    return out


def _sections_of(config):
    return copy.deepcopy(((config or {}).get("opdracht") or {}).get("sections") or [])


def _structure_of(sections):
    return [{"id": s.get("id"), "name": s.get("name"), "group": bool(s.get("group"))} for s in sections]


def diff_rubric(db: DBSession, test: Test, rubric):
    """Everything that differs between the local test and the file, as tickable items."""
    if is_opdracht(test.grading_method) != is_opdracht(rubric.get("grading_method")):
        raise SharingError("Dit bestand is een ander soort toets dan je eigen versie en kan niet als update worden gebruikt.")
    items = []
    if (test.name or "") != (rubric.get("name") or ""):
        items.append({"id": "name", "kind": "name", "old": test.name, "new": rubric.get("name"), "default": False})
    if not _same(_normering_of(test.grading_method, test.grade_config),
                 _normering_of(rubric.get("grading_method"), rubric.get("grade_config"))):
        items.append({
            "id": "normering", "kind": "normering", "default": True,
            "old": _normering_of(test.grading_method, test.grade_config),
            "new": _normering_of(rubric.get("grading_method"), rubric.get("grade_config")),
        })

    if is_opdracht(test.grading_method):
        local_sections = _sections_of(test.grade_config)
        remote_sections = _sections_of(rubric.get("grade_config"))
        if _structure_of(local_sections) != _structure_of(remote_sections):
            items.append({
                "id": "structure", "kind": "structure", "default": True,
                "old": _structure_of(local_sections), "new": _structure_of(remote_sections),
            })
        local = _criteria(local_sections)
        remote = _criteria(remote_sections)
        usage = opdracht_logic.usage(db, test)
        for cid, (s, c, _) in remote.items():
            if cid not in local:
                items.append({"id": f"c:{cid}", "kind": "new", "key": cid, "label": c.get("name") or "(naamloos)",
                              "section": s.get("name"), "default": True})
            else:
                ls, lc, _ = local[cid]
                fields = []
                if not _same(lc, c):
                    fields.append("onderdeel")
                if ls.get("id") != s.get("id"):
                    fields.append("sectie")
                if fields:
                    items.append({"id": f"c:{cid}", "kind": "changed", "key": cid, "label": c.get("name") or "(naamloos)",
                                  "section": s.get("name"), "fields": fields, "old": lc, "new": c,
                                  "default": True, "score_count": usage.get(cid, 0)})
        for cid, (s, c, _) in local.items():
            if cid not in remote:
                items.append({"id": f"c:{cid}", "kind": "removed", "key": cid, "label": c.get("name") or "(naamloos)",
                              "section": s.get("name"), "default": False, "score_count": usage.get(cid, 0)})
        return items

    local_qs = sorted(test.questions, key=lambda q: (q.order, q.id))
    local = {q.share_key: q for q in local_qs if q.share_key}
    remote_index = {rq["share_key"]: i for i, rq in enumerate(rubric["questions"])}
    for i, rq in enumerate(rubric["questions"]):
        lq = local.get(rq["share_key"])
        if lq is None:
            items.append({"id": f"q:{rq['share_key']}", "kind": "new", "key": rq["share_key"],
                          "label": f"Vraag {i + 1}", "description": rq.get("description") or "",
                          "max_score": rq["max_score"], "default": True})
            continue
        ld = _question_dict(lq)
        changes = [
            {"field": f, "label": FIELD_LABELS[f], "old": ld.get(f), "new": rq.get(f)}
            for f in QUESTION_FIELDS if _norm(ld.get(f)) != _norm(rq.get(f))
        ]
        if changes:
            items.append({"id": f"q:{rq['share_key']}", "kind": "changed", "key": rq["share_key"],
                          "label": f"Vraag {i + 1}", "description": rq.get("description") or "",
                          "changes": changes, "default": True,
                          "score_count": db.query(Score).filter(Score.question_id == lq.id, Score.points.isnot(None)).count()})
    for i, lq in enumerate(local_qs):
        if lq.share_key and lq.share_key not in remote_index:
            items.append({"id": f"q:{lq.share_key}", "kind": "removed", "key": lq.share_key,
                          "label": f"Jouw vraag {i + 1}", "description": lq.description or "",
                          "max_score": lq.max_score, "default": False,
                          "score_count": db.query(Score).filter(Score.question_id == lq.id, Score.points.isnot(None)).count()})
    return items


def default_accept(items):
    return {"items": {it["id"]: bool(it["default"]) for it in items}, "moves": {}}


def _accepted(accept, item_id, items_by_id):
    value = (accept.get("items") or {}).get(item_id)
    if value is None:
        it = items_by_id.get(item_id)
        return bool(it and it["default"])
    return bool(value)


def move_targets(test: Test, rubric, items, accept):
    """Vragen/onderdelen that exist after the update and can receive moved scores."""
    by_id = {it["id"]: it for it in items}
    if is_opdracht(test.grading_method):
        local = _criteria(_sections_of(test.grade_config))
        out = []
        for cid, (s, c, _) in _criteria(_sections_of(rubric.get("grade_config"))).items():
            if cid in local or _accepted(accept, f"c:{cid}", by_id):
                out.append({"key": cid, "label": c.get("name") or "(naamloos)"})
        return out
    local = {q.share_key for q in test.questions if q.share_key}
    out = []
    for i, rq in enumerate(rubric["questions"]):
        if rq["share_key"] in local or _accepted(accept, f"q:{rq['share_key']}", by_id):
            out.append({"key": rq["share_key"], "label": f"Vraag {i + 1}", "description": rq.get("description") or "",
                        "max_score": rq["max_score"]})
    return out


def _apply_questions(db: DBSession, test: Test, rubric, items, accept, effects):
    by_id = {it["id"]: it for it in items}
    local_qs = sorted(test.questions, key=lambda q: (q.order, q.id))
    local = {q.share_key: q for q in local_qs if q.share_key}
    remote = {rq["share_key"]: rq for rq in rubric["questions"]}

    # New and changed vragen
    for rq in rubric["questions"]:
        key = rq["share_key"]
        if not _accepted(accept, f"q:{key}", by_id):
            continue
        lq = local.get(key)
        if lq is None:
            nq = _new_question(test.id, rq, 0)
            db.add(nq)
            local[key] = nq
        elif f"q:{key}" in by_id:
            lq.description = rq.get("description") or ""
            lq.answer = rq.get("answer") or ""
            lq.max_score = rq["max_score"]
            lq.routes = list(rq.get("routes") or [])
            lq.domain = rq.get("domain") or ""
            lq.pyramid_level = rq.get("pyramid_level") or "reproductie"
            lq.learning_goal = rq.get("learning_goal") or None
            lq.learning_goal_threshold = rq.get("learning_goal_threshold")
            # Lower maximumscore: scores above it are capped and the student marked "te controleren"
            for sc in db.query(Score).filter(Score.question_id == lq.id, Score.points > lq.max_score).all():
                sc.points = lq.max_score
                effects["capped"].add((sc.session_id, sc.student_id))
    db.flush()

    # Removed vragen: move scores first if asked, then delete
    removed = [q for q in local_qs if q.share_key and q.share_key not in remote
               and _accepted(accept, f"q:{q.share_key}", by_id)]
    moves = accept.get("moves") or {}
    for q in removed:
        target_key = moves.get(f"q:{q.share_key}")
        target = local.get(target_key) if target_key else None
        if target is not None and target.share_key in remote and target is not q:
            existing = {(s.session_id, s.student_id): s for s in db.query(Score).filter(Score.question_id == target.id).all()}
            for sc in db.query(Score).filter(Score.question_id == q.id).all():
                if sc.points is None and not sc.excluded:
                    continue
                tgt = existing.get((sc.session_id, sc.student_id))
                if tgt is not None and (tgt.points is not None or tgt.excluded):
                    continue  # the target vraag already has a score for this student
                points = sc.points
                if points is not None and points > target.max_score:
                    points = target.max_score
                    effects["capped"].add((sc.session_id, sc.student_id))
                if tgt is None:
                    db.add(Score(session_id=sc.session_id, student_id=sc.student_id, question_id=target.id,
                                 points=points, excluded=sc.excluded, comment=sc.comment))
                else:
                    tgt.points, tgt.excluded, tgt.comment = points, sc.excluded, sc.comment
                effects["moved"] += 1
        effects["deleted_scores"] += db.query(Score).filter(Score.question_id == q.id, Score.points.isnot(None)).count()
        for sc in db.query(Score).filter(Score.question_id == q.id).all():
            db.delete(sc)
        db.delete(q)
        local.pop(q.share_key, None)
    db.flush()

    # Order: the file's order; vragen that stay only here keep their place after the vraag before them
    kept = [q for q in local_qs if q not in removed]
    ordered = [local[rq["share_key"]] for rq in rubric["questions"] if rq["share_key"] in local]
    in_ordered = {id(q) for q in ordered}
    for idx, q in enumerate(kept):
        if id(q) in in_ordered:
            continue
        prev = next((p for p in reversed(kept[:idx]) if id(p) in in_ordered), None)
        pos = ordered.index(prev) + 1 if prev is not None else 0
        ordered.insert(pos, q)
        in_ordered.add(id(q))
    for i, q in enumerate(ordered):
        q.order = i
    db.flush()


def _apply_opdracht(db: DBSession, test: Test, rubric, items, accept, effects):
    by_id = {it["id"]: it for it in items}
    local_sections = _sections_of(test.grade_config)
    remote_sections = _sections_of(rubric.get("grade_config"))
    local = _criteria(local_sections)
    remote = _criteria(remote_sections)
    take_structure = _accepted(accept, "structure", by_id) if "structure" in by_id else True
    local_meta = {s.get("id"): s for s in local_sections}

    result = []
    placed = set()
    for rs in remote_sections:
        meta = rs if take_structure or rs.get("id") not in local_meta else local_meta[rs.get("id")]
        section = {k: copy.deepcopy(v) for k, v in meta.items() if k != "criteria"}
        section["criteria"] = []
        for rc in rs.get("criteria") or []:
            cid = rc.get("id")
            item_id = f"c:{cid}"
            if cid in local and (item_id not in by_id or not _accepted(accept, item_id, by_id)):
                section["criteria"].append(copy.deepcopy(local[cid][1]))
                placed.add(cid)
            elif cid in local or _accepted(accept, item_id, by_id):
                section["criteria"].append(copy.deepcopy(rc))
                placed.add(cid)
        result.append(section)

    removed = []
    for cid, (ls, lc, _) in local.items():
        if cid in remote:
            continue
        if _accepted(accept, f"c:{cid}", by_id):
            removed.append(cid)
            continue
        target = next((s for s in result if s.get("id") == ls.get("id")), None)
        if target is None:
            target = {k: copy.deepcopy(v) for k, v in ls.items() if k != "criteria"}
            target["criteria"] = []
            result.append(target)
        target["criteria"].append(copy.deepcopy(lc))

    config = copy.deepcopy(test.grade_config or {})
    config.setdefault("opdracht", {})
    config["opdracht"] = dict(config["opdracht"], sections=result)
    if _accepted(accept, "normering", by_id) and "normering" in by_id:
        remote_cfg = rubric.get("grade_config") or {}
        for r in ROUTES:
            if r in remote_cfg:
                config[r] = copy.deepcopy(remote_cfg[r])
            else:
                config.pop(r, None)
    test.grade_config = config

    # Move levels of removed onderdelen to another onderdeel where asked
    moves = accept.get("moves") or {}
    remaining = {c.get("id") for s in result for c in s.get("criteria") or []}
    session_ids = [s.id for s in db.query(SessionModel).filter(SessionModel.test_id == test.id).all()]
    group_ids = [g.id for g in db.query(OpdrachtGroup).filter(OpdrachtGroup.session_id.in_(session_ids)).all()] if session_ids else []
    for cid in removed:
        target = moves.get(f"c:{cid}")
        if target and target in remaining and target != cid and session_ids:
            have = {(s.session_id, s.student_id) for s in db.query(OpdrachtScore).filter(
                OpdrachtScore.session_id.in_(session_ids), OpdrachtScore.criterion_id == target).all()}
            for sc in db.query(OpdrachtScore).filter(OpdrachtScore.session_id.in_(session_ids), OpdrachtScore.criterion_id == cid).all():
                if (sc.session_id, sc.student_id) in have:
                    continue
                db.add(OpdrachtScore(session_id=sc.session_id, student_id=sc.student_id, criterion_id=target,
                                     level=sc.level, comment=sc.comment))
                effects["moved"] += 1
            if group_ids:
                have_g = {g.group_id for g in db.query(OpdrachtGroupScore).filter(
                    OpdrachtGroupScore.group_id.in_(group_ids), OpdrachtGroupScore.criterion_id == target).all()}
                for gs in db.query(OpdrachtGroupScore).filter(OpdrachtGroupScore.group_id.in_(group_ids), OpdrachtGroupScore.criterion_id == cid).all():
                    if gs.group_id in have_g:
                        continue
                    db.add(OpdrachtGroupScore(group_id=gs.group_id, criterion_id=target, level=gs.level, comment=gs.comment))
                    effects["moved"] += 1
        if session_ids:
            for sc in db.query(OpdrachtScore).filter(OpdrachtScore.session_id.in_(session_ids), OpdrachtScore.criterion_id == cid).all():
                if sc.level:
                    effects["deleted_scores"] += 1
                db.delete(sc)
        if group_ids:
            for gs in db.query(OpdrachtGroupScore).filter(OpdrachtGroupScore.group_id.in_(group_ids), OpdrachtGroupScore.criterion_id == cid).all():
                if gs.level:
                    effects["deleted_scores"] += 1
                db.delete(gs)
    db.flush()


def _opdracht_grades(db: DBSession, test: Test):
    out = {}
    for session in db.query(SessionModel).filter(SessionModel.test_id == test.id).all():
        ctx = opdracht_logic.Context(db, session)
        for sid, summ in opdracht_logic.summaries(ctx).items():
            out[(session.id, sid)] = summ["grade"]
    return out


def run_update(db: DBSession, test: Test, rubric, accept, commit):
    """Apply the accepted changes. With commit=False everything is rolled back afterwards
    (preview). Returns the per-student result changes and counts."""
    items = diff_rubric(db, test, rubric)
    accept = accept or default_accept(items)
    by_id = {it["id"]: it for it in items}
    effects = {"capped": set(), "moved": 0, "deleted_scores": 0}
    opdracht = is_opdracht(test.grading_method)
    test_id = test.id

    stored = {}
    for session in db.query(SessionModel).filter(SessionModel.test_id == test_id).all():
        for g in db.query(StudentGrade).filter(StudentGrade.session_id == session.id).all():
            stored[(session.id, g.student_id)] = g
    before_auto = _opdracht_grades(db, test) if opdracht else _auto_grades(db, test)

    if "name" in by_id and _accepted(accept, "name", by_id):
        test.name = rubric.get("name") or test.name
    if opdracht:
        _apply_opdracht(db, test, rubric, items, accept, effects)
    else:
        if "normering" in by_id and _accepted(accept, "normering", by_id):
            test.grading_method = rubric.get("grading_method")
            test.grade_config = copy.deepcopy(rubric.get("grade_config"))
        _apply_questions(db, test, rubric, items, accept, effects)
    db.flush()
    db.expire(test, ["questions"])

    after_auto = _opdracht_grades(db, test) if opdracht else _auto_grades(db, test)

    sessions = {s.id: s for s in db.query(SessionModel).filter(SessionModel.test_id == test_id).all()}
    names = {s.id: s.name for s in db.query(Student).filter(
        Student.id.in_({sid for (_, sid) in set(stored) | set(after_auto)})).all()} if (stored or after_auto) else {}
    changes = []
    keys = set(stored) | (set(after_auto) if opdracht else set())
    for key in sorted(keys, key=lambda k: (k[0], names.get(k[1], ""))):
        g = stored.get(key)
        old = g.grade if g else None
        manual = bool(g and g.is_manual)
        capped = key in effects["capped"]
        if manual:
            changed = before_auto.get(key) != after_auto.get(key) or capped
            new = old
        else:
            new = after_auto.get(key)
            if new is None and not opdracht:
                new = old  # no grading configured anymore: keep what was stored
            changed = new != old or capped
        if not changed:
            continue
        sess = sessions.get(key[0])
        changes.append({
            "session_id": key[0],
            "student_id": key[1],
            "class_name": sess.class_name if sess else "",
            "student_name": names.get(key[1], ""),
            "old": old,
            "new": new,
            "manual": manual,
            "auto_new": after_auto.get(key),
            "capped": capped,
        })

    if not commit:
        db.rollback()
        return {"changes": changes, "moved": effects["moved"], "deleted_scores": effects["deleted_scores"]}

    db.commit()
    if opdracht:
        for session in sessions.values():
            opdracht_logic.sync_grades(opdracht_logic.Context(db, session))
    for ch in changes:
        g = db.query(StudentGrade).filter(StudentGrade.session_id == ch["session_id"],
                                          StudentGrade.student_id == ch["student_id"]).first()
        if g is None:
            continue
        if not ch["manual"] and ch["new"] is not None:
            g.grade = ch["new"]
        g.needs_check = True
    db.commit()
    return {"changes": changes, "moved": effects["moved"], "deleted_scores": effects["deleted_scores"]}


# ── Results files ──────────────────────────────────────────────────────────────

def _class_labels(sessions):
    counts = {}
    labels = {}
    for s in sessions:
        counts[s.class_name] = counts.get(s.class_name, 0) + 1
        n = counts[s.class_name]
        labels[s.id] = s.class_name if n == 1 else f"{s.class_name} ({n})"
    return labels


def results_data(db: DBSession, test: Test, shuffle=True):
    """Anonymous results of fully graded students, per klas (session)."""
    sessions = db.query(SessionModel).filter(SessionModel.test_id == test.id).order_by(SessionModel.created_at, SessionModel.id).all()
    labels = _class_labels(sessions)
    questions = sorted(test.questions, key=lambda q: (q.order, q.id))
    classes = []
    for session in sessions:
        rows = []
        if is_opdracht(test.grading_method):
            ctx = opdracht_logic.Context(db, session)
            sums = opdracht_logic.summaries(ctx)
            relevant = [s for s in ctx.students
                        if any(p["status"] != "nvt" for p in sums[s.id]["parts"].values())]
            for s in relevant:
                summ = sums[s.id]
                if not summ["complete"]:
                    continue
                rows.append({
                    "route": ctx.route_of(s),
                    "levels": {cid: eff.get("level") for cid, eff in summ["effective"].items() if eff.get("level")},
                    "points": summ["points"],
                    "max": summ["max"],
                    "grade": summ["grade"],
                })
            total = len(relevant)
        else:
            students = _session_students(db, session)
            routes = effective_routes(db, session.id, students)
            scores = {}
            for sc in db.query(Score).filter(Score.session_id == session.id).all():
                scores.setdefault(sc.student_id, {})[sc.question_id] = sc
            grades = {g.student_id: g for g in db.query(StudentGrade).filter(StudentGrade.session_id == session.id).all()}
            qdicts = [{"key": q.id, "max_score": q.max_score, "routes": q.routes or [],
                       "learning_goal": q.learning_goal, "learning_goal_threshold": q.learning_goal_threshold}
                      for q in questions]
            for s in students:
                route = routes[s.id]
                applicable = [q for q in questions if route in (q.routes or [])]
                own = scores.get(s.id, {})
                complete = bool(applicable) and all(
                    own.get(q.id) is not None and (own[q.id].points is not None or own[q.id].excluded)
                    for q in applicable
                ) and any(own.get(q.id) is not None and own[q.id].points is not None and not own[q.id].excluded
                          for q in applicable)
                if not complete:
                    continue
                g = grades.get(s.id)
                grade = g.grade if g else compute_grade(
                    route, qdicts,
                    {qid: {"points": sc.points, "excluded": sc.excluded} for qid, sc in own.items()},
                    test.grading_method, test.grade_config, 0,
                )
                rows.append({
                    "route": route,
                    "scores": {
                        q.share_key: (None if own[q.id].excluded else own[q.id].points)
                        for q in applicable
                    },
                    "grade": grade,
                })
            total = len(students)
        if shuffle:
            random.shuffle(rows)
        classes.append({
            "label": labels[session.id],
            "class_name": session.class_name,
            "date": session.created_at.date().isoformat() if session.created_at else None,
            "total": total,
            "graded": len(rows),
            "students": rows,
        })
    return classes


def results_file(db: DBSession, test: Test):
    ensure_share_ids(db, test)
    return {
        "format": RESULTS_FORMAT,
        "version": FILE_VERSION,
        "exported_at": _now(),
        "teacher": {"name": teacher_name(db), "installation_id": installation_id(db)},
        "rubric": rubric_dict(test),
        "classes": results_data(db, test),
    }


def import_results(db: DBSession, data):
    _check_format(data, RESULTS_FORMAT)
    rubric = validate_rubric(copy.deepcopy(data.get("rubric")))
    teacher = data.get("teacher") or {}
    inst = teacher.get("installation_id")
    if not inst or not isinstance(data.get("classes"), list):
        raise SharingError("Het resultatenbestand is onvolledig.")
    if inst == installation_id(db):
        raise SharingError("Dit is je eigen resultatenbestand. Je eigen resultaten staan al automatisch in de vergelijking.")
    clean = {"rubric": rubric, "classes": data["classes"], "teacher": teacher, "exported_at": data.get("exported_at")}
    row = db.query(ComparisonImport).filter(ComparisonImport.share_id == rubric["share_id"],
                                            ComparisonImport.installation_id == inst).first()
    replaced = row is not None
    if row is None:
        row = ComparisonImport(share_id=rubric["share_id"], installation_id=inst)
        db.add(row)
    row.teacher_name = (teacher.get("name") or "").strip() or "Collega"
    row.test_name = rubric.get("name") or ""
    row.exported_at = data.get("exported_at")
    row.data = clean
    row.imported_at = datetime.now()
    db.commit()
    return {"share_id": rubric["share_id"], "replaced": replaced, "teacher_name": row.teacher_name,
            "test_name": row.test_name}


# ── Comparing ──────────────────────────────────────────────────────────────────

def families(db: DBSession):
    out = {}
    for row in db.query(ComparisonImport).order_by(ComparisonImport.imported_at.desc()).all():
        fam = out.setdefault(row.share_id, {"share_id": row.share_id, "name": row.test_name, "imports": [],
                                            "own_test_id": None})
        fam["imports"].append({
            "id": row.id, "teacher_name": row.teacher_name, "test_name": row.test_name,
            "imported_at": row.imported_at.isoformat() if row.imported_at else None,
            "exported_at": row.exported_at,
            "graded": sum(c.get("graded", 0) for c in (row.data or {}).get("classes") or []),
        })
    for fam in out.values():
        own = find_family(db, fam["share_id"])
        if own:
            fam["own_test_id"] = own.id
            fam["name"] = own.name
    return list(out.values())


def _participants(db: DBSession, share_id):
    parts = []
    own = find_family(db, share_id)
    if own:
        parts.append({"id": "own", "teacher_name": teacher_name(db) or "Ik", "own": True,
                      "rubric": rubric_dict(own), "classes": results_data(db, own, shuffle=False)})
    for row in db.query(ComparisonImport).filter(ComparisonImport.share_id == share_id).order_by(ComparisonImport.id).all():
        data = row.data or {}
        parts.append({"id": row.id, "teacher_name": row.teacher_name, "own": False,
                      "rubric": data.get("rubric") or {}, "classes": data.get("classes") or []})
    return parts


def _pct(scored, max_pts):
    return round(scored / max_pts * 100) if max_pts else None


def _distribution(grades):
    dist = {"in_ontwikkeling": 0, "beheerst": 0, "expert": 0}
    cijfers = []
    for g in grades:
        if g in dist:
            dist[g] += 1
        else:
            try:
                cijfers.append(float(g))
            except (TypeError, ValueError):
                pass
    out = {"categories": dist if any(dist.values()) else None, "cijfer": None}
    if cijfers:
        out["cijfer"] = {
            "count": len(cijfers),
            "avg": round(sum(cijfers) / len(cijfers), 1),
            "voldoende_pct": round(sum(1 for c in cijfers if c >= 5.5) / len(cijfers) * 100),
            "buckets": {
                "<5,5": sum(1 for c in cijfers if c < 5.5),
                "5,5-6,9": sum(1 for c in cijfers if 5.5 <= c < 7),
                "7,0-7,9": sum(1 for c in cijfers if 7 <= c < 8),
                "8+": sum(1 for c in cijfers if c >= 8),
            },
        }
    return out


def compare(db: DBSession, share_id, route=None):
    parts = _participants(db, share_id)
    if not parts:
        raise SharingError("Geen resultaten gevonden voor deze toets.")
    base = parts[0]["rubric"]
    if is_opdracht(base.get("grading_method")):
        return _compare_opdracht(parts, base, route)
    return _compare_questions(parts, base, route)


def _filter_route(students, route):
    return [s for s in students if not route or s.get("route") == route]


def _row_meta(p, label, cls_list, base, is_total, route):
    total = sum(c.get("total", 0) for c in cls_list)
    graded = sum(c.get("graded", 0) for c in cls_list)
    students = [s for c in cls_list for s in _filter_route(c.get("students") or [], route)]
    return {
        "participant": p["id"],
        "teacher_name": p["teacher_name"],
        "own": p["own"],
        "label": label,
        "is_total": is_total,
        "total": total,
        "graded": graded,
        "n": len(students),
        "other_normering": not _same(_normering_of(base.get("grading_method"), base.get("grade_config")),
                                     _normering_of(p["rubric"].get("grading_method"), p["rubric"].get("grade_config"))),
        "grading_method": p["rubric"].get("grading_method"),
    }, students


def _rows(parts, base, route, fill):
    rows = []
    for p in parts:
        classes = p["classes"]
        for c in classes:
            meta, students = _row_meta(p, c.get("label") or c.get("class_name") or "", [c], base, False, route)
            rows.append(fill(meta, students, p))
        if len(classes) > 1:
            meta, students = _row_meta(p, "Alle klassen", classes, base, True, route)
            rows.append(fill(meta, students, p))
    return rows


def _compare_questions(parts, base, route):
    base_qs = base.get("questions") or []
    by_part = {p["id"]: {q["share_key"]: q for q in p["rubric"].get("questions") or []} for p in parts}
    questions = []
    for i, bq in enumerate(base_qs):
        reasons = []
        for p in parts[1:]:
            pq = by_part[p["id"]].get(bq["share_key"])
            if pq is None:
                reasons.append(f"ontbreekt bij {p['teacher_name']}")
                continue
            for f in COMPARE_FIELDS:
                if _norm(pq.get(f)) != _norm(bq.get(f)):
                    reasons.append(f"{FIELD_LABELS[f]} verschilt bij {p['teacher_name']} "
                                   f"({bq.get(f) or '-'} / {pq.get(f) or '-'})")
        questions.append({
            "key": bq["share_key"], "label": f"V{i + 1}", "description": bq.get("description") or "",
            "max_score": bq["max_score"], "pyramid_level": bq.get("pyramid_level"), "domain": bq.get("domain") or "",
            "learning_goal": bq.get("learning_goal") or None, "comparable": not reasons, "reasons": reasons,
        })
    base_keys = {q["share_key"] for q in base_qs}
    extra = []
    for p in parts[1:]:
        for q in p["rubric"].get("questions") or []:
            if q["share_key"] not in base_keys:
                extra.append({"teacher_name": p["teacher_name"], "description": q.get("description") or ""})

    comparable = [q for q in questions if q["comparable"]]
    pyramid = [lv for lv in PYRAMID if any(q["pyramid_level"] == lv for q in comparable)]
    domains = sorted({q["domain"] for q in comparable if q["domain"]})
    goals = []
    for q in comparable:
        if q["learning_goal"] and q["learning_goal"] not in goals:
            goals.append(q["learning_goal"])

    def fill(meta, students, p):
        def agg(qs):
            scored = max_pts = 0
            for s in students:
                sc = s.get("scores") or {}
                for q in qs:
                    v = sc.get(q["key"])
                    if isinstance(v, (int, float)):
                        scored += v
                        max_pts += q["max_score"]
            return _pct(scored, max_pts)
        meta["questions"] = {q["key"]: agg([q]) for q in comparable}
        meta["pyramid"] = {lv: agg([q for q in comparable if q["pyramid_level"] == lv]) for lv in pyramid}
        meta["domains"] = {d: agg([q for q in comparable if q["domain"] == d]) for d in domains}
        meta["goals"] = {g: agg([q for q in comparable if q["learning_goal"] == g]) for g in goals}
        meta["total_pct"] = agg(comparable)
        meta["distribution"] = _distribution([s.get("grade") for s in students])
        return meta

    return {
        "kind": "toets",
        "name": base.get("name"),
        "questions": questions,
        "extra_questions": extra,
        "pyramid": pyramid,
        "domains": domains,
        "goals": goals,
        "participants": [{"id": p["id"], "teacher_name": p["teacher_name"], "own": p["own"]} for p in parts],
        "rows": _rows(parts, base, route, fill),
    }


def _crit_signature(c):
    return {"routes": sorted(c.get("routes") or []), "per_route": bool(c.get("per_route")),
            "levels": {lv: (c.get("levels") or {}).get(lv, {}).get("points") for lv in opdracht_logic.LEVELS},
            "route_levels": {r: {lv: (rl or {}).get(lv, {}).get("points") for lv in opdracht_logic.LEVELS}
                             for r, rl in (c.get("route_levels") or {}).items()} if c.get("per_route") else None}


def _compare_opdracht(parts, base, route):
    base_crits = _criteria(_sections_of(base.get("grade_config")))
    by_part = {p["id"]: _criteria(_sections_of(p["rubric"].get("grade_config"))) for p in parts}
    criteria = []
    for cid, (s, c, _) in base_crits.items():
        reasons = []
        for p in parts[1:]:
            other = by_part[p["id"]].get(cid)
            if other is None:
                reasons.append(f"ontbreekt bij {p['teacher_name']}")
            elif not _same(_crit_signature(other[1]), _crit_signature(c)):
                reasons.append(f"punten of routes verschillen bij {p['teacher_name']}")
        criteria.append({"key": cid, "label": c.get("name") or "(naamloos)", "section": s.get("name") or "",
                         "comparable": not reasons, "reasons": reasons})
    extra = []
    for p in parts[1:]:
        for cid, (s, c, _) in by_part[p["id"]].items():
            if cid not in base_crits:
                extra.append({"teacher_name": p["teacher_name"], "description": c.get("name") or ""})

    def fill(meta, students, p):
        levels = {}
        for crit in criteria:
            if not crit["comparable"]:
                continue
            counts = {lv: 0 for lv in opdracht_logic.LEVELS}
            for s in students:
                lv = (s.get("levels") or {}).get(crit["key"])
                if lv in counts:
                    counts[lv] += 1
            levels[crit["key"]] = counts
        meta["levels"] = levels
        pts = sum(s.get("points") or 0 for s in students)
        mx = sum(s.get("max") or 0 for s in students)
        meta["total_pct"] = _pct(pts, mx)
        meta["distribution"] = _distribution([s.get("grade") for s in students])
        return meta

    return {
        "kind": "opdracht",
        "name": base.get("name"),
        "criteria": criteria,
        "extra_questions": extra,
        "participants": [{"id": p["id"], "teacher_name": p["teacher_name"], "own": p["own"]} for p in parts],
        "rows": _rows(parts, base, route, fill),
    }
