"""Leerjaar groups: every class has a leerjaar (1-6) and niveaus (m/h/v); a rubric lists the
groups it belongs to as labels such as "2mhv" (leerjaar 2, mavo+havo+vwo) or "3" (no niveau)."""
import re

from sqlalchemy.orm import Session as DBSession

from .models import ClassLevel, Session as SessionModel, Test

NIVEAUS = "mhv"
LABEL_RE = re.compile(r"^([1-6])([mhv]*)$")


def clean_niveaus(value):
    value = (value or "").lower()
    return "".join(n for n in NIVEAUS if n in value)


def clean_leerjaar(value):
    try:
        value = int(value)
    except (TypeError, ValueError):
        return None
    return value if 1 <= value <= 6 else None


def label(leerjaar, niveaus):
    leerjaar = clean_leerjaar(leerjaar)
    return f"{leerjaar}{clean_niveaus(niveaus)}" if leerjaar else None


def clean_labels(values):
    """Valid, normalised, unique labels in a stable order; anything else is dropped."""
    out = []
    for v in values or []:
        if not isinstance(v, str):
            continue
        m = LABEL_RE.match(v.strip().lower())
        if not m:
            continue
        lab = label(m.group(1), m.group(2))
        if lab and lab not in out:
            out.append(lab)
    return out


def level_dict(row):
    return {"leerjaar": row.leerjaar, "niveaus": row.niveaus or ""} if row else None


def all_levels(db: DBSession):
    return {r.class_name: level_dict(r) for r in db.query(ClassLevel).all()}


def set_level(db: DBSession, class_name, leerjaar, niveaus):
    """Store a class's leerjaar; no (valid) leerjaar removes it. Does not commit."""
    row = db.query(ClassLevel).filter(ClassLevel.class_name == class_name).first()
    leerjaar = clean_leerjaar(leerjaar)
    if not leerjaar:
        if row:
            db.delete(row)
        return None
    if row is None:
        row = ClassLevel(class_name=class_name, leerjaar=leerjaar, niveaus=clean_niveaus(niveaus))
        db.add(row)
    else:
        row.leerjaar = leerjaar
        row.niveaus = clean_niveaus(niveaus)
    return row


def get_level(db: DBSession, class_name):
    return db.query(ClassLevel).filter(ClassLevel.class_name == class_name).first()


def rename(db: DBSession, old, new):
    row = get_level(db, old)
    if row is None or old == new:
        return
    other = get_level(db, new)
    if other is not None:
        db.delete(other)
        db.flush()
    leerjaar, niveaus = row.leerjaar, row.niveaus
    db.delete(row)
    db.flush()
    db.add(ClassLevel(class_name=new, leerjaar=leerjaar, niveaus=niveaus))


def delete(db: DBSession, class_name):
    row = get_level(db, class_name)
    if row is not None:
        db.delete(row)


def suggestions(db: DBSession):
    """Rubrics whose leerjaar was never set, with the groups of the classes they were graded in."""
    levels = {r.class_name: label(r.leerjaar, r.niveaus) for r in db.query(ClassLevel).all()}
    out = {}
    missing = set()
    for test in db.query(Test).filter(Test.levels.is_(None)).all():
        labels = []
        for (cls,) in db.query(SessionModel.class_name).filter(SessionModel.test_id == test.id).distinct():
            lab = levels.get(cls)
            if lab is None:
                missing.add(cls)
            elif lab not in labels:
                labels.append(lab)
        if labels:
            out[test.id] = labels
    unset = db.query(Test).filter(Test.levels.is_(None)).count()
    return {"suggestions": out, "unset_count": unset, "classes_without_level": sorted(missing)}


def fill_suggestions(db: DBSession):
    data = suggestions(db)
    for test in db.query(Test).filter(Test.id.in_(list(data["suggestions"].keys()))).all():
        test.levels = data["suggestions"][test.id]
    db.commit()
    return len(data["suggestions"])
