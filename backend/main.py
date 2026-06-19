from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine
from . import models
from .routers import students, tests, questions, sessions, scores, progress

models.Base.metadata.create_all(bind=engine)

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


@app.get("/")
def root():
    return {"status": "ok", "app": "Rubricmaker API"}
