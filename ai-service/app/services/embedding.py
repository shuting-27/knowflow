from time import perf_counter
from typing import Any

import httpx

from app.core.config import settings


class EmbeddingServiceError(Exception):
    pass


async def generate_embeddings(
    texts: list[str],
    model: str | None = None,
) -> dict[str, Any]:
    selected_model = model or settings.ollama_embedding_model

    started_at = perf_counter()

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(settings.ollama_timeout_seconds)
        ) as client:
            response = await client.post(
                (f"{settings.ollama_base_url}/api/embed"),
                json={
                    "model": selected_model,
                    "input": texts,
                    "truncate": True,
                    "keep_alive": (settings.ollama_keep_alive),
                },
            )

            response.raise_for_status()

    except httpx.TimeoutException as error:
        raise EmbeddingServiceError("Embedding请求超时") from error

    except httpx.HTTPError as error:
        raise EmbeddingServiceError(f"Ollama Embedding请求失败: {error}") from error

    try:
        data = response.json()
        embeddings = data["embeddings"]

        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ValueError("Embedding数量与输入数量不一致")

        dimensions = len(embeddings[0]) if embeddings else 0

        if dimensions == 0:
            raise ValueError("Ollama返回了空向量")

        if any(len(embedding) != dimensions for embedding in embeddings):
            raise ValueError("Embedding维度不一致")

    except (
        KeyError,
        TypeError,
        ValueError,
    ) as error:
        raise EmbeddingServiceError(f"无法解析Embedding结果: {error}") from error

    return {
        "model": selected_model,
        "count": len(embeddings),
        "dimensions": dimensions,
        "embeddings": embeddings,
        "latency_ms": round(
            (perf_counter() - started_at) * 1000,
            2,
        ),
    }
