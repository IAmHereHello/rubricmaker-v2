"""Klas overdragen: a whole class with everything in it, as a file for a colleague.

A class file (.klas) holds the students (name, route, oudergesprek notes, year snapshots),
the chosen toetsen and Grote opdrachten with their rubric, and per toetsafname every
score, comment, grade, route history, inhaler and group.

Students and sessions get a stable key (share_key) on first export. Copies imported
elsewhere keep these keys, so when the class comes back the app recognises it and shows
what changed (tick boxes) instead of creating a second class.

Importing:
- new: the class does not exist yet, everything is created.
- update: students of the file are already known (by key). Changed things become items
  the teacher ticks; nothing is ever deleted.
- merge: a local class looks like this one (same names or class name). Students with the
  same name are linked (can be unticked) and treated like an update.

Rubrics are never changed silently: a toets whose rubric is already here with the same
vragen is reused, otherwise a separate copy "Naam (van Docent)" is made.
"""
import copy
import hashlib
import json
from datetime import datetime

from sqlalchemy.orm import Session as DBSession

from . import opdracht_logic, class_levels
from .models import (
    OpdrachtEntry, OpdrachtGroup, OpdrachtGroupScore, OpdrachtScore, OpdrachtSessionState,
    Question, Score, Session as SessionModel, SessionStudentRoute, Student, StudentGrade,
    StudentNote, StudentYearSnapshot, Test,
)
from .route_history import change_student_route, session_route_overrides
from .sharing import (
    RESULTS_FORMAT, RUBRIC_FORMAT, ROUTES, SharingError, _new_question, _now, compute_grade,
    ensure_share_ids, installation_id, is_opdracht, new_id, rubric_dict, teacher_name,
    validate_rubric,
)

KLAS_FORMAT = "rubricmaker-klas"
FILE_VERSION = 1
LEVEL_NAMES = {"niet": "Niet", "voldoende": "Voldoende", "goed": "Goed"}
PART_NAMES = {"groep": "groepsdeel", "individueel": "individuele deel"}
STATUS_NAMES = {"ingeleverd": "ingeleverd", "niet_ingeleverd": "niet ingeleverd"}


def _low(name):
    return (name or "").strip().lower()


def _empty(v):
    return v is None or v == ""


# ── Export ─────────────────────────────────────────────────────────────────────

def class_students(db: DBSession, class_name):
    return db.query(Student).filter(Student.class_name == class_name).order_by(Student.name).all()


def class_sessions(db: DBSession, class_name):
    return (db.query(SessionModel).filter(SessionModel.class_name == class_name)
            .order_by(SessionModel.created_at, SessionModel.id).all())


def _iso(dt):
    return dt.isoformat(timespec="seconds") if dt else None


def export_overview(db: DBSession, class_name):
    """Toetsafnames of a class for the tick boxes in the Overdragen popup."""
    students = class_students(db, class_name)
    out = []
    for se in class_sessions(db, class_name):
        test = db.query(Test).filter(Test.id == se.test_id).first()
        if not test:
            continue
        graded = db.query(StudentGrade).filter(StudentGrade.session_id == se.id).count()
        out.append({
            "session_id": se.id, "test_name": test.name, "grading_method": test.grading_method,
            "created_at": _iso(se.created_at), "graded": graded,
        })
    return {"class_name": class_name, "student_count": len(students), "sessions": out,
            "teacher_name": teacher_name(db)}


def class_file(db: DBSession, class_name, session_ids=None):
    students = class_students(db, class_name)
    if not students:
        raise SharingError("Deze klas heeft geen leerlingen.")
    sessions = class_sessions(db, class_name)
    if session_ids is not None:
        wanted = set(session_ids)
        sessions = [se for se in sessions if se.id in wanted]

    for s in students:
        if not s.share_key:
            s.share_key = new_id()
    for se in sessions:
        if not se.share_key:
            se.share_key = new_id()
    db.commit()

    skey = {s.id: s.share_key for s in students}
    students_out = []
    for s in students:
        note = db.query(StudentNote).filter(StudentNote.student_id == s.id).first()
        snaps = db.query(StudentYearSnapshot).filter(StudentYearSnapshot.student_id == s.id).all()
        students_out.append({
            "key": s.share_key, "name": s.name, "route": s.route,
            "note": {"gesprekspunten": note.gesprekspunten or "", "afspraken": note.afspraken or ""} if note else None,
            "snapshots": [{"school_year": y.school_year, "radar_data": y.radar_data, "grades": y.grades,
                           "created_at": _iso(y.created_at)} for y in snaps],
        })

    tests_out = {}
    sessions_out = []
    for se in sessions:
        test = db.query(Test).filter(Test.id == se.test_id).first()
        if not test:
            continue
        ensure_share_ids(db, test)
        tests_out[test.share_id] = rubric_dict(test)
        qkey = {q.id: q.share_key for q in test.questions}
        overrides = session_route_overrides(db, se.id)
        d = {
            "key": se.share_key,
            "test": test.share_id,
            "created_at": _iso(se.created_at),
            "grading_mode": se.grading_mode or "horizontal",
            "stack_closed": bool(se.stack_closed),
            "student_order": [skey[i] for i in (se.student_order or []) if i in skey],
            "dismissed_inhalers": [skey[i] for i in (se.dismissed_inhalers or []) if i in skey],
            "routes": {s.share_key: overrides.get(s.id, s.route) for s in students},
            "scores": [
                {"student": skey[sc.student_id], "question": qkey[sc.question_id], "points": sc.points,
                 "excluded": bool(sc.excluded), "comment": sc.comment}
                for sc in db.query(Score).filter(Score.session_id == se.id).all()
                if sc.student_id in skey and sc.question_id in qkey
            ],
            "grades": [
                {"student": skey[g.student_id], "grade": g.grade, "is_manual": bool(g.is_manual),
                 "review_done": bool(g.review_done), "stars": g.stars or 0, "needs_check": bool(g.needs_check)}
                for g in db.query(StudentGrade).filter(StudentGrade.session_id == se.id).all()
                if g.student_id in skey
            ],
        }
        if is_opdracht(test.grading_method):
            d["opdracht"] = _export_opdracht(db, se, skey)
        sessions_out.append(d)

    return {
        "format": KLAS_FORMAT,
        "version": FILE_VERSION,
        "exported_at": _now(),
        "teacher_name": teacher_name(db),
        "installation_id": installation_id(db),
        "class_name": class_name,
        "class_level": class_levels.level_dict(class_levels.get_level(db, class_name)),
        "students": students_out,
        "tests": list(tests_out.values()),
        "sessions": sessions_out,
    }


def _export_opdracht(db, se, skey):
    state = db.query(OpdrachtSessionState).filter(OpdrachtSessionState.session_id == se.id).first()
    groups = (db.query(OpdrachtGroup).filter(OpdrachtGroup.session_id == se.id)
              .order_by(OpdrachtGroup.order, OpdrachtGroup.id).all())
    gidx = {g.id: i for i, g in enumerate(groups)}
    return {
        "state": {"mode": state.mode, "group_closed": bool(state.group_closed),
                  "individual_closed": bool(state.individual_closed)} if state else None,
        "groups": [
            {"scores": [{"criterion": gs.criterion_id, "level": gs.level, "comment": gs.comment}
                        for gs in db.query(OpdrachtGroupScore).filter(OpdrachtGroupScore.group_id == g.id).all()]}
            for g in groups
        ],
        "entries": [
            {"student": skey[e.student_id], "part": e.part, "status": e.status,
             "group": gidx.get(e.group_id), "order": e.order or 0}
            for e in db.query(OpdrachtEntry).filter(OpdrachtEntry.session_id == se.id).all()
            if e.student_id in skey
        ],
        "scores": [
            {"student": skey[sc.student_id], "criterion": sc.criterion_id, "level": sc.level, "comment": sc.comment}
            for sc in db.query(OpdrachtScore).filter(OpdrachtScore.session_id == se.id).all()
            if sc.student_id in skey
        ],
    }


# ── Reading a file ─────────────────────────────────────────────────────────────

def read_class_file(data):
    if not isinstance(data, dict):
        raise SharingError("Dit bestand kan niet gelezen worden.")
    fmt = data.get("format")
    if fmt != KLAS_FORMAT:
        if fmt == RUBRIC_FORMAT:
            raise SharingError("Dit is een rubricbestand. Importeer het bij Toetsen.")
        if fmt == RESULTS_FORMAT:
            raise SharingError("Dit is een resultatenbestand. Importeer het bij Vergelijken.")
        raise SharingError("Dit is geen klasbestand van Rubricmaker.")
    try:
        version = int(data.get("version") or 0)
    except (TypeError, ValueError):
        version = 0
    if version > FILE_VERSION:
        raise SharingError("Dit bestand is gemaakt met een nieuwere versie van Rubricmaker. "
                           "Start de app opnieuw om bij te werken en probeer het dan nog eens.")
    data = copy.deepcopy(data)
    students = data.get("students")
    if not isinstance(students, list) or not students:
        raise SharingError("Het klasbestand is onvolledig.")
    keys = set()
    for s in students:
        if not isinstance(s, dict) or not s.get("key") or not isinstance(s.get("name"), str) or not s["name"].strip():
            raise SharingError("Het klasbestand is onvolledig.")
        if s["key"] in keys:
            raise SharingError("Het klasbestand bevat dubbele leerlingen.")
        keys.add(s["key"])
        s["name"] = s["name"].strip()
        if s.get("route") not in ROUTES:
            s["route"] = "oranje"
        s["snapshots"] = [y for y in (s.get("snapshots") or []) if isinstance(y, dict) and y.get("school_year")]
    tests = {}
    for r in data.get("tests") or []:
        r = validate_rubric(r)
        tests[r["share_id"]] = r
    data["tests_by_id"] = tests
    sessions = []
    seen = set()
    for se in data.get("sessions") or []:
        if not isinstance(se, dict) or not se.get("key") or se.get("test") not in tests or se["key"] in seen:
            raise SharingError("Het klasbestand is onvolledig.")
        seen.add(se["key"])
        se["routes"] = {k: v for k, v in (se.get("routes") or {}).items() if k in keys and v in ROUTES}
        se["scores"] = [x for x in se.get("scores") or [] if isinstance(x, dict) and x.get("student") in keys]
        se["grades"] = [x for x in se.get("grades") or [] if isinstance(x, dict) and x.get("student") in keys
                        and not _empty(x.get("grade"))]
        if se.get("opdracht") is not None and not isinstance(se["opdracht"], dict):
            raise SharingError("Het klasbestand is onvolledig.")
        sessions.append(se)
    data["sessions"] = sessions
    data["class_name"] = (data.get("class_name") or "").strip() or "Klas"
    return data


def _local_classes(db):
    out = {}
    for s in db.query(Student).all():
        out.setdefault(s.class_name, []).append(s)
    return out


def _local_families(db):
    return {t.share_id for t in db.query(Test).filter(Test.share_id.isnot(None)).all()}


def inspect(db: DBSession, data):
    """What kind of import this is, and which local classes look like the file's class."""
    data = read_class_file(data)
    file_keys = {s["key"] for s in data["students"]}
    file_names = {_low(s["name"]) for s in data["students"]}
    file_tests = {se["test"] for se in data["sessions"]}
    sessions_by_class = {}
    for se in db.query(SessionModel).all():
        test = db.query(Test).filter(Test.id == se.test_id).first()
        if test and test.share_id:
            sessions_by_class.setdefault(se.class_name, set()).add(test.share_id.split("~")[0])
    candidates = []
    for cls, studs in _local_classes(db).items():
        key_matches = sum(1 for s in studs if s.share_key and s.share_key in file_keys)
        name_matches = sum(1 for s in studs if _low(s.name) in file_names)
        shared_tests = len({t.split("~")[0] for t in file_tests} & sessions_by_class.get(cls, set()))
        same_name = _low(cls) == _low(data["class_name"])
        if key_matches or name_matches or same_name:
            candidates.append({"class_name": cls, "student_count": len(studs), "key_matches": key_matches,
                               "name_matches": name_matches, "shared_tests": shared_tests, "same_name": same_name})
    candidates.sort(key=lambda c: (-c["key_matches"], -c["name_matches"], -c["shared_tests"], not c["same_name"]))
    summary = {
        "class_name": data["class_name"],
        "teacher_name": data.get("teacher_name") or "",
        "exported_at": data.get("exported_at"),
        "student_count": len(data["students"]),
        "sessions": [{"test_name": data["tests_by_id"][se["test"]].get("name"),
                      "grading_method": data["tests_by_id"][se["test"]].get("grading_method"),
                      "graded": len(se["grades"])} for se in data["sessions"]],
    }
    existing = {_low(c) for c in _local_classes(db)}
    suggested = data["class_name"]
    if _low(suggested) in existing:
        base = f"{data['class_name']} ({data.get('teacher_name') or 'collega'})"
        suggested, n = base, 2
        while _low(suggested) in existing:
            suggested = f"{base} {n}"
            n += 1
    if candidates and candidates[0]["key_matches"]:
        kind = "update"
    elif candidates:
        kind = "choice"
    else:
        kind = "new"
    return {"kind": kind, "summary": summary, "candidates": candidates, "suggested_name": suggested,
            "target": candidates[0]["class_name"] if candidates else None}


# ── Rubrics ────────────────────────────────────────────────────────────────────

def _signature(rubric):
    """What decides results: two rubrics with the same signature have "the same vragen"."""
    method = rubric.get("grading_method")
    cfg = rubric.get("grade_config") or {}
    if is_opdracht(method):
        def pts(levels):
            return {lv: (levels or {}).get(lv, {}).get("points") for lv in LEVEL_NAMES}
        secs = [{
            "id": s.get("id"), "group": bool(s.get("group")),
            "criteria": [{
                "id": c.get("id"), "routes": sorted(c.get("routes") or []), "feedback": bool(c.get("feedback")),
                "per_route": bool(c.get("per_route")), "levels": pts(c.get("levels")),
                "route_levels": {r: pts(v) for r, v in (c.get("route_levels") or {}).items()} if c.get("per_route") else None,
            } for c in s.get("criteria") or []],
        } for s in (cfg.get("opdracht") or {}).get("sections") or []]
        sig = {"method": method, "sections": secs, "thresholds": {r: cfg.get(r) for r in ROUTES}}
    else:
        qs = sorted(({
            "k": q.get("share_key"), "max": q.get("max_score"), "routes": sorted(q.get("routes") or []),
            "pyr": q.get("pyramid_level"), "dom": q.get("domain") or "", "goal": q.get("learning_goal") or None,
            "thr": q.get("learning_goal_threshold"),
        } for q in rubric.get("questions") or []), key=lambda x: str(x["k"]))
        sig = {"method": method, "config": cfg or None, "questions": qs}
    return json.dumps(sig, sort_keys=True)


def _copy_id(rubric):
    """Family id of a separate copy: the same rubric content always lands in the same copy."""
    digest = hashlib.sha1(_signature(rubric).encode()).hexdigest()[:12]
    return f"{rubric['share_id']}~{digest}"


def resolve_test(db: DBSession, rubric, inst, teacher):
    """(local test or None, info) for a rubric of the file. Does not write."""
    sid = rubric["share_id"]
    own = db.query(Test).filter(Test.share_id == sid).order_by(Test.id).first()
    if own:
        ensure = [q for q in own.questions if not q.share_key]
        if not ensure and _signature(rubric_dict(own)) == _signature(rubric):
            return own, {"action": "existing", "name": own.name}
    copy_test = db.query(Test).filter(Test.share_id == _copy_id(rubric)).first()
    if copy_test:
        return copy_test, {"action": "existing_copy", "name": copy_test.name}
    if own:
        return None, {"action": "copy", "name": f"{rubric['name']} (van {teacher or 'collega'})"}
    return None, {"action": "new", "name": rubric["name"]}


def _create_test(db, rubric, info, inst):
    share_id = rubric["share_id"] if info["action"] == "new" else _copy_id(rubric)
    test = Test(name=info["name"], grading_method=rubric.get("grading_method"),
                grade_config=copy.deepcopy(rubric.get("grade_config")), share_id=share_id,
                levels=rubric.get("levels") or None)
    db.add(test)
    db.flush()
    for i, rq in enumerate(rubric["questions"]):
        db.add(_new_question(test.id, rq, i))
    db.flush()
    db.refresh(test)
    return test


# ── Planning the import ────────────────────────────────────────────────────────

class Plan:
    """Matches the file to the local database and lists the tickable items. Does not write."""

    def __init__(self, db: DBSession, data, mode, target=None, new_name=None, accept=None, renames=None):
        self.db = db
        self.data = data
        self.mode = mode
        self.inst = data.get("installation_id") or "onbekend"
        self.teacher = data.get("teacher_name") or ""
        self.renames = {k: (v or "").strip() for k, v in (renames or {}).items()}
        all_students = db.query(Student).all()
        self.local_names = {_low(s.name): s for s in all_students}

        if mode == "new":
            self.target = (new_name or "").strip()
            if not self.target:
                raise SharingError("Vul een klasnaam in.")
            if _low(self.target) in {_low(s.class_name) for s in all_students}:
                raise SharingError(f"Er bestaat al een klas met de naam {self.target}.")
        else:
            if not target or not any(s.class_name == target for s in all_students):
                raise SharingError("Kies een bestaande klas om mee samen te voegen.")
            self.target = target

        # Students: file key -> local student (matched) / None (new)
        by_key = {s.share_key: s for s in all_students if s.share_key}
        target_by_name = {_low(s.name): s for s in all_students if s.class_name == self.target}
        self.fstudents = {s["key"]: s for s in data["students"]}
        self.match = {}
        self.linked = {}   # file key -> local student, linked by name (tickable)
        used = set()
        if mode != "new":
            for s in data["students"]:
                local = by_key.get(s["key"])
                if local:
                    self.match[s["key"]] = local
                    used.add(local.id)
            for s in data["students"]:
                if s["key"] in self.match:
                    continue
                local = target_by_name.get(_low(s["name"]))
                if local and local.id not in used:
                    self.linked[s["key"]] = local
                    used.add(local.id)
        self.missing = [s.name for s in all_students if s.class_name == self.target and s.id not in used] \
            if mode != "new" else []

        # Tests and sessions
        self.tests = {}
        for sid, rubric in data["tests_by_id"].items():
            self.tests[sid] = resolve_test(db, rubric, self.inst, self.teacher)
        self.local_sessions = {}
        taken = set()
        for se in data["sessions"]:
            local = db.query(SessionModel).filter(SessionModel.share_key == se["key"]).first()
            if not local and mode != "new":
                test, _ = self.tests[se["test"]]
                if test:
                    local = (db.query(SessionModel)
                             .filter(SessionModel.test_id == test.id, SessionModel.class_name == self.target,
                                     SessionModel.share_key.is_(None))
                             .order_by(SessionModel.id).first())
                    if local and local.id in taken:
                        local = None
            if local and mode == "new":
                local = None
            if local:
                taken.add(local.id)
            self.local_sessions[se["key"]] = local

        self.items = self._items()
        ids = {it["id"] for it in self.items}
        self.item_ids = ids
        default = {it["id"]: True for it in self.items}
        self.accept = default if accept is None else {i: bool(accept.get(i, default[i])) for i in ids}

    # -- helpers --
    def accepted(self, item_id):
        return self.mode == "new" or self.accept.get(item_id, False)

    def wants(self, item_id, fkey=None):
        """Apply this part? A listed item must be ticked; an unlisted one has no changes,
        except for a student who becomes a new student here (all their data is copied)."""
        if item_id in self.item_ids:
            return self.accepted(item_id)
        return fkey is not None and self.local_of(fkey) is None

    def local_of(self, fkey):
        """Local student for a file student, or None when it becomes a new student."""
        if fkey in self.match:
            return self.match[fkey]
        if fkey in self.linked and self.accepted(f"link:{fkey}"):
            return self.linked[fkey]
        return None

    def included(self, fkey):
        if self.local_of(fkey) is not None:
            return True
        return self.mode == "new" or self.accepted(f"student:{fkey}") or (
            fkey in self.linked and not self.accepted(f"link:{fkey}"))

    def final_name(self, fkey):
        return self.renames.get(fkey) or self.fstudents[fkey]["name"]

    def clashes(self):
        """File students that become new students but whose name is already taken."""
        out = []
        seen = {}
        taken = set(self.local_names)
        for s in self.data["students"]:
            k = s["key"]
            if self.local_of(k) is not None or not self.included(k):
                continue
            n = _low(self.final_name(k))
            if n in taken or n in seen:
                out.append(k)
                if n in seen and seen[n] not in out:
                    out.append(seen[n])
            seen.setdefault(n, k)
        return out

    def _items(self):
        items = []
        for s in self.data["students"]:
            k = s["key"]
            local = self.match.get(k) or self.linked.get(k)
            if k in self.linked:
                items.append({"id": f"link:{k}", "group": "students", "kind": "link", "name": s["name"],
                              "local_name": self.linked[k].name, "local_class": self.linked[k].class_name})
            if local is None:
                if self.mode != "new":
                    items.append({"id": f"student:{k}", "group": "students", "kind": "new", "name": s["name"],
                                  "lines": [{"label": "Kleur", "old": None, "new": s["route"], "route": True}]})
                continue
            lines = self._student_lines(s, local)
            if lines:
                items.append({"id": f"student:{k}", "group": "students", "kind": "changed",
                              "name": local.name, "lines": lines})
        for se in self.data["sessions"]:
            rubric = self.data["tests_by_id"][se["test"]]
            local = self.local_sessions[se["key"]]
            if local is None:
                if self.mode != "new":
                    _, info = self.tests[se["test"]]
                    items.append({"id": f"session:{se['key']}", "group": se["key"], "kind": "new",
                                  "name": rubric["name"], "graded": len(se["grades"]), "rubric": info})
                continue
            items += self._session_items(se, rubric, local)
        return items

    def _student_lines(self, s, local):
        lines = []
        if s["route"] != local.route:
            lines.append({"label": "Kleur", "old": local.route, "new": s["route"], "route": True})
        note = s.get("note") or {}
        lnote = self.db.query(StudentNote).filter(StudentNote.student_id == local.id).first()
        for field, label in (("gesprekspunten", "Gesprekspunten"), ("afspraken", "Afspraken")):
            new = (note.get(field) or "").strip()
            old = ((getattr(lnote, field) if lnote else "") or "").strip()
            if new and new != old:
                lines.append({"label": label, "old": old or None, "new": new})
        have = {y.school_year for y in self.db.query(StudentYearSnapshot).filter(StudentYearSnapshot.student_id == local.id)}
        for y in s.get("snapshots") or []:
            if y["school_year"] not in have:
                lines.append({"label": f"Jaaroverzicht {y['school_year']}", "old": None, "new": "toevoegen"})
        return lines

    def _session_items(self, se, rubric, local):
        test = self.db.query(Test).filter(Test.id == local.test_id).first()
        items = []
        if is_opdracht(test.grading_method):
            return self._opdracht_items(se, rubric, local, test)
        qs = {q.share_key: q for q in test.questions if q.share_key}
        label = {q.share_key: f"Vraag {i + 1}" for i, q in enumerate(sorted(test.questions, key=lambda q: (q.order, q.id)))}
        per = {}
        for x in se["scores"]:
            per.setdefault(x["student"], {"scores": [], "grade": None})["scores"].append(x)
        for g in se["grades"]:
            per.setdefault(g["student"], {"scores": [], "grade": None})["grade"] = g
        for fkey, d in per.items():
            lstudent = self.match.get(fkey) or self.linked.get(fkey)
            lscores = {}
            lgrade = None
            if lstudent:
                for sc in self.db.query(Score).filter(Score.session_id == local.id, Score.student_id == lstudent.id):
                    lscores[sc.question_id] = sc
                lgrade = self.db.query(StudentGrade).filter(StudentGrade.session_id == local.id,
                                                            StudentGrade.student_id == lstudent.id).first()
            lines = []
            for x in sorted(d["scores"], key=lambda x: label.get(x["question"], "")):
                q = qs.get(x["question"])
                if not q:
                    continue
                old = lscores.get(q.id)
                lab = label[x["question"]]
                if x.get("excluded") and not (old and old.excluded):
                    lines.append({"label": lab, "old": _pts(old), "new": "n.v.t."})
                elif not x.get("excluded") and x.get("points") is not None and (
                        not old or old.excluded or old.points != x["points"]):
                    lines.append({"label": lab, "old": _pts(old), "new": str(x["points"])})
                if not _empty(x.get("comment")) and x["comment"] != ((old.comment if old else None) or ""):
                    lines.append({"label": f"{lab} commentaar", "old": (old.comment if old else None) or None,
                                  "new": x["comment"]})
            g = d["grade"]
            if g and (not lgrade or lgrade.grade != g["grade"] or (lgrade.stars or 0) != (g.get("stars") or 0)):
                lines.append({"label": "Resultaat", "old": lgrade.grade if lgrade else None, "new": g["grade"],
                              "grade": True})
            if lines:
                items.append({"id": f"result:{se['key']}:{fkey}", "group": se["key"], "kind": "changed",
                              "name": self.fstudents[fkey]["name"], "student": fkey, "lines": lines})
        return items

    def _opdracht_items(self, se, rubric, local, test):
        od = se.get("opdracht") or {}
        crit_name = {c.get("id"): c.get("name") or "onderdeel" for _, c in opdracht_logic.all_criteria(test)}
        items = []
        # Groups
        gmap = self.group_map(se, local)
        for idx, g in enumerate(od.get("groups") or []):
            lid = gmap.get(idx)
            old = {}
            if lid:
                for gs in self.db.query(OpdrachtGroupScore).filter(OpdrachtGroupScore.group_id == lid):
                    old[gs.criterion_id] = gs
            lines = []
            for x in g.get("scores") or []:
                if x.get("criterion") not in crit_name:
                    continue
                o = old.get(x["criterion"])
                if x.get("level") and (not o or o.level != x["level"]):
                    lines.append({"label": crit_name[x["criterion"]], "old": _lvl(o.level if o else None),
                                  "new": _lvl(x["level"])})
                if not _empty(x.get("comment")) and x["comment"] != ((o.comment if o else None) or ""):
                    lines.append({"label": f"{crit_name[x['criterion']]} commentaar",
                                  "old": (o.comment if o else None) or None, "new": x["comment"]})
            if lines:
                members = [self.fstudents[e["student"]]["name"] for e in od.get("entries") or [] if e.get("group") == idx]
                items.append({"id": f"group:{se['key']}:{idx}", "group": se["key"], "kind": "changed",
                              "name": "Groepje: " + (", ".join(members) or "zonder leden"), "lines": lines})
        # Students
        per = {}
        for e in od.get("entries") or []:
            per.setdefault(e["student"], {"entries": [], "scores": []})["entries"].append(e)
        for x in od.get("scores") or []:
            per.setdefault(x["student"], {"entries": [], "scores": []})["scores"].append(x)
        for fkey, d in per.items():
            lstudent = self.match.get(fkey) or self.linked.get(fkey)
            lentries, lscores = {}, {}
            if lstudent:
                for e in self.db.query(OpdrachtEntry).filter(OpdrachtEntry.session_id == local.id,
                                                             OpdrachtEntry.student_id == lstudent.id):
                    lentries[e.part] = e
                for sc in self.db.query(OpdrachtScore).filter(OpdrachtScore.session_id == local.id,
                                                              OpdrachtScore.student_id == lstudent.id):
                    lscores[sc.criterion_id] = sc
            lines = []
            for e in d["entries"]:
                o = lentries.get(e.get("part"))
                part = PART_NAMES.get(e.get("part"), e.get("part"))
                if not o or o.status != e.get("status"):
                    lines.append({"label": f"Inleveren {part}", "old": STATUS_NAMES.get(o.status) if o else None,
                                  "new": STATUS_NAMES.get(e.get("status"), e.get("status"))})
                elif e.get("group") is not None and o.group_id != gmap.get(e["group"]):
                    lines.append({"label": "Groepje", "old": "ander groepje", "new": "groepje uit het bestand"})
            for x in d["scores"]:
                if x.get("criterion") not in crit_name:
                    continue
                o = lscores.get(x["criterion"])
                if x.get("level") and (not o or o.level != x["level"]):
                    lines.append({"label": crit_name[x["criterion"]], "old": _lvl(o.level if o else None),
                                  "new": _lvl(x["level"])})
                if not _empty(x.get("comment")) and x["comment"] != ((o.comment if o else None) or ""):
                    lines.append({"label": f"{crit_name[x['criterion']]} commentaar",
                                  "old": (o.comment if o else None) or None, "new": x["comment"]})
            if lines:
                items.append({"id": f"result:{se['key']}:{fkey}", "group": se["key"], "kind": "changed",
                              "name": self.fstudents[fkey]["name"], "student": fkey, "lines": lines})
        return items

    def group_map(self, se, local):
        """{file group index: local group id} for groups with exactly the same members."""
        od = se.get("opdracht") or {}
        members = {}
        for e in od.get("entries") or []:
            if e.get("group") is not None:
                ls = self.match.get(e["student"]) or self.linked.get(e["student"])
                members.setdefault(e["group"], set()).add(ls.id if ls else f"new:{e['student']}")
        local_members = {}
        for e in self.db.query(OpdrachtEntry).filter(OpdrachtEntry.session_id == local.id):
            if e.group_id:
                local_members.setdefault(e.group_id, set()).add(e.student_id)
        out = {}
        used = set()
        for idx, mem in members.items():
            for gid, lmem in local_members.items():
                if gid not in used and lmem == mem:
                    out[idx] = gid
                    used.add(gid)
                    break
        return out

    def preview(self):
        sessions = []
        for se in self.data["sessions"]:
            rubric = self.data["tests_by_id"][se["test"]]
            _, info = self.tests[se["test"]]
            local = self.local_sessions[se["key"]]
            sessions.append({"key": se["key"], "name": rubric["name"], "grading_method": rubric.get("grading_method"),
                             "exists": local is not None, "rubric": info, "graded": len(se["grades"])})
        return {
            "mode": self.mode, "target": self.target, "items": self.items, "accept": self.accept,
            "sessions": sessions, "missing": self.missing,
            "clashes": [{"key": k, "name": self.final_name(k)} for k in self.clashes()],
            "no_changes": self.mode != "new" and not self.items,
        }


def _pts(score):
    if not score:
        return None
    if score.excluded:
        return "n.v.t."
    return None if score.points is None else str(score.points)


def _lvl(level):
    return LEVEL_NAMES.get(level) if level else None


# ── Applying ───────────────────────────────────────────────────────────────────

def _parse_dt(value):
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


def apply(db: DBSession, plan: Plan):
    if plan.clashes():
        raise SharingError("Sommige leerlingnamen bestaan al. Vul een achternaamletter in.")
    data = plan.data
    counts = {"new_students": 0, "updated_students": 0, "new_sessions": 0, "updated_results": 0,
              "skipped_scores": 0, "needs_check": 0, "new_tests": 0}
    used_keys = {s.share_key for s in db.query(Student).filter(Student.share_key.isnot(None))}

    # 1. Students
    smap = {}   # file key -> local Student
    for s in data["students"]:
        k = s["key"]
        local = plan.local_of(k)
        if local is not None:
            if not local.share_key and k not in used_keys:
                local.share_key = k
                used_keys.add(k)
            if f"student:{k}" in plan.item_ids and plan.accepted(f"student:{k}"):
                if s["route"] != local.route:
                    change_student_route(db, local, s["route"])
                _apply_note(db, local, s)
                _add_snapshots(db, local, s)
                counts["updated_students"] += 1
            smap[k] = local
        elif plan.included(k):
            new = Student(name=plan.final_name(k), class_name=plan.target, route=s["route"],
                          share_key=k if k not in used_keys else new_id())
            used_keys.add(new.share_key)
            db.add(new)
            db.flush()
            _apply_note(db, new, s)
            _add_snapshots(db, new, s)
            smap[k] = new
            counts["new_students"] += 1

    # 2. Sessions
    created_tests = {}
    opdracht_sessions = []
    for se in data["sessions"]:
        rubric = data["tests_by_id"][se["test"]]
        local = plan.local_sessions[se["key"]]
        if local is None:
            if not plan.accepted(f"session:{se['key']}"):
                continue
            test, info = plan.tests[se["test"]]
            if test is None:
                test = created_tests.get(se["test"])
                if test is None:
                    test = _create_test(db, rubric, info, plan.inst)
                    created_tests[se["test"]] = test
                    counts["new_tests"] += 1
            local = _create_session(db, plan, se, test, smap, counts)
            counts["new_sessions"] += 1
            if is_opdracht(test.grading_method):
                opdracht_sessions.append((local, None))
            continue
        test = db.query(Test).filter(Test.id == local.test_id).first()
        if not local.share_key:
            local.share_key = se["key"]
        if is_opdracht(test.grading_method):
            before = {g.student_id: g.grade for g in db.query(StudentGrade).filter(StudentGrade.session_id == local.id)}
            touched = _update_opdracht(db, plan, se, local, test, smap, counts)
            opdracht_sessions.append((local, (before, touched)))
        else:
            _update_session(db, plan, se, local, test, smap, counts)

    # Leerjaar + niveaus of the class: taken from the file only when this class has none yet
    lvl = data.get("class_level")
    if isinstance(lvl, dict) and class_levels.get_level(db, plan.target) is None:
        class_levels.set_level(db, plan.target, lvl.get("leerjaar"), lvl.get("niveaus"))

    db.flush()
    # 3. Grote opdracht results are derived from the levels
    for local, info in opdracht_sessions:
        db.commit()
        opdracht_logic.sync_grades(opdracht_logic.Context(db, local))
        if info:
            before, touched = info
            for g in db.query(StudentGrade).filter(StudentGrade.session_id == local.id):
                if g.student_id in touched and g.student_id in before and before[g.student_id] != g.grade:
                    g.needs_check = True
                    counts["needs_check"] += 1
    db.commit()
    counts["class_name"] = plan.target
    return counts


def _apply_note(db, student, s):
    note = s.get("note") or {}
    if not any((note.get(f) or "").strip() for f in ("gesprekspunten", "afspraken")):
        return
    row = db.query(StudentNote).filter(StudentNote.student_id == student.id).first()
    if not row:
        row = StudentNote(student_id=student.id, gesprekspunten="", afspraken="")
        db.add(row)
    for f in ("gesprekspunten", "afspraken"):
        if (note.get(f) or "").strip():
            setattr(row, f, note[f])


def _add_snapshots(db, student, s):
    have = {y.school_year for y in db.query(StudentYearSnapshot).filter(StudentYearSnapshot.student_id == student.id)}
    for y in s.get("snapshots") or []:
        if y["school_year"] in have:
            continue
        db.add(StudentYearSnapshot(student_id=student.id, school_year=y["school_year"],
                                   radar_data=y.get("radar_data") or [], grades=y.get("grades"),
                                   created_at=_parse_dt(y.get("created_at"))))
        have.add(y["school_year"])


def _set_route(db, session_id, student, route):
    """Make this session use `route` for the student (the route it was graded with)."""
    if route not in ROUTES:
        return
    row = db.query(SessionStudentRoute).filter(SessionStudentRoute.session_id == session_id,
                                               SessionStudentRoute.student_id == student.id).first()
    if route == student.route:
        if row:
            db.delete(row)
    elif row:
        row.route = route
    else:
        db.add(SessionStudentRoute(session_id=session_id, student_id=student.id, route=route))


def _create_session(db, plan, se, test, smap, counts):
    session = SessionModel(
        test_id=test.id, class_name=plan.target, grading_mode=se.get("grading_mode") or "horizontal",
        stack_closed=bool(se.get("stack_closed")),
        student_order=[smap[k].id for k in se.get("student_order") or [] if k in smap],
        dismissed_inhalers=[smap[k].id for k in se.get("dismissed_inhalers") or [] if k in smap],
        share_key=se["key"],
    )
    for old in db.query(SessionModel).filter(SessionModel.share_key == se["key"]).all():
        old.share_key = None   # an older copy (e.g. of a deleted class) gives up the key
    created = _parse_dt(se.get("created_at"))
    if created:
        session.created_at = created
    db.add(session)
    db.flush()
    for k, route in se["routes"].items():
        if k in smap:
            _set_route(db, session.id, smap[k], route)
    qid = {q.share_key: q.id for q in test.questions if q.share_key}
    for x in se["scores"]:
        if x["student"] not in smap:
            continue
        if x.get("question") not in qid:
            counts["skipped_scores"] += 1
            continue
        db.add(Score(session_id=session.id, student_id=smap[x["student"]].id, question_id=qid[x["question"]],
                     points=x.get("points"), excluded=bool(x.get("excluded")), comment=x.get("comment")))
    if not is_opdracht(test.grading_method):
        for g in se["grades"]:
            if g["student"] in smap:
                db.add(StudentGrade(session_id=session.id, student_id=smap[g["student"]].id, grade=str(g["grade"]),
                                    is_manual=bool(g.get("is_manual")), review_done=bool(g.get("review_done")),
                                    stars=g.get("stars") or 0, needs_check=bool(g.get("needs_check"))))
    else:
        od = se.get("opdracht") or {}
        st = od.get("state")
        if st:
            db.add(OpdrachtSessionState(session_id=session.id, mode=st.get("mode"),
                                        group_closed=bool(st.get("group_closed")),
                                        individual_closed=bool(st.get("individual_closed"))))
        valid = opdracht_logic.criterion_ids(test)
        groups = []
        for i, g in enumerate(od.get("groups") or []):
            grp = OpdrachtGroup(session_id=session.id, order=i)
            db.add(grp)
            db.flush()
            groups.append(grp)
            for x in g.get("scores") or []:
                if x.get("criterion") in valid:
                    db.add(OpdrachtGroupScore(group_id=grp.id, criterion_id=x["criterion"], level=x.get("level"),
                                              comment=x.get("comment")))
        for e in od.get("entries") or []:
            if e["student"] not in smap or e.get("part") not in opdracht_logic.PARTS:
                continue
            gi = e.get("group")
            db.add(OpdrachtEntry(session_id=session.id, student_id=smap[e["student"]].id, part=e["part"],
                                 status=e.get("status") or "ingeleverd",
                                 group_id=groups[gi].id if isinstance(gi, int) and 0 <= gi < len(groups) else None,
                                 order=e.get("order") or 0))
        for x in od.get("scores") or []:
            if x["student"] in smap and x.get("criterion") in valid:
                db.add(OpdrachtScore(session_id=session.id, student_id=smap[x["student"]].id,
                                     criterion_id=x["criterion"], level=x.get("level"), comment=x.get("comment")))
    db.flush()
    return session


def _merge_session_meta(local, se, smap, applied_ids):
    order = list(local.student_order or [])
    if order:
        for sid in applied_ids:
            if sid not in order:
                order.append(sid)
        local.student_order = order
    dismissed = list(local.dismissed_inhalers or [])
    for k in se.get("dismissed_inhalers") or []:
        if k in smap and smap[k].id in applied_ids and smap[k].id not in dismissed:
            dismissed.append(smap[k].id)
    local.dismissed_inhalers = dismissed
    if se.get("stack_closed"):
        local.stack_closed = True


def _update_session(db, plan, se, local, test, smap, counts):
    qid = {q.share_key: q.id for q in test.questions if q.share_key}
    questions = [{"key": q.id, "max_score": q.max_score, "routes": q.routes or [], "learning_goal": q.learning_goal,
                  "learning_goal_threshold": q.learning_goal_threshold} for q in test.questions]
    grades = {g["student"]: g for g in se["grades"]}
    by_student = {}
    for x in se["scores"]:
        by_student.setdefault(x["student"], []).append(x)
    applied = []
    for fkey in set(by_student) | set(grades):
        if fkey not in smap or not plan.wants(f"result:{se['key']}:{fkey}", fkey):
            continue
        student = smap[fkey]
        applied.append(student.id)
        _set_route(db, local.id, student, se["routes"].get(fkey, student.route))
        existing = {sc.question_id: sc for sc in db.query(Score).filter(Score.session_id == local.id,
                                                                        Score.student_id == student.id)}
        changed = False
        for x in by_student.get(fkey, []):
            q = qid.get(x.get("question"))
            if q is None:
                counts["skipped_scores"] += 1
                continue
            sc = existing.get(q)
            if not sc:
                if x.get("points") is None and not x.get("excluded") and _empty(x.get("comment")):
                    continue
                sc = Score(session_id=local.id, student_id=student.id, question_id=q, points=None, excluded=False)
                db.add(sc)
            if x.get("excluded") and not sc.excluded:
                sc.excluded, changed = True, True
            elif not x.get("excluded") and x.get("points") is not None and (sc.excluded or sc.points != x["points"]):
                sc.excluded, sc.points, changed = False, x["points"], True
            if not _empty(x.get("comment")) and x["comment"] != (sc.comment or ""):
                sc.comment = x["comment"]
        db.flush()
        lgrade = db.query(StudentGrade).filter(StudentGrade.session_id == local.id,
                                               StudentGrade.student_id == student.id).first()
        g = grades.get(fkey)
        if g:
            if lgrade:
                differs = lgrade.grade != str(g["grade"])
                lgrade.grade = str(g["grade"])
                lgrade.is_manual = bool(g.get("is_manual"))
                lgrade.review_done = bool(g.get("review_done")) or bool(lgrade.review_done)
                lgrade.stars = g.get("stars") or 0
                if differs:
                    lgrade.needs_check = True
                    counts["needs_check"] += 1
            else:
                db.add(StudentGrade(session_id=local.id, student_id=student.id, grade=str(g["grade"]),
                                    is_manual=bool(g.get("is_manual")), review_done=bool(g.get("review_done")),
                                    stars=g.get("stars") or 0, needs_check=bool(g.get("needs_check"))))
        elif lgrade and changed and not lgrade.is_manual:
            route = se["routes"].get(fkey, student.route)
            scores = {sc.question_id: {"points": sc.points, "excluded": sc.excluded}
                      for sc in db.query(Score).filter(Score.session_id == local.id, Score.student_id == student.id)}
            new = compute_grade(route, questions, scores, test.grading_method, test.grade_config, lgrade.stars or 0)
            if new and new != lgrade.grade:
                lgrade.grade = new
                lgrade.needs_check = True
                counts["needs_check"] += 1
        counts["updated_results"] += 1
    _merge_session_meta(local, se, smap, applied)


def _update_opdracht(db, plan, se, local, test, smap, counts):
    od = se.get("opdracht") or {}
    valid = opdracht_logic.criterion_ids(test)
    st = od.get("state")
    state = db.query(OpdrachtSessionState).filter(OpdrachtSessionState.session_id == local.id).first()
    if st:
        if not state:
            db.add(OpdrachtSessionState(session_id=local.id, mode=st.get("mode"),
                                        group_closed=bool(st.get("group_closed")),
                                        individual_closed=bool(st.get("individual_closed"))))
        else:
            state.mode = state.mode or st.get("mode")
            state.group_closed = bool(state.group_closed) or bool(st.get("group_closed"))
            state.individual_closed = bool(state.individual_closed) or bool(st.get("individual_closed"))
    gmap = plan.group_map(se, local)
    file_groups = od.get("groups") or []

    def local_group(idx):
        if not isinstance(idx, int) or not 0 <= idx < len(file_groups):
            return None
        if idx not in gmap:
            last = db.query(OpdrachtGroup).filter(OpdrachtGroup.session_id == local.id).order_by(OpdrachtGroup.order.desc()).first()
            grp = OpdrachtGroup(session_id=local.id, order=(last.order + 1) if last else 0)
            db.add(grp)
            db.flush()
            gmap[idx] = grp.id
        return gmap[idx]

    for idx, g in enumerate(file_groups):
        if not plan.wants(f"group:{se['key']}:{idx}"):
            continue
        gid = local_group(idx)
        existing = {gs.criterion_id: gs for gs in db.query(OpdrachtGroupScore).filter(OpdrachtGroupScore.group_id == gid)}
        for x in g.get("scores") or []:
            if x.get("criterion") not in valid:
                continue
            gs = existing.get(x["criterion"])
            if not gs:
                gs = OpdrachtGroupScore(group_id=gid, criterion_id=x["criterion"])
                db.add(gs)
            if x.get("level"):
                gs.level = x["level"]
            if not _empty(x.get("comment")):
                gs.comment = x["comment"]
        counts["updated_results"] += 1

    per = {}
    for e in od.get("entries") or []:
        per.setdefault(e["student"], {"entries": [], "scores": []})["entries"].append(e)
    for x in od.get("scores") or []:
        per.setdefault(x["student"], {"entries": [], "scores": []})["scores"].append(x)
    touched = set()
    old_groups = set()
    for fkey, d in per.items():
        item_id = f"result:{se['key']}:{fkey}"
        if fkey not in smap or not plan.wants(item_id, fkey):
            continue
        student = smap[fkey]
        touched.add(student.id)
        _set_route(db, local.id, student, se["routes"].get(fkey, student.route))
        entries = {e.part: e for e in db.query(OpdrachtEntry).filter(OpdrachtEntry.session_id == local.id,
                                                                     OpdrachtEntry.student_id == student.id)}
        for e in d["entries"]:
            if e.get("part") not in opdracht_logic.PARTS:
                continue
            row = entries.get(e["part"])
            if not row:
                row = OpdrachtEntry(session_id=local.id, student_id=student.id, part=e["part"], order=e.get("order") or 0)
                db.add(row)
            row.status = e.get("status") or "ingeleverd"
            if e.get("group") is not None:
                gid = local_group(e["group"])
                if row.group_id and row.group_id != gid:
                    old_groups.add(row.group_id)
                row.group_id = gid
        scores = {sc.criterion_id: sc for sc in db.query(OpdrachtScore).filter(OpdrachtScore.session_id == local.id,
                                                                              OpdrachtScore.student_id == student.id)}
        for x in d["scores"]:
            if x.get("criterion") not in valid:
                continue
            sc = scores.get(x["criterion"])
            if not sc:
                sc = OpdrachtScore(session_id=local.id, student_id=student.id, criterion_id=x["criterion"])
                db.add(sc)
            if x.get("level"):
                sc.level = x["level"]
            if not _empty(x.get("comment")):
                sc.comment = x["comment"]
        counts["updated_results"] += 1
    db.flush()
    # Groups left without members after students moved to their file group
    for gid in old_groups:
        if not db.query(OpdrachtEntry).filter(OpdrachtEntry.group_id == gid).first():
            grp = db.query(OpdrachtGroup).filter(OpdrachtGroup.id == gid).first()
            if grp:
                db.delete(grp)
    _merge_session_meta(local, se, smap, touched)
    return touched


# ── Class rename ───────────────────────────────────────────────────────────────

def rename_class(db: DBSession, old, new):
    new = (new or "").strip()
    if not new:
        raise SharingError("Vul een klasnaam in.")
    if new == old:
        return new
    others = {c for (c,) in db.query(Student.class_name).distinct() if c != old}
    if _low(new) in {_low(c) for c in others}:
        raise SharingError(f"Er bestaat al een klas met de naam {new}.")
    for s in db.query(Student).filter(Student.class_name == old):
        s.class_name = new
    for se in db.query(SessionModel).filter(SessionModel.class_name == old):
        se.class_name = new
    class_levels.rename(db, old, new)
    db.commit()
    return new


def delete_class_everything(db: DBSession, class_name):
    """After "Klas daarna bij mij verwijderen": students and the class's toetsafnames."""
    count = 0
    for se in db.query(SessionModel).filter(SessionModel.class_name == class_name).all():
        db.delete(se)
    for s in db.query(Student).filter(Student.class_name == class_name).all():
        db.delete(s)
        count += 1
    class_levels.delete(db, class_name)
    db.commit()
    return count
