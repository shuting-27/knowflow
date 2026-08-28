from time import perf_counter
from typing import Any

import httpx

from app.core.config import settings


def _model_installed(
    installed_models: list[str],
    required_model: str,
) -> bool:
    return any(
        model == required_model or model.startswith(f"{required_model}:")
        for model in installed_models
    )


async def check_ollama_health() -> dict[str, Any]:
    started_at = perf_counter()

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            response.raise_for_status()

        data = response.json()

        installed_models = [
            str(model.get("name", ""))
            for model in data.get("models", [])
            if model.get("name")
        ]

        chat_model_ready = _model_installed(
            installed_models,
            settings.ollama_chat_model,
        )

        embedding_model_ready = _model_installed(
            installed_models,
            settings.ollama_embedding_model,
        )

        service_ready = chat_model_ready and embedding_model_ready

        return {
            "status": ("healthy" if service_ready else "degraded"),
            "available": True,
            "chat_model": {
                "name": settings.ollama_chat_model,
                "ready": chat_model_ready,
            },
            "embedding_model": {
                "name": settings.ollama_embedding_model,
                "ready": embedding_model_ready,
            },
            "installed_models": installed_models,
            "latency_ms": round(
                (perf_counter() - started_at) * 1000,
                2,
            ),
            "error": None,
        }

    except (
        httpx.HTTPError,
        ValueError,
        TypeError,
    ) as error:
        return {
            "status": "unavailable",
            "available": False,
            "chat_model": {
                "name": settings.ollama_chat_model,
                "ready": False,
            },
            "embedding_model": {
                "name": settings.ollama_embedding_model,
                "ready": False,
            },
            "installed_models": [],
            "latency_ms": round(
                (perf_counter() - started_at) * 1000,
                2,
            ),
            "error": str(error),
        }
