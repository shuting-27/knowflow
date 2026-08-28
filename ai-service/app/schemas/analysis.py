from pydantic import BaseModel, Field, field_validator


class AnalysisRequest(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=200,
    )
    content: str = Field(
        min_length=1,
        max_length=30000,
    )

    @field_validator("title", "content")
    @classmethod
    def normalize_text(
        cls,
        value: str,
    ) -> str:
        value = value.strip()

        if not value:
            raise ValueError("文本不能为空")

        return value


class AnalysisResult(BaseModel):
    summary: str = Field(
        min_length=1,
        max_length=500,
    )
    tags: list[str] = Field(
        min_length=1,
        max_length=5,
    )


class AnalysisResponse(AnalysisResult):
    model: str
    latency_ms: float
