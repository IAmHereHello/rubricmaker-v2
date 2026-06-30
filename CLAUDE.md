# Rubricgrader — Codebase Notes

## Stack
- **Backend**: FastAPI + SQLAlchemy + SQLite (`backend/rubricgrader.db` on the Pi)
- **Frontend**: React 18 + Vite, under `frontend/`
- **Deployment**: Raspberry Pi; served over HTTPS via Tailscale cert (see `update.sh`)

## Database migration safety — READ BEFORE TOUCHING models.py

The production database lives at `backend/rubricgrader.db` on the Raspberry Pi and contains live student data that cannot be recreated automatically.

**Before making any schema changes, assess whether they would break the existing database. Warn the user if migration steps are needed — do not proceed silently.**

### Safe: New tables
`models.Base.metadata.create_all()` in `main.py` creates new tables automatically. No extra steps needed.

### Requires migration: New columns
Adding a column to an existing SQLAlchemy model will **not** be reflected in the existing database without an explicit migration.

You must add an `ALTER TABLE` statement to `_migrate_db()` in `backend/main.py`:

```python
"ALTER TABLE tablename ADD COLUMN column_name TYPE",
```

`_migrate_db()` wraps each statement in try/except (ignoring "column already exists" errors), so it is safe to re-run on an already-migrated database.

**Warn the user:** tell them they need to restart the backend service on the Pi after deploying so `_migrate_db()` runs.

### Dangerous: Renaming or removing columns
SQLite has very limited support for renaming/removing columns (no `ALTER COLUMN`; `DROP COLUMN` only available in SQLite ≥ 3.35). These operations require creating a replacement table and copying data.

**Do not proceed** with such changes without first:
1. Warning the user explicitly that this is a destructive schema change
2. Telling them to back up `backend/rubricgrader.db` before deploying
3. Providing manual SQL migration steps or a migration script

### Changing a column's type or constraints
SQLite does not enforce column types at the database level, but SQLAlchemy schemas and Python code may. Treat type changes the same as renames: warn the user and provide migration steps.

### When in doubt
If a schema change touches an existing table, pause before writing code and tell the user:
- What will break without migration
- What steps they need to take (backup, ALTER TABLE, service restart)
- Whether the change is destructive or reversible
