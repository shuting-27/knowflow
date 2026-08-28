from unittest.mock import AsyncMock, patch

import pytest

from app.schemas.document import DocumentPrepareRequest
from app.services.document import prepare_document


@pytest.mark.asyncio
async def test_prepare_document_success() -> None:
    request = DocumentPrepareRequest(
        title="FastAPI与RAG",
        content="FastAPI负责提供AI服务，RAG负责检索增强生成。",
        chunk_size=100,
        chunk_overlap=20,
    )

    embedding_result = {
        "model": "nomic-embed-text",
        "dimensions": 3,
        "embeddings": [[0.1, 0.2, 0.3]],
    }

    with patch(
        "app.services.document.generate_embeddings",
        new=AsyncMock(return_value=embedding_result),
    ) as mocked_generate:
        result = await prepare_document(request)

    assert result.title == "FastAPI与RAG"
    assert result.model == "nomic-embed-text"
    assert result.dimensions == 3
    assert result.chunk_count == 1
    assert result.chunks[0].index == 0
    assert result.chunks[0].start == 0
    assert result.chunks[0].text == request.content
    assert result.chunks[0].embedding == [0.1, 0.2, 0.3]
    assert result.latency_ms >= 0

    mocked_generate.assert_awaited_once_with([request.content])


@pytest.mark.asyncio
async def test_prepare_long_document_in_batches() -> None:
    content = "第一段介绍FastAPI。第二段介绍RAG检索增强生成。" * 20

    request = DocumentPrepareRequest(
        title="长文档",
        content=content,
        chunk_size=100,
        chunk_overlap=20,
        max_chunks=10,
    )

    async def fake_generate_embeddings(
        texts: list[str],
    ) -> dict[str, object]:
        return {
            "model": "nomic-embed-text",
            "dimensions": 3,
            "embeddings": [[float(index), 0.2, 0.3] for index in range(len(texts))],
        }

    mocked_generate = AsyncMock(
        side_effect=fake_generate_embeddings,
    )

    with patch(
        "app.services.document.generate_embeddings",
        new=mocked_generate,
    ):
        result = await prepare_document(request)

    assert 1 < result.chunk_count <= 10
    assert len(result.chunks) == result.chunk_count
    assert result.chunks[0].embedding == [0.0, 0.2, 0.3]
    assert result.chunks[-1].embedding == [
        float(result.chunk_count - 1),
        0.2,
        0.3,
    ]

    for previous, current in zip(
        result.chunks,
        result.chunks[1:],
        strict=False,
    ):
        assert current.start < previous.end

    mocked_generate.assert_awaited_once()
    embedded_texts = mocked_generate.await_args.args[0]

    assert len(embedded_texts) == result.chunk_count
    assert embedded_texts == [chunk.text for chunk in result.chunks]


@pytest.mark.asyncio
async def test_reject_embedding_count_mismatch() -> None:
    request = DocumentPrepareRequest(
        title="数量校验",
        content="测试文档内容。",
        chunk_size=100,
        chunk_overlap=20,
    )

    embedding_result = {
        "model": "nomic-embed-text",
        "dimensions": 3,
        "embeddings": [],
    }

    with patch(
        "app.services.document.generate_embeddings",
        new=AsyncMock(return_value=embedding_result),
    ):
        with pytest.raises(
            RuntimeError,
            match="Embedding数量与文本分块数量不一致",
        ):
            await prepare_document(request)


@pytest.mark.asyncio
async def test_reject_invalid_overlap() -> None:
    request = DocumentPrepareRequest(
        title="参数校验",
        content="测试文档内容。",
        chunk_size=100,
        chunk_overlap=100,
    )

    with pytest.raises(
        ValueError,
        match="chunk_overlap必须小于chunk_size",
    ):
        await prepare_document(request)
