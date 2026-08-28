from typing import Any

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.embedding import (
    EmbeddingServiceError,
)


async def post_embedding(
    payload: dict[str, Any],
):
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        return await client.post(
            "/api/v1/embeddings",
            json=payload,
        )


async def test_generate_embeddings_success(
    monkeypatch: Any,
) -> None:
    async def fake_generate_embeddings(
        texts: list[str],
        model: str | None = None,
    ) -> dict[str, Any]:
        assert texts == ["测试文本"]

        return {
            "model": (model or "nomic-embed-text"),
            "count": 1,
            "dimensions": 3,
            "embeddings": [[0.1, 0.2, 0.3]],
            "latency_ms": 10.5,
        }

    monkeypatch.setattr(
        "app.main.generate_embeddings",
        fake_generate_embeddings,
    )

    response = await post_embedding(
        {
            "texts": ["测试文本"],
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["count"] == 1
    assert data["dimensions"] == 3
    assert data["embeddings"] == [[0.1, 0.2, 0.3]]


async def test_reject_empty_embedding_text() -> None:
    response = await post_embedding(
        {
            "texts": [""],
        }
    )

    assert response.status_code == 422


async def test_embedding_service_failure(
    monkeypatch: Any,
) -> None:
    async def fake_generate_embeddings(
        texts: list[str],
        model: str | None = None,
    ) -> dict[str, Any]:
        raise EmbeddingServiceError("Ollama不可用")

    monkeypatch.setattr(
        "app.main.generate_embeddings",
        fake_generate_embeddings,
    )

    response = await post_embedding(
        {
            "texts": ["测试文本"],
        }
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Ollama不可用"
