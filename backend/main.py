from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import engine
from . import models
from .routers import students, tests, questions, sessions, scores, progress, reports, grades, school_year, opdracht, leerlingrapport, sharing, klas, levels, print_sheets

models.Base.metadata.create_all(bind=engine)

# Add columns introduced after initial schema without dropping existing data
def _migrate_db():
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE questions ADD COLUMN learning_goal TEXT",
            "ALTER TABLE questions ADD COLUMN learning_goal_threshold INTEGER",
            "ALTER TABLE tests ADD COLUMN grading_method TEXT",
            "ALTER TABLE tests ADD COLUMN grade_config TEXT",
            "ALTER TABLE sessions ADD COLUMN dismissed_inhalers TEXT",
            "ALTER TABLE sessions ADD COLUMN grading_mode TEXT DEFAULT 'horizontal'",
            "ALTER TABLE sessions ADD COLUMN stack_closed BOOLEAN DEFAULT 0",
            "ALTER TABLE scores ADD COLUMN comment TEXT",
            "ALTER TABLE student_grades ADD COLUMN stars INTEGER DEFAULT 0",
            # Delen met collega's
            "ALTER TABLE tests ADD COLUMN share_id TEXT",
            "ALTER TABLE questions ADD COLUMN share_key TEXT",
            "ALTER TABLE student_grades ADD COLUMN needs_check BOOLEAN DEFAULT 0",
            # Klas overdragen
            "ALTER TABLE students ADD COLUMN share_key TEXT",
            "ALTER TABLE sessions ADD COLUMN share_key TEXT",
            # Toetsen per leerjaar
            "ALTER TABLE tests ADD COLUMN levels TEXT",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists

        # One-time data fix (tracked with SQLite's user_version, so it never runs twice).
        # Since switching between per vraag and per leerling, horizontal sessions also use
        # stack_closed. Existing horizontal sessions were all started before this and keep
        # their stack as it was, so mark them closed.
        version = conn.execute(text("PRAGMA user_version")).scalar() or 0
        if version < 1:
            conn.execute(text(
                "UPDATE sessions SET stack_closed = 1 "
                "WHERE grading_mode IS NULL OR grading_mode = 'horizontal'"
            ))
            conn.execute(text("PRAGMA user_version = 1"))
            conn.commit()

_migrate_db()

app = FastAPI(title="Rubricmaker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(students.router)
app.include_router(tests.router)
app.include_router(questions.router)
app.include_router(sessions.router)
app.include_router(scores.router)
app.include_router(progress.router)
app.include_router(reports.router)
app.include_router(grades.router)
app.include_router(school_year.router)
app.include_router(opdracht.router)
app.include_router(leerlingrapport.router)
app.include_router(sharing.router)
app.include_router(klas.router)
app.include_router(levels.router)
app.include_router(print_sheets.router)


@app.get("/")
def root():
    return {"status": "ok", "app": "Rubricmaker API"}
