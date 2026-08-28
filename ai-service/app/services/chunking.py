from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class TextChunk:
    index: int
    text: str
    start: int
    end: int

    def to_dict(self) -> dict[str, int | str]:
        return asdict(self)


class ChunkingError(ValueError):
    pass


def normalize_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def find_chunk_boundary(
    text: str,
    start: int,
    target_end: int,
    chunk_size: int,
) -> int:
    if target_end >= len(text):
        return len(text)

    window = text[start:target_end]

    boundaries = [
        window.rfind("\n\n"),
        window.rfind("。"),
        window.rfind("！"),
        window.rfind("？"),
        window.rfind(". "),
        window.rfind("! "),
        window.rfind("? "),
    ]

    boundary = max(boundaries)
    minimum_boundary = int(chunk_size * 0.55)

    if boundary >= minimum_boundary:
        return start + boundary + 1

    return target_end


def split_text_into_chunks(
    text: str,
    chunk_size: int = 700,
    overlap: int = 120,
    max_chunks: int = 40,
) -> list[TextChunk]:
    normalized = normalize_text(text)

    if not normalized:
        return []

    if chunk_size < 100:
        raise ChunkingError("chunk_size不能小于100")

    if overlap < 0:
        raise ChunkingError("overlap不能小于0")

    if overlap >= chunk_size:
        raise ChunkingError("overlap必须小于chunk_size")

    if max_chunks < 1:
        raise ChunkingError("max_chunks不能小于1")

    chunks: list[TextChunk] = []
    start = 0

    while start < len(normalized) and len(chunks) < max_chunks:
        target_end = min(
            start + chunk_size,
            len(normalized),
        )

        end = find_chunk_boundary(
            normalized,
            start,
            target_end,
            chunk_size,
        )

        chunk_text = normalized[start:end].strip()

        if chunk_text:
            chunks.append(
                TextChunk(
                    index=len(chunks),
                    text=chunk_text,
                    start=start,
                    end=end,
                )
            )

        if end >= len(normalized):
            break

        next_start = max(
            end - overlap,
            start + 1,
        )

        start = next_start

    return chunks
