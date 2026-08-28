from typing import Literal

from pydantic import BaseModel, Field, field_validator


class EmbeddingRequest(BaseModel):
    texts: list[str] = Field(
        min_length=1,
        max_length=32,
    )
    model: str | None = None
    input_type: Literal["query", "document"] = "query"

    @field_validator("texts")
    @classmethod
    def validate_texts(
        cls,
        texts: list[str],
    ) -> list[str]:
        normalized = [text.strip() for text in texts]

        if any(not text for text in normalized):
            raise ValueError("Embedding文本不能为空")

        if any(len(text) > 8000 for text in normalized):
            raise ValueError("单条文本不能超过8000个字符")

        return normalized


class EmbeddingResponse(BaseModel):
    model: str
    count: int
    dimensions: int
    embeddings: list[list[float]]
    latency_ms: float
