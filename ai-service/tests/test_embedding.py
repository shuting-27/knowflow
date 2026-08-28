import json
from typing import Any

from httpx import (
    ASGITransport,
    AsyncClient,
    MockTransport,
    Request,
    Response,
)

from app.main import app
from app.services.embedding import (
    EmbeddingServiceError,
    generate_embeddings,
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
        input_type: str = "query",
    ) -> dict[str, Any]:
        assert texts == ["测试文本"]
        assert input_type == "query"

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
        input_type: str = "query",
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


async def test_query_embedding_adds_search_query_prefix(
    monkeypatch: Any,
) -> None:
    captured_payload: dict[str, Any] = {}

    def handler(request: Request) -> Response:
        captured_payload.update(json.loads(request.content))

        return Response(
            status_code=200,
            json={
                "embeddings": [
                    [0.1, 0.2, 0.3],
                ],
            },
        )

    def fake_async_client(
        *args: Any,
        **kwargs: Any,
    ) -> AsyncClient:
        return AsyncClient(transport=MockTransport(handler))

    monkeypatch.setattr(
        "app.services.embedding.httpx.AsyncClient",
        fake_async_client,
    )

    result = await generate_embeddings(
        ["如何执行向量检索？"],
        input_type="query",
    )

    assert captured_payload["input"] == ["search_query: 如何执行向量检索？"]
    assert result["count"] == 1
    assert result["dimensions"] == 3


async def test_document_embedding_adds_search_document_prefix(
    monkeypatch: Any,
) -> None:
    captured_payload: dict[str, Any] = {}

    def handler(request: Request) -> Response:
        captured_payload.update(json.loads(request.content))

        return Response(
            status_code=200,
            json={
                "embeddings": [
                    [0.1, 0.2, 0.3],
                ],
            },
        )

    def fake_async_client(
        *args: Any,
        **kwargs: Any,
    ) -> AsyncClient:
        return AsyncClient(transport=MockTransport(handler))

    monkeypatch.setattr(
        "app.services.embedding.httpx.AsyncClient",
        fake_async_client,
    )

    result = await generate_embeddings(
        ["KnowFlow使用pgvector保存向量。"],
        input_type="document",
    )

    assert captured_payload["input"] == [
        "search_document: KnowFlow使用pgvector保存向量。"
    ]
    assert result["count"] == 1
    assert result["dimensions"] == 3


async def test_reject_invalid_embedding_input_type() -> None:
    response = await post_embedding(
        {
            "texts": ["测试文本"],
            "input_type": "invalid",
        }
    )

    assert response.status_code == 422
