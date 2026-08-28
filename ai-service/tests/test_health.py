from typing import Any

from httpx import ASGITransport, AsyncClient

from app.main import app


async def get(path: str):
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        return await client.get(path)


def healthy_ollama_response() -> dict[str, Any]:
    return {
        "status": "healthy",
        "available": True,
        "chat_model": {
            "name": "qwen3:1.7b",
            "ready": True,
        },
        "embedding_model": {
            "name": "nomic-embed-text",
            "ready": True,
        },
        "installed_models": [
            "qwen3:1.7b",
            "nomic-embed-text:latest",
        ],
        "latency_ms": 12.5,
        "error": None,
    }


async def test_root_endpoint() -> None:
    response = await get("/")

    assert response.status_code == 200

    data = response.json()

    assert data["service"] == "KnowFlow AI Service"
    assert data["version"] == "0.1.0"
    assert data["docs"] == "/docs"


async def test_health_endpoint_when_ollama_is_healthy(
    monkeypatch: Any,
) -> None:
    async def fake_health_check() -> dict[str, Any]:
        return healthy_ollama_response()

    monkeypatch.setattr(
        "app.main.check_ollama_health",
        fake_health_check,
    )

    response = await get("/api/v1/health")

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "healthy"
    assert data["dependencies"]["ollama"]["available"] is True
    assert data["dependencies"]["ollama"]["chat_model"]["ready"] is True


async def test_health_endpoint_when_ollama_is_unavailable(
    monkeypatch: Any,
) -> None:
    async def fake_health_check() -> dict[str, Any]:
        return {
            "status": "unavailable",
            "available": False,
            "chat_model": {
                "name": "qwen3:1.7b",
                "ready": False,
            },
            "embedding_model": {
                "name": "nomic-embed-text",
                "ready": False,
            },
            "installed_models": [],
            "latency_ms": 5000.0,
            "error": "Connection refused",
        }

    monkeypatch.setattr(
        "app.main.check_ollama_health",
        fake_health_check,
    )

    response = await get("/api/v1/health")

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "degraded"
    assert data["dependencies"]["ollama"]["available"] is False
