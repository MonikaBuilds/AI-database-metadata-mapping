from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.databases import router as database_router


app = FastAPI(
    title="AI Database Metadata Mapping Dashboard",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "service": "AI Database Metadata Mapping Dashboard",
    }


app.include_router(
    database_router,
    prefix="/api/v1",
)