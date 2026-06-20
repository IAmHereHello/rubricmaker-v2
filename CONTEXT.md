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
- View per-session reports (student-level and class-level score matrix).
- View per-student progress-over-time charts (line charts by domain and pyramid level).
- View radar charts per student (with multi-student overlay) and per class (one line per route).
- Export any report to PDF.

The app is designed for a single user with no authentication. All text in the UI is Dutch.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy (ORM), SQLite (database file `rubricmaker.db`) |
| Backend schema validation | Pydantic v2 |
| Frontend | React 18, React Router v6, Axios, Vite 5, Recharts (charts), jsPDF + html2canvas (PDF export) |
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
id                      Integer  PK
test_id                 Integer  FK → tests.id
order                   Integer  not null, default 0  (display order within the test)
description             String   not null
answer                  String   default ""  (model answer shown during grading)
max_score               Integer  not null
routes                  JSON     default []  — subset of ["oranje", "geel", "blauw"]
domain                  String   default ""  — one of: "Algebra" | "Meetkunde" | "Rekenen" | "Statistiek"
pyramid_level           String   not null    — one of: "reproductie" | "verbinding" | "reflectie"
learning_goal           String   nullable    — goal name/label; groups questions under the same named goal
learning_goal_threshold Integer  nullable    — minimum points required to achieve this goal (null = not a goal question)
```
**`pyramid_level`** stores stable short codes; the UI displays the De Lange labels via a code→label mapping (see Section 6). The codes are never shown to the user directly.

**Learning goals:** a question is a learning goal question only when *both* `learning_goal` and `learning_goal_threshold` are set. Questions sharing the same `learning_goal` string are grouped into one logical goal. See Section 6 for achievement logic.

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
| POST | `/students/import` | Bulk import: body `{ class_name, route, names: [str] }`, returns `{ created: N }` |
| DELETE | `/students/class/{class_name}` | Delete all students in a class (cascades to scores); returns `{ deleted: N }` |
| PUT | `/students/{id}` | Update a student (full replace) |
| DELETE | `/students/{id}` | Delete a student (cascades to scores) |

**Router order matters:** `POST /students/import` and `DELETE /students/class/{class_name}` are registered before `DELETE /students/{id}` so the literal path segments are not captured as `{id}`. This is handled correctly in the current code.

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
| GET | `/sessions` | List all sessions, newest first; each item includes `test_name`, `graded_count`, and `total_count` (non-excluded scores) |
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

### `/reports` — `backend/routers/reports.py`
| Method | Path | Description |
|---|---|---|
| GET | `/reports/session/{session_id}` | Per-session report: question list (includes `learning_goal` and `learning_goal_threshold`), student list, full score matrix keyed by `"{student_id}|{question_id}"`, and per-question class averages (applicable students only) |
| GET | `/reports/student/{student_id}/timeline` | Per-student progress over time: sessions sorted chronologically, each with `by_domain` and `by_level` breakdowns (pct = null if no applicable questions in that session for that axis) |
| GET | `/reports/student/{student_id}/radar` | Radar data for one student: `domain_scores` and `level_scores` arrays, each with `scored`, `max`, and `pct` (null = no applicable questions on that axis) |
| GET | `/reports/class/{class_name}/radar` | Class radar: per-route aggregated `domain_scores` and `level_scores` (same structure as student radar) |

All report endpoints apply the same route-exclusion logic as the rest of the app: excluded and ungraded scores are ignored; axes with zero applicable questions yield `pct: null`, not `pct: 0`.

### In-progress session detection
A session is considered **in-progress** (shown in "Lopende sessies") when `total_count === 0` (just created, Q1 not yet started) or `graded_count < total_count` (grading underway but not finished). A session where `graded_count === total_count > 0` is complete and no longer shown. `SessionListOut` in `schemas.py` carries the extra fields; the individual-session endpoints still use `SessionOut`.

### Schema migrations (`backend/main.py`)
`_migrate_db()` runs at every startup and issues `ALTER TABLE ... ADD COLUMN` statements for columns added after the initial schema (`learning_goal TEXT`, `learning_goal_threshold INTEGER`). Each statement is wrapped in try/except so it is safely skipped if the column already exists. This means **no manual migration is needed on the Pi** for these columns — restarting the backend is sufficient.

---

## 5. Frontend Structure

Source: `frontend/src/App.jsx`. Router is `BrowserRouter`. All API calls go through `frontend/src/api.js` which uses axios with `baseURL: '/api'`.

### Pages

| React component | Route | Description |
|---|---|---|
| `Students.jsx` | `/students` | List students grouped by class; inline add/edit form; bulk import (textarea, 1 name per line, with interactive name-disambiguation on conflict); per-class delete with time+keyword confirmation; links to class overview and student progress |
| `TestList.jsx` | `/tests` | List tests with create-and-redirect form |
| `TestEdit.jsx` | `/tests/:id/edit` | Add/edit/delete/reorder questions for a test; rename test via pencil; domain and pyramid level are fixed `<select>` dropdowns; optional "Leerdoel" text input (with datalist autocomplete from other goal names in the test) + "Drempel" number input; both must be set together or both left empty |
| `SessionNew.jsx` | `/sessions/new` | Shows in-progress sessions ("Lopende sessies") at the top with resume links; below that, the form to start a new session (pick test and class) |
| `Grade.jsx` | `/sessions/:id/grade` | Main grading view (see Section 6 for flow details) |
| `StudentProgress.jsx` | `/students/:id/progress` | Domain × pyramid heatmap + per-session score table for one student; "Rapport & Radar" button links to `/students/:id/report`; session rows are clickable and navigate to the session report with the student pre-selected (`?student=`) |
| `ClassOverview.jsx` | `/classes/:class_name/overview` | Route-filtered class heatmap; route selector buttons at top; "Radardiagram" button links to `/classes/:class_name/radar` |
| `ReportHome.jsx` | `/reports` | Lists all sessions (newest first) with test name, class, date, and link to each session report |
| `SessionReport.jsx` | `/reports/session/:id` | Per-session report with "Per leerling" tab (student dropdown + per-question score table) and "Klassenoverzicht" tab (question × student matrix); excluded questions shown as "n.v.t."; PDF export; pre-selects a student from `?student=` query param; shows learning goal achievement (see Section 6) |
| `StudentReport.jsx` | `/students/:id/report` | Two tabs: "Voortgang over tijd" (line charts per domain / per pyramid level across sessions) and "Radardiagram" (domain radar + level radar with multi-student overlay selector); PDF export; session rows in the timeline table are clickable and navigate to the session report with the student pre-selected |
| `ClassRadar.jsx` | `/classes/:class_name/radar` | Domain radar + level radar, one line per route (oranje/geel/blauw) using `ROUTE_COLORS`; PDF export |

`/` redirects to `/students`.

### Shared Components

- `components/RouteBadge.jsx` — renders a coloured badge (`badge-oranje`, `badge-geel`, `badge-blauw`) for a route string.

### Shared Constants

- `constants.js` — single source of truth for all shared UI constants:
  - `PYRAMID_LEVELS` — array of `{ value, label }` (value = stored DB code, label = De Lange display label). Used by `TestEdit.jsx`, `Grade.jsx`, `StudentProgress.jsx`, `ClassOverview.jsx`.
  - `pyramidLabel(value)` — helper to look up a display label from a stored code.
  - `DOMAINS` — fixed four-domain list `['Algebra', 'Meetkunde', 'Rekenen', 'Statistiek']`.
  - `LEVELS` — `PYRAMID_LEVELS.map(l => l.value)`, convenience array of the three stored codes in order.
  - `LEVEL_LABELS` — `{ reproductie: 'Reproduceren', ... }`, derived from `PYRAMID_LEVELS`. Used by the report pages.
  - `ROUTE_COLORS` — `{ oranje: '#e07820', geel: '#a08b00', blauw: '#1a6ecc' }`, consistent colours for recharts lines.
  - `STUDENT_COLORS` — array of 7 distinct colours for multi-student radar overlays.
- `utils/exportPDF.js` — `exportPDF(element, filename)` captures a DOM element with `html2canvas` (scale 2) and writes it to a multi-page A4 PDF using `jspdf`.

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

### Grading order — Q1 type-to-select
Question 1 uses a **type-to-select** flow instead of alphabetical stepping. `Grade.jsx` detects "Q1 mode" on load via `shouldEnterQ1Mode()` and renders a completely different UI: a text input with `<datalist>` autocomplete suggesting all students in the class not yet entered. The teacher picks up each paper, types the student name, enters their Q1 score, and presses Enter/clicks "Opslaan →". Each submission appends the student ID to `session.student_order` (incremental `PUT /sessions/{id}/order` calls) and saves the score. The input then clears and re-focuses for the next student.

Q1 mode ends when:
- All students in the class have been entered (auto-detected), or
- The teacher clicks **"Einde van de stapel"** (requires at least one student entered).

Students not entered during Q1 are never added to `student_order` and are excluded from the session entirely. Once Q1 mode ends, `student_order` is final. From Q2 onward, `getOrderedStudents()` maps `session.student_order` to the student objects — the same fixed-order next/previous flow as before.

**Resume detection** (`shouldEnterQ1Mode`): if `student_order` is empty → Q1 mode. If any Q2+ question has a score in `scoreMap` → Q1 is done, regular resume. For single-question tests: Q1 mode until all ordered students have a non-null score. This avoids a DB migration for a "Q1 complete" flag.

### Route-skip behavior
When advancing to the next question — either via **"Volgende vraag"** in the regular flow (`handleNextQuestion`) or when Q1 mode ends (`finishQ1`) — the grading view walks forward past any questions whose `routes` list excludes **every** student in the current stack (`orderedStudents`). For each skipped question, `createExcludedScores()` is called immediately to write excluded-score rows for all stacked students. A Dutch notice banner is then shown for 5 seconds identifying which question(s) were skipped and which routes were missing.

This means the teacher never lands on a dead-end question with zero applicable students. The skip logic uses `orderedStudents` (the Q1-built stack), so students outside the stack are correctly ignored.

### Learning goals
A question becomes a **learning goal question** when both `learning_goal` (a free-text name) and `learning_goal_threshold` (minimum points) are set. Neither field alone is meaningful — the UI enforces that both are filled or both are empty.

**Grouping:** questions that share the same `learning_goal` string (exact match) belong to the same logical goal. The denominator Y in "X van Y leerdoelen behaald" is the number of *unique goal names* that have at least one applicable question for the student.

**Achievement rule:** a named group is **achieved** when *every* applicable question in the group has a non-null score that is ≥ its `learning_goal_threshold`. Excluded questions (route mismatch) are not counted toward any group; a group with zero applicable questions is not counted at all.

**Display:**
- `SessionReport.jsx` student view: shows "X van Y leerdoelen behaald" next to the total score; each goal question row shows a `{name} ≥{threshold}` badge and a ✓/✗ indicator.
- `SessionReport.jsx` class view: per-student goal counts (`X/Y LG`) in column headers; class average above the table; ✓/✗ per student per goal question.
- `TestEdit.jsx` question list: a blue badge shows `{name} ≥{threshold}` when a goal is configured.

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

4. **Route-skip** (Section 6): `handleNextQuestion` and `finishQ1` now walk past questions with zero applicable students in the stack, create excluded-score rows for them, and show a 5-second Dutch banner. Before this fix, the grading view dead-ended on such questions.

5. **"Vorige leerling" dead-click** (`Grade.jsx`): the Back button was disabled only when `sIdx === 0 && qIdx === 0`. At `sIdx === 0, qIdx > 0` it was enabled but `handlePrev` did nothing because it only calls `setSIdx` when `sIdx > 0`. Fixed by disabling the button whenever `sIdx === 0`.

6. **Session report ghost students** (`backend/routers/reports.py`): `GET /reports/session/{id}` previously returned all students in `session.class_name`, including those the teacher skipped during Q1 ("Einde van de stapel"). Those students appeared in the class matrix as all-dash rows. Fixed by querying only students whose IDs are in `session.student_order`, preserving session order. Falls back to all class students (alphabetical) only when `student_order` is empty.

7. **Student name uniqueness** (`Students.jsx`): student names must be globally unique (case-insensitive) across all classes, because names are used as display identifiers in session/report views. The DB `id` column is always the true unique key for internal references; the name-uniqueness constraint is enforced entirely in the frontend. When a duplicate is detected (on single-add save or on bulk import), a disambiguation flow prompts for one or more last-name initials, building a suffix appended as e.g. `"Jan B."`. The flow loops until the resolved name is unique against both the existing DB and the current import batch.

### Duplicate-name disambiguation (Students.jsx)

- `resolvedName(original, suffix)` — builds the display name: `"Jan B."` when suffix is `"B"`, `"Jan"` when suffix is empty.
- `buildExistingNames(students, excludeId)` — returns a `Set` of lowercased names, excluding `excludeId` when editing an existing student.
- `findConflicts(items, existingNames)` — checks each item's resolved name against the DB set and against other items in the same batch; returns indices of conflicting items.
- **Single add**: `save()` detects a conflict and activates `singleDisambig` state `{ base, suffix, input }`. Each confirmation accumulates `suffix += input` and re-checks. "Terug" closes disambiguation and returns to the edit form.
- **Bulk import**: `doImport()` runs `findConflicts` on all parsed names; if any conflict, sets `importDisambig` with `items` and `needsDisambig` flags. `confirmImportDisambig()` accumulates suffixes for all flagged items and re-runs `findConflicts`; repeats until clean, then calls `executeImport`.

### Sensitive areas that have been touched before

- **Grading order** — Q1 now uses type-to-select (see Section 6). `shouldEnterQ1Mode()` in `Grade.jsx` detects whether to render the Q1 input UI or the regular flow. The original bug (Q2+ used alphabetical instead of saved order) is still fixed via `getOrderedStudents()` checking `sess.student_order?.length`. Do not regress either.
- **Autofocus on score input** — the score number input uses a `scoreInputRef` + `useEffect` to focus and select the input whenever the current question/student changes (including on first render of the regular flow), so the teacher can type immediately. The input does **not** have a bare `autoFocus` attribute; the ref+effect is the single focus mechanism. Removing it breaks keyboard-first grading. The input also handles `Enter` (advance), `ArrowRight` (advance), and `ArrowLeft` (go back).
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
