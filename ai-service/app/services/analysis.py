import json
from time import perf_counter
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.analysis import AnalysisResult


class AnalysisServiceError(Exception):
    pass


def _clean_json_response(response: str) -> str:
    return response.replace("```json", "").replace("```", "").strip()


async def analyze_knowledge(
    title: str,
    content: str,
) -> dict[str, Any]:
    started_at = perf_counter()

    prompt = f"""
请分析下面的知识内容。

必须严格返回JSON，不要返回Markdown和解释。

格式：
{{
  "summary": "一句到两句话的中文摘要",
  "tags": ["标签1", "标签2", "标签3"]
}}

要求：
1. summary简洁准确，不添加原文没有的信息；
2. tags返回1至5个最重要的标签；
3. 标签使用中文或常见技术名称；
4. 不输出思考过程；
5. 只返回JSON。
6. 摘要中的每个事实都必须能在原文中直接找到依据；
7. 原文没有明确描述的作用、优势、效果和因果关系不得补充；
8. 不得使用“提升、优化、增强、降低、确保”等效果词，除非原文明确包含；
9. 优先抽取和压缩原文，不进行推测。

标题：
{title}

内容：
{content}
""".strip()

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(settings.ollama_timeout_seconds)
        ) as client:
            response = await client.post(
                (f"{settings.ollama_base_url}/api/generate"),
                json={
                    "model": (settings.ollama_chat_model),
                    "prompt": prompt,
                    "stream": False,
                    "think": False,
                    "format": "json",
                    "keep_alive": (settings.ollama_keep_alive),
                    "options": {
                        "temperature": 0.0,
                        "num_predict": 256,
                    },
                },
            )

            response.raise_for_status()

    except httpx.TimeoutException as error:
        raise AnalysisServiceError("AI分析请求超时") from error

    except httpx.HTTPError as error:
        raise AnalysisServiceError(f"Ollama生成请求失败: {error}") from error

    try:
        data = response.json()
        raw_result = str(data["response"])

        parsed = json.loads(_clean_json_response(raw_result))

        result = AnalysisResult.model_validate(parsed)

        unique_tags = list(
            dict.fromkeys(tag.strip() for tag in result.tags if tag.strip())
        )[:5]

        if not unique_tags:
            raise ValueError("AI没有返回有效标签")

    except (
        KeyError,
        TypeError,
        ValueError,
        json.JSONDecodeError,
        ValidationError,
    ) as error:
        raise AnalysisServiceError(f"无法解析AI分析结果: {error}") from error

    return {
        "summary": result.summary.strip(),
        "tags": unique_tags,
        "model": settings.ollama_chat_model,
        "latency_ms": round(
            (perf_counter() - started_at) * 1000,
            2,
        ),
    }
