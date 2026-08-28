from time import perf_counter

from app.schemas.document import (
    DocumentPrepareRequest,
    DocumentPrepareResponse,
    PreparedChunk,
)
from app.services.chunking import split_text_into_chunks
from app.services.embedding import generate_embeddings


async def prepare_document(
    request: DocumentPrepareRequest,
) -> DocumentPrepareResponse:
    started_at = perf_counter()

    if request.chunk_overlap >= request.chunk_size:
        raise ValueError("chunk_overlap必须小于chunk_size")

    text_chunks = split_text_into_chunks(
        text=request.content,
        chunk_size=request.chunk_size,
        overlap=request.chunk_overlap,
        max_chunks=request.max_chunks,
    )

    embedding_result = await generate_embeddings(
        [chunk.text for chunk in text_chunks],
        input_type="document",
    )

    embeddings = embedding_result["embeddings"]

    if len(embeddings) != len(text_chunks):
        raise RuntimeError("Embedding数量与文本分块数量不一致")

    prepared_chunks = [
        PreparedChunk(
            index=chunk.index,
            start=chunk.start,
            end=chunk.end,
            text=chunk.text,
            embedding=embedding,
        )
        for chunk, embedding in zip(
            text_chunks,
            embeddings,
            strict=True,
        )
    ]

    return DocumentPrepareResponse(
        title=request.title,
        model=str(embedding_result["model"]),
        dimensions=int(embedding_result["dimensions"]),
        chunk_count=len(prepared_chunks),
        chunks=prepared_chunks,
        latency_ms=round((perf_counter() - started_at) * 1000, 2),
    )
