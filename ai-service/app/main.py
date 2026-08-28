from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.services.ollama import check_ollama_health

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=("KnowFlow 文档处理、检索、重排序、RAG生成与评测服务"),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
    }


@app.get("/api/v1/health")
async def health() -> dict[str, object]:
    ollama = await check_ollama_health()

    overall_status = "healthy" if ollama["status"] == "healthy" else "degraded"

    return {
        "status": overall_status,
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "timestamp": datetime.now(UTC).isoformat(),
        "dependencies": {
            "ollama": ollama,
        },
    }
