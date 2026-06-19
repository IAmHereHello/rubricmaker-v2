# Rubricmaker v2 — Agent Context File

This file is the single source of truth for a fresh AI coding agent. Everything here is derived from reading the actual source files, not from the original spec.

---

## 1. Project Purpose

A single-teacher web app for grading math tests and tracking student progress over time. The teacher can:

- Manage students (name, class, learning route).
- Build reusable tests with per-question metadata (domain, De Lange pyramid level, applicable routes, model answer, max score).
- Run grading sessions: one question at a time, all students per question.
- View per-student progress as a heatmap of domain × pyramid level.
- View a class overview heatmap filtered by route.

The app is designed for a single user with no authentication. All text in the UI is Dutch.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy (ORM), SQLite (database file `rubricmaker.db`) |
| Backend schema validation | Pydantic v2 |
| Frontend | React 18, React Router v6, Axios, Vite 5 |
| Language | Python 3.11+, JavaScript (JSX, no TypeScript) |
| Runtime | Raspberry Pi 5, accessed remotely via Tailscale |

**How they communicate:** The Vite dev server runs on port 3000. All frontend API calls go to `/api/...`. Vite proxies these to `http://localhost:8000` (the FastAPI server), stripping the `/api` prefix. This means frontend code always calls `/api/students`, never `http://localhost:8000/students`.

**Database location:** `rubricmaker.db` is created in whatever directory `uvicorn` is launched from (the project root). The path in `database.py` is `sqlite:///./rubricmaker.db`.

---

## 3. Data Model

Source: `backend/models.py`. All models use SQLAlchemy with a shared `Base` from `backend/database.py`.

### Student
```
id          Integer  PK
name        String   not null
class_name  String   not null  (e.g. "1a", "2c")
route       String   not null  — one of: "oranje" | "geel" | "blauw"
```
Relationships: has many `Score` (cascade delete).

### Test
```
id          Integer   PK
name        String    not null
created_at  DateTime  server default now()
```
Relationships: has many `Question` (ordered by `Question.order`, cascade delete), has many `Session` (cascade delete).

### Question
```
id             Integer  PK
test_id        Integer  FK → tests.id
order          Integer  not null, default 0  (display order within the test)
description    String   not null
answer         String   default ""  (model answer shown during grading)
max_score      Integer  not null
routes         JSON     default []  — subset of ["oranje", "geel", "blauw"]
domain         String   default ""  — one of: "Algebra" | "Meetkunde" | "Rekenen" | "Statistiek"
pyramid_level  String   not null    — one of: "reproductie" | "verbinding" | "reflectie"
```
**`pyramid_level`** stores stable short codes; the UI displays the De Lange labels via a code→label mapping (see Section 6). The codes are never shown to the user directly.
Relationships: belongs to `Test`, has many `Score` (cascade delete).

### Session
```
id             Integer   PK
test_id        Integer   FK → tests.id
class_name     String    not null
created_at     DateTime  server default now()
student_order  JSON      default []  — list of student IDs in grading order
```
`student_order` starts as an empty list and is populated after the first question is fully graded. Once set, it is the canonical order for all remaining questions.
Relationships: belongs to `Test`, has many `Score` (cascade delete).

### Score
```
id           Integer  PK
session_id   Integer  FK → sessions.id
student_id   Integer  FK → students.id
question_id  Integer  FK → questions.id
points       Integer  nullable  — null means "not yet graded", NOT zero
excluded     Boolean  default False  — true if question does not apply to student's route
```
Relationships: belongs to `Session`, `Student`, and `Question`.

**Constraint:** there is no unique index on `(session_id, student_id, question_id)` in the model, but the `PUT /scores` endpoint implements upsert logic manually (query first, update if found, insert otherwise).

---

## 4. API Endpoints

All routers are registered in `backend/main.py`. CORS is open (`allow_origins=["*"]`).

### `/students` — `backend/routers/students.py`
| Method | Path | Description |
|---|---|---|
| GET | `/students` | List all students, optional `?class_name=` filter, sorted by class then name |
| POST | `/students` | Create a student |
| PUT | `/students/{id}` | Update a student (full replace) |
| DELETE | `/students/{id}` | Delete a student (cascades to scores) |

### `/tests` — `backend/routers/tests.py`
| Method | Path | Description |
|---|---|---|
| GET | `/tests` | List all tests, newest first |
| POST | `/tests` | Create a test |
| GET | `/tests/{id}` | Get a test with its questions sorted by `order` |
| PUT | `/tests/{id}` | Update a test's name (used by the rename pencil in `TestEdit.jsx`) |
| DELETE | `/tests/{id}` | Delete a test (cascades to questions and sessions) |

### `/questions` — `backend/routers/questions.py`
| Method | Path | Description |
|---|---|---|
| POST | `/questions` | Create a question |
| PUT | `/questions/reorder` | Batch-update `order` field; body is `[{question_id, order}, ...]` |
| PUT | `/questions/{id}` | Update a question (partial, uses `exclude_unset=True`) |
| DELETE | `/questions/{id}` | Delete a question |

**Router order matters:** `/questions/reorder` must be registered before `/questions/{id}` so the literal `reorder` is not captured as an `{id}`. This is handled correctly in the current code.

### `/sessions` — `backend/routers/sessions.py`
| Method | Path | Description |
|---|---|---|
| GET | `/sessions` | List all sessions, newest first |
| POST | `/sessions` | Create a session (initialises `student_order` to `[]`) |
| GET | `/sessions/{id}` | Get session + all its scores in one response |
| PUT | `/sessions/{id}/order` | Set or replace the session's `student_order` |

### `/scores` — `backend/routers/scores.py`
| Method | Path | Description |
|---|---|---|
| PUT | `/scores` | Upsert a score by `(session_id, student_id, question_id)` |
| GET | `/scores/session/{session_id}` | Get all scores for a session |

### `/progress` — `backend/routers/progress.py`
| Method | Path | Description |
|---|---|---|
| GET | `/progress/student/{student_id}` | Per-student heatmap: domain × pyramid_level averages + per-session breakdown |
| GET | `/progress/class/{class_name}/{route}` | Class heatmap: rows = students, columns = domain × pyramid_level combos |

Both progress endpoints filter out excluded scores and scores where `points IS NULL` before computing percentages.

---

## 5. Frontend Structure

Source: `frontend/src/App.jsx`. Router is `BrowserRouter`. All API calls go through `frontend/src/api.js` which uses axios with `baseURL: '/api'`.

### Pages

| React component | Route | Description |
|---|---|---|
| `Students.jsx` | `/students` | List students grouped by class; inline add/edit form; links to class overview and student progress |
| `TestList.jsx` | `/tests` | List tests with create-and-redirect form |
| `TestEdit.jsx` | `/tests/:id/edit` | Add/edit/delete/reorder questions for a test; rename test via pencil; domain and pyramid level are fixed `<select>` dropdowns |
| `SessionNew.jsx` | `/sessions/new` | Pick a test and class, then navigate to grading view |
| `Grade.jsx` | `/sessions/:id/grade` | Main grading view (see Section 6 for flow details) |
| `StudentProgress.jsx` | `/students/:id/progress` | Domain × pyramid heatmap + per-session score table for one student |
| `ClassOverview.jsx` | `/classes/:class_name/overview` | Route-filtered class heatmap; route selector buttons at top |

`/` redirects to `/students`.

### Shared Components

- `components/RouteBadge.jsx` — renders a coloured badge (`badge-oranje`, `badge-geel`, `badge-blauw`) for a route string.

### Shared Constants

- `constants.js` — single source of truth for `PYRAMID_LEVELS` (array of `{ value, label }`, where `value` is the stored code and `label` the De Lange display label), the `pyramidLabel(value)` helper, and `DOMAINS` (the fixed four-domain list). Imported by `TestEdit.jsx`, `Grade.jsx`, `StudentProgress.jsx`, and `ClassOverview.jsx`.

### Styling

Single file: `frontend/src/index.css`. No UI library. Key CSS classes:
- `.badge-oranje / .badge-geel / .badge-blauw` — route badge colours
- `.level-reproductie / .level-verbinding / .level-reflectie` — pyramid level pill colours (keyed by the stored code, not the display label)
- `.cell-green / .cell-orange / .cell-red / .cell-empty` — heatmap cell colours (≥75%, 55–74%, <55%, no data)
- `.grade-wrap` — two-column grid layout for the grading view (main panel + sidebar)

---

## 6. Known Business Logic Rules — Do Not Break These

### Route filtering and excluded scores
A question's `routes` field lists which learning routes it applies to. If a student's `route` is not in a question's `routes`, the student receives an **excluded** score record (`excluded=True`, `points=NULL`). Excluded questions are not counted in the student's scored points or maximum possible points — they are simply omitted from all calculations. Do not treat them as zero.

In the grading view (`Grade.jsx`), `applicableStudents` is computed by filtering `orderedStudents` to only those whose route is in `currentQuestion.routes`. The grading flow only navigates through applicable students. When the teacher advances to the next question, `createExcludedScores()` is called to write excluded score records for the non-applicable students.

### Pyramid level labels (De Lange model)
The business owner uses De Lange's pyramid model with these three exact labels:
- **Niveau 1:** "Reproduceren"
- **Niveau 2:** "Wiskundig gereedschap kiezen"
- **Niveau 3:** "Generaliseren"

The database stores stable short codes (`"reproductie"`, `"verbinding"`, `"reflectie"`); the UI maps each code to its De Lange label via `PYRAMID_LEVELS` / `pyramidLabel()` in `constants.js`. This keeps the `.level-*` pill CSS classes and the `domain|level` heatmap keys keyed on the codes, so **no database migration is needed**. The label mapping is applied everywhere the level is shown: the test builder dropdown and list pill, the grading view, and the progress/overview heatmap headers. If you ever change a code, update the constant, the matching `.level-*` CSS class, and remember existing rows still hold the old code.

### Domain list
The business owner works with a fixed set of domains: **Algebra, Meetkunde, Rekenen, Statistiek**, defined as `DOMAINS` in `constants.js`. The test builder uses a fixed `<select>` of exactly these four values (no freeform input). There is no `/questions/domains` endpoint — it was removed once the domain became a fixed list.

### Grading order
On question 1, students appear alphabetically (`localeCompare('nl')`). The exact order the teacher steps through is saved as `session.student_order` when they advance past the last student on Q1 (via `saveOrderIfNeeded()` in `Grade.jsx`). From question 2 onward, `getOrderedStudents()` uses `session.student_order` if it is non-empty. Do not change this logic — it allows the teacher to control grading order on the first question.

### Previous scores panel is collapsed by default
`showPrev` initialises to `false` in `Grade.jsx`. This is intentional: the teacher should not see a student's previous question scores while grading the current question, to avoid anchoring bias. Do not initialise it to `true`.

### Tests are reusable templates
A `Test` and its `Question`s are never modified during a session. Multiple sessions can reference the same test. Grading data lives in `Score` rows tied to a `Session`, not to the test itself.

### Score semantics
`points = null` means the question has not been graded yet. `points = 0` is a valid grade meaning zero points. `excluded = true` means the question does not apply to the student's route and was never presented to the teacher. Never infer a grade from a missing score row — always create an explicit excluded or pending record.

---

## 7. Known Issues and Sensitive Areas

### Recently fixed (kept here so the fixes are not accidentally reverted)

1. **Pyramid level labels** (Section 6): the UI now shows the De Lange labels via the `pyramidLabel()` mapping in `constants.js`, while the DB keeps the short codes. Do not reintroduce the raw codes into the UI.

2. **Domain list** (Section 6): now a fixed four-option `<select>` driven by `DOMAINS` in `constants.js`; the `/questions/domains` endpoint was removed. Do not revert to freeform text.

3. **Test renaming** now works: `PUT /tests/{id}` exists and `saveName()` in `TestEdit.jsx` calls `api.updateTest()` and updates local state.

### Sensitive areas that have been touched before

- **Grading order** — previously had a bug where Q2+ used alphabetical order instead of the saved `student_order`. The fix is `getOrderedStudents()` checking `sess.student_order?.length`. Be careful not to regress this.
- **Autofocus on score input** — the score number input keeps its `autoFocus` attribute (initial mount) **and** a `scoreInputRef` + `useEffect` that re-focuses and selects the input whenever the current question/student changes, so the teacher can type immediately when switching students. Removing either breaks keyboard-first grading. The input also handles `Enter` (advance), `ArrowRight` (advance), and `ArrowLeft` (go back).
- **Resume position on page load** — `findResumePosition()` in `Grade.jsx` scans questions and applicable students to find the first entry without a completed score, so a session can be resumed after closing the browser. Do not replace this with always starting at Q1/S1.

---

## 8. How to Run Locally

### Backend

```bash
# From the project root (NOT from inside backend/)
# Relative imports require the package to be launched as a module.

cd "/path/to/rubricmaker v2"
.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

The `.venv` directory is in the project root. Activate it or use the full path as shown. Running `uvicorn` from inside `backend/` will cause `ImportError: attempted relative import beyond top-level package`.

On first startup, SQLAlchemy creates all tables automatically via `models.Base.metadata.create_all(bind=engine)` in `main.py`.

Interactive API docs: `http://localhost:8000/docs`

### Frontend

```bash
cd "/path/to/rubricmaker v2/frontend"
npm install        # first time only
npm run dev        # starts on port 3000
# or: npm start   (alias for the same command)
```

The app is at `http://localhost:3000`. Both servers must be running simultaneously.

---

## 9. Git and Deployment Notes

- The project syncs via **GitHub** between a development laptop and a Raspberry Pi 5.
- `rubricmaker.db` is listed in `.gitignore` and is **never committed**. The Pi has its own database that exists only locally. Migrations must be applied manually on the Pi if the schema changes (or the db file must be deleted and recreated).
- `frontend/node_modules/` and `frontend/dist/` are also gitignored.
- `.claude/launch.json` exists in the project root for running the Vite dev server from within Claude Code's preview panel. It points `cwd` to `frontend/` and uses `npm run dev` on port 3000.
- On the Pi in production, build the frontend with `npm run build` inside `frontend/` and serve `frontend/dist/` as a static site. Run the backend as a systemd service. See `README.md` for the full systemd unit file.
