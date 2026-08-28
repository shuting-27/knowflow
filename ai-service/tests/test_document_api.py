from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.document import (
    DocumentPrepareResponse,
    PreparedChunk,
)

client = TestClient(app)


def test_prepare_document_endpoint_success() -> None:
    service_result = DocumentPrepareResponse(
        title="FastAPI与RAG",
        model="nomic-embed-text",
        dimensions=3,
        chunk_count=1,
        chunks=[
            PreparedChunk(
                index=0,
                start=0,
                end=15,
                text="FastAPI提供AI服务。",
                embedding=[0.1, 0.2, 0.3],
            )
        ],
        latency_ms=12.5,
    )

    with patch(
        "app.main.prepare_document_service",
        new=AsyncMock(return_value=service_result),
    ):
        response = client.post(
            "/api/v1/documents/prepare",
            json={
                "title": "FastAPI与RAG",
                "content": "FastAPI提供AI服务。",
                "chunk_size": 100,
                "chunk_overlap": 20,
            },
        )

    assert response.status_code == 200

    body = response.json()
    assert body["title"] == "FastAPI与RAG"
    assert body["model"] == "nomic-embed-text"
    assert body["dimensions"] == 3
    assert body["chunk_count"] == 1
    assert len(body["chunks"]) == 1
    assert body["chunks"][0]["embedding"] == [0.1, 0.2, 0.3]


def test_prepare_document_endpoint_rejects_blank_content() -> None:
    response = client.post(
        "/api/v1/documents/prepare",
        json={
            "title": "空文档",
            "content": "   ",
            "chunk_size": 100,
            "chunk_overlap": 20,
        },
    )

    assert response.status_code == 422


def test_prepare_document_endpoint_handles_invalid_overlap() -> None:
    response = client.post(
        "/api/v1/documents/prepare",
        json={
            "title": "参数测试",
            "content": "这是一段有效的测试内容。",
            "chunk_size": 100,
            "chunk_overlap": 100,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == ("chunk_overlap必须小于chunk_size")


def test_prepare_document_endpoint_handles_service_failure() -> None:
    with patch(
        "app.main.prepare_document_service",
        new=AsyncMock(side_effect=RuntimeError("返回向量数量不一致")),
    ):
        response = client.post(
            "/api/v1/documents/prepare",
            json={
                "title": "异常测试",
                "content": "这是一段有效的测试内容。",
                "chunk_size": 100,
                "chunk_overlap": 20,
            },
        )

    assert response.status_code == 502
    assert response.json() == {"detail": "文档处理服务返回异常结果"}
