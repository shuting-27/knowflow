from typing import Any

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.analysis import (
    AnalysisServiceError,
)


async def post_analysis(
    payload: dict[str, Any],
):
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        return await client.post(
            "/api/v1/analyze",
            json=payload,
        )


async def test_analyze_knowledge_success(
    monkeypatch: Any,
) -> None:
    async def fake_analyze_knowledge(
        title: str,
        content: str,
    ) -> dict[str, Any]:
        assert title == "FastAPI"
        assert content == "测试内容"

        return {
            "summary": "这是测试摘要。",
            "tags": [
                "FastAPI",
                "Python",
            ],
            "model": "qwen3:1.7b",
            "latency_ms": 100.0,
        }

    monkeypatch.setattr(
        "app.main.analyze_knowledge",
        fake_analyze_knowledge,
    )

    response = await post_analysis(
        {
            "title": "FastAPI",
            "content": "测试内容",
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["summary"] == "这是测试摘要。"
    assert data["tags"] == [
        "FastAPI",
        "Python",
    ]


async def test_reject_empty_analysis_content() -> None:
    response = await post_analysis(
        {
            "title": "FastAPI",
            "content": "",
        }
    )

    assert response.status_code == 422


async def test_analysis_service_failure(
    monkeypatch: Any,
) -> None:
    async def fake_analyze_knowledge(
        title: str,
        content: str,
    ) -> dict[str, Any]:
        raise AnalysisServiceError("生成模型不可用")

    monkeypatch.setattr(
        "app.main.analyze_knowledge",
        fake_analyze_knowledge,
    )

    response = await post_analysis(
        {
            "title": "FastAPI",
            "content": "测试内容",
        }
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "生成模型不可用"
