"""Run Rubricmaker as one local program (used by the Mac installer in mac/).

Serves the built frontend (frontend/dist) and the API under /api from a single
process, so no nginx or Vite dev server is needed. The Raspberry Pi setup does
not use this file and keeps working as before.

The database is created in the current working directory (see database.py),
so start this from the folder that should hold rubricmaker.db.

    python -m backend.local_server --port 8765 --port-file port.txt
"""
import argparse
import socket
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from .main import app as api_app

DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


class SPAStaticFiles(StaticFiles):
    """Static files with a fallback to index.html, so React Router URLs work on reload."""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api", api_app)
app.mount("/", SPAStaticFiles(directory=DIST_DIR, html=True), name="frontend")


def find_free_port(start: int, attempts: int = 30) -> int:
    for port in range(start, start + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise SystemExit(f"Geen vrije poort gevonden tussen {start} en {start + attempts - 1}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765, help="first port to try")
    parser.add_argument("--port-file", help="write the chosen port to this file")
    args = parser.parse_args()

    port = find_free_port(args.port)
    if args.port_file:
        Path(args.port_file).write_text(str(port))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
