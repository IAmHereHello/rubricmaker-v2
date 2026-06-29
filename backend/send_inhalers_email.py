#!/usr/bin/env python3
"""
Weekly inhaler email — lists students who need to retake a test.
Run every Monday at 08:00 via cron (see README for setup).
Reads credentials from .env in the project root.
"""

import json
import os
import smtplib
import sqlite3
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH      = PROJECT_ROOT / "rubricmaker.db"
TO_EMAIL     = "ma@academie-tien.nl"


def _load_dotenv():
    env_file = PROJECT_ROOT / ".env"
    if not env_file.exists():
        return
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())


def _get_inhalers(conn):
    cur = conn.cursor()
    cur.execute(
        "SELECT id, test_id, class_name, created_at, student_order, dismissed_inhalers "
        "FROM sessions"
    )
    sessions = cur.fetchall()

    result = []
    for sess_id, test_id, class_name, created_at, order_json, dismissed_json in sessions:
        student_order = json.loads(order_json or "[]")
        dismissed     = set(json.loads(dismissed_json or "[]"))

        if not student_order:
            continue  # Q1 never started — nothing graded yet, not a real session to report

        cur.execute("SELECT name FROM tests WHERE id = ?", (test_id,))
        test_row = cur.fetchone()
        if not test_row:
            continue
        test_name = test_row[0]

        cur.execute("SELECT routes FROM questions WHERE test_id = ?", (test_id,))
        applicable_routes = set(
            r
            for (routes_json,) in cur.fetchall()
            for r in json.loads(routes_json or "[]")
        )
        if not applicable_routes:
            continue

        cur.execute(
            "SELECT id, name, route FROM students WHERE class_name = ?",
            (class_name,)
        )
        in_order = set(student_order)
        absent = [
            {"name": name, "route": route}
            for sid, name, route in cur.fetchall()
            if sid not in in_order
            and sid not in dismissed
            and route in applicable_routes
        ]

        if absent:
            result.append({
                "test_name":  test_name,
                "class_name": class_name,
                "created_at": created_at,
                "students":   absent,
            })

    return result


def _format_date(raw):
    try:
        return datetime.fromisoformat(str(raw)).strftime("%-d %b %Y")
    except Exception:
        return str(raw)[:10]


def _build_body(inhalers):
    total = sum(len(s["students"]) for s in inhalers)
    word  = "leerling heeft" if total == 1 else f"{total} leerlingen hebben"
    lines = [
        "Goedemorgen,",
        "",
        f"De volgende {word} nog een toets in te halen:",
        "",
    ]
    for sess in inhalers:
        lines.append(
            f"{sess['test_name']}  ·  Klas {sess['class_name']}  ·  {_format_date(sess['created_at'])}"
        )
        for s in sess["students"]:
            lines.append(f"  – {s['name']} ({s['route']})")
        lines.append("")
    lines.append("-- Rubricmaker")
    return "\n".join(lines)


def main():
    _load_dotenv()

    gmail_user     = os.environ.get("GMAIL_USER", "").strip()
    gmail_password = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
    if not gmail_user or not gmail_password:
        raise SystemExit("Fout: stel GMAIL_USER en GMAIL_APP_PASSWORD in via .env")

    if not DB_PATH.exists():
        raise SystemExit(f"Fout: database niet gevonden op {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    try:
        inhalers = _get_inhalers(conn)
    finally:
        conn.close()

    if not inhalers:
        print("Geen inhalers deze week. Geen e-mail verstuurd.")
        return

    total   = sum(len(s["students"]) for s in inhalers)
    subject = (
        f"Inhalers — {total} {'leerling' if total == 1 else 'leerlingen'} te herkansen"
    )
    body = _build_body(inhalers)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = gmail_user
    msg["To"]      = TO_EMAIL
    msg.attach(MIMEText(body, "plain", "utf-8"))

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, TO_EMAIL, msg.as_string())

    print(f"E-mail verstuurd naar {TO_EMAIL} ({total} inhaler(s)).")


if __name__ == "__main__":
    main()
