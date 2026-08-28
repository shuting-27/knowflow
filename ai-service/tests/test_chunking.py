import pytest

from app.services.chunking import (
    ChunkingError,
    normalize_text,
    split_text_into_chunks,
)


def test_normalize_windows_newlines() -> None:
    result = normalize_text("第一行\r\n第二行\r第三行")

    assert result == "第一行\n第二行\n第三行"


def test_empty_text_returns_no_chunks() -> None:
    assert split_text_into_chunks("   ") == []


def test_short_text_returns_single_chunk() -> None:
    chunks = split_text_into_chunks(
        "这是一段较短的知识内容。",
        chunk_size=100,
        overlap=20,
    )

    assert len(chunks) == 1
    assert chunks[0].index == 0
    assert chunks[0].text == "这是一段较短的知识内容。"
    assert chunks[0].start == 0


def test_long_text_creates_overlapping_chunks() -> None:
    text = "".join(f"第{index}段测试内容。" for index in range(100))

    chunks = split_text_into_chunks(
        text,
        chunk_size=120,
        overlap=20,
        max_chunks=20,
    )

    assert len(chunks) > 1

    for previous, current in zip(
        chunks,
        chunks[1:],
        strict=False,
    ):
        assert current.index == previous.index + 1
        assert current.start < previous.end
        assert current.end > current.start


def test_respects_max_chunks() -> None:
    chunks = split_text_into_chunks(
        "测试文本。" * 1000,
        chunk_size=100,
        overlap=20,
        max_chunks=3,
    )

    assert len(chunks) == 3


@pytest.mark.parametrize(
    ("chunk_size", "overlap", "max_chunks"),
    [
        (99, 20, 10),
        (100, -1, 10),
        (100, 100, 10),
        (100, 101, 10),
        (100, 20, 0),
    ],
)
def test_reject_invalid_chunk_parameters(
    chunk_size: int,
    overlap: int,
    max_chunks: int,
) -> None:
    with pytest.raises(ChunkingError):
        split_text_into_chunks(
            "测试内容",
            chunk_size=chunk_size,
            overlap=overlap,
            max_chunks=max_chunks,
        )
