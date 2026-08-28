from pydantic import BaseModel, Field, field_validator


class DocumentPrepareRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=200_000)
    chunk_size: int = Field(default=500, ge=100, le=2_000)
    chunk_overlap: int = Field(default=80, ge=0, le=500)
    max_chunks: int = Field(default=100, ge=1, le=500)

    @field_validator("title", "content")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("文本不能为空")
        return value


class PreparedChunk(BaseModel):
    index: int
    start: int
    end: int
    text: str
    embedding: list[float]


class DocumentPrepareResponse(BaseModel):
    title: str
    model: str
    dimensions: int
    chunk_count: int
    chunks: list[PreparedChunk]
    latency_ms: float
