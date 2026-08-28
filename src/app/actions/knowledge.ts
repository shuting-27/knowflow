"use server";
import { db } from "@/prisma/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aiConfig } from "@/lib/ai-config";
import { bestChunkMatch, lexicalOverlap, parseTags, payloadSimilarity, serializeTags, type EmbeddingPayload } from "@/lib/retrieval";


const DEMO_EMAIL = "demo@knowflow.local";

type EmbeddingApiResponse = {
  model: string;
  count: number;
  dimensions: number;
  embeddings: number[][];
  latency_ms: number;
};
const EMBEDDING_DIMENSIONS = 768;
type PreparedDocumentChunk = {
  index: number;
  start: number;
  end: number;
  text: string;
  embedding: number[];
};

type DocumentPrepareApiResponse = {
  title: string;
  model: string;
  dimensions: number;
  chunk_count: number;
  chunks: PreparedDocumentChunk[];
  latency_ms: number;
};

async function requestEmbeddingBatch(
  texts: string[]
): Promise<number[][]> {
  const response = await fetch(
    `${aiConfig.aiServiceUrl}/api/v1/embeddings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts,
      }),
      signal: AbortSignal.timeout(
        aiConfig.requestTimeoutMs
      ),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI服务Embedding请求失败: ` +
      `${response.status} ${errorText}`
    );
  }

  const data =
    (await response.json()) as EmbeddingApiResponse;

  if (
    !Array.isArray(data.embeddings) ||
    data.embeddings.length !== texts.length
  ) {
    throw new Error(
      "AI服务返回的Embedding数量不正确"
    );
  }

  if (
    data.dimensions <= 0 ||
    data.embeddings.some(
      (embedding) =>
        !Array.isArray(embedding) ||
        embedding.length !== data.dimensions
    )
  ) {
    throw new Error(
      "AI服务返回的Embedding维度不一致"
    );
  }

  console.log("Embedding批次完成:", {
    count: data.count,
    dimensions: data.dimensions,
    latencyMs: data.latency_ms,
  });

  return data.embeddings;
}


async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // FastAPI单次最多接受32条。
  // 考虑8GB内存设备，使用更保守的16条。
  const batchSize = 16;
  const embeddings: number[][] = [];

  for (
    let start = 0;
    start < texts.length;
    start += batchSize
  ) {
    const batch = texts.slice(
      start,
      start + batchSize
    );

    const batchEmbeddings =
      await requestEmbeddingBatch(batch);

    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}


async function generateEmbedding(
  text: string
): Promise<number[]> {
  const embeddings =
    await generateEmbeddings([text]);

  const embedding = embeddings[0];

  if (!embedding) {
    throw new Error(
      "AI服务没有返回Embedding"
    );
  }

  return embedding;
}

async function searchKnowledgeChunks(
  queryEmbedding: number[],
  limit: number
) {
  if (
    queryEmbedding.length !==
      EMBEDDING_DIMENSIONS ||
    queryEmbedding.some(
      (value) => !Number.isFinite(value)
    )
  ) {
    throw new Error("查询向量格式不正确");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("向量召回数量不正确");
  }

  return await db.transaction(
    async (transaction) => {
      const plan =
        transaction.sql.public.knowledge_chunk
          .select("postId")
          .select("chunkIndex")
          .select("text")
          .select(
            "similarity",
            (fields, functions) =>
              functions.cosineSimilarity(
                fields.embedding,
                queryEmbedding
              )
          )
          .orderBy(
            (fields, functions) =>
              functions.cosineDistance(
                fields.embedding,
                queryEmbedding
              ),
            {
              direction: "asc",
            }
          )
          .limit(limit)
          .build();
      const startedAt =
        performance.now();
      const rows =
        await transaction.query(plan);

      if (
        rows.some(
          (row) =>
            !Number.isInteger(row.postId) ||
            !Number.isInteger(row.chunkIndex) ||
            typeof row.text !== "string" ||
            !Number.isFinite(row.similarity)
        )
      ) {
        throw new Error(
          "pgvector返回的检索结果格式不正确"
        );
      }

      console.log("pgvector召回完成:", {
        limit,
        retrieved: rows.length,
        latencyMs: Number(
          (
            performance.now() -
            startedAt
          ).toFixed(2)
        ),
      });

      return rows;
    }
  );
}

async function generateKnowledgeEmbedding(
  title: string,
  content: string
): Promise<EmbeddingPayload> {
  const source =
    `标题：${title}\n\n${content}`.trim();

  const response = await fetch(
    `${aiConfig.aiServiceUrl}/api/v1/documents/prepare`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        content: source,
        chunk_size: aiConfig.chunkSize,
        chunk_overlap: aiConfig.chunkOverlap,
        max_chunks: aiConfig.maxChunksPerKnowledge,
      }),
      signal: AbortSignal.timeout(
        aiConfig.requestTimeoutMs
      ),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI服务文档预处理请求失败: ` +
      `${response.status} ${errorText}`
    );
  }

  const data =
    (await response.json()) as DocumentPrepareApiResponse;

  if (
    !Array.isArray(data.chunks) ||
    data.chunks.length === 0 ||
    data.chunk_count !== data.chunks.length
  ) {
    throw new Error(
      "AI服务返回的文档分块数量不正确"
    );
  }

  if (
    !Number.isInteger(data.dimensions) ||
    data.dimensions <= 0 ||
    data.chunks.some(
      (chunk) =>
        !Number.isInteger(chunk.index) ||
        !Number.isInteger(chunk.start) ||
        !Number.isInteger(chunk.end) ||
        chunk.start < 0 ||
        chunk.end <= chunk.start ||
        typeof chunk.text !== "string" ||
        chunk.text.length === 0 ||
        !Array.isArray(chunk.embedding) ||
        chunk.embedding.length !== data.dimensions ||
        chunk.embedding.some(
          (value) => !Number.isFinite(value)
        )
    )
  ) {
    throw new Error(
      "AI服务返回的文档分块或向量格式不正确"
    );
  }

  console.log("文档预处理完成:", {
    title: data.title,
    model: data.model,
    chunkCount: data.chunk_count,
    dimensions: data.dimensions,
    latencyMs: data.latency_ms,
  });

  return {
    version: 2,
    model: data.model,
    chunks: data.chunks.map((chunk) => ({
      index: chunk.index,
      start: chunk.start,
      end: chunk.end,
      text: chunk.text,
      embedding: chunk.embedding,
    })),
  };
}


function buildKnowledgeChunkRows(
  postId: number,
  payload: EmbeddingPayload
) {
  if (
    !Number.isInteger(postId) ||
    postId <= 0
  ) {
    throw new Error("无效的知识 ID");
  }

  if (!payload.model.trim()) {
    throw new Error("Embedding模型名称不能为空");
  }

  if (payload.chunks.length === 0) {
    throw new Error("知识分块不能为空");
  }

  const indexes = new Set<number>();

  return payload.chunks.map((chunk) => {
    if (
      !Number.isInteger(chunk.index) ||
      chunk.index < 0 ||
      indexes.has(chunk.index)
    ) {
      throw new Error(
        `无效或重复的Chunk索引: ${chunk.index}`
      );
    }

    indexes.add(chunk.index);

    if (
      !Array.isArray(chunk.embedding) ||
      chunk.embedding.length !==
        EMBEDDING_DIMENSIONS ||
      chunk.embedding.some(
        (value) => !Number.isFinite(value)
      )
    ) {
      throw new Error(
        `Chunk ${chunk.index} 的向量维度不正确`
      );
    }

    if (
      !chunk.text.trim() ||
      !Number.isInteger(chunk.start) ||
      !Number.isInteger(chunk.end) ||
      chunk.start < 0 ||
      chunk.end <= chunk.start
    ) {
      throw new Error(
        `Chunk ${chunk.index} 的文本位置不正确`
      );
    }

    return {
      postId,
      chunkIndex: chunk.index,
      text: chunk.text,
      startOffset: chunk.start,
      endOffset: chunk.end,
      embedding: chunk.embedding,
      embeddingModel: payload.model,
    };
  });
}

export async function createKnowledge(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!title) {
    throw new Error("标题不能为空");
  }

  try {
    // 模型不可用时不写入半成品记录。
    const embedding = await generateKnowledgeEmbedding(title, content);

    const post = await db.transaction(
      async (transaction) => {
        let user =
          await transaction.orm.public.User
            .where({
              email: DEMO_EMAIL,
            })
            .first();

        if (!user) {
          user =
            await transaction.orm.public.User.create({
              email: DEMO_EMAIL,
              username: "demo",
              name: "KnowFlow Demo",
            });
        }

        const createdPost =
          await transaction.orm.public.Post.create({
            title,
            content: content || null,
            authorId: user.id,
            embedding: JSON.stringify(embedding),
          });

        const chunkRows =
          buildKnowledgeChunkRows(
            createdPost.id,
            embedding
          );

        await transaction.orm.public.KnowledgeChunk
          .createAll(chunkRows);

        return createdPost;
      }
    );

    console.log("知识创建成功:", title);
    console.log("知识 ID:", post.id);

    console.log(
      "Embedding 保存成功:",
      post.id,
      "Chunk 数:",
      embedding.chunks.length
    );
    console.log("知识创建成功:", title);
    console.log("知识 ID:", post.id);

    console.log(
      "Embedding 与 pgvector Chunk 保存成功:",
      post.id,
      "Chunk 数:",
      embedding.chunks.length
    );

    revalidatePath("/");
    revalidatePath("/knowledge");

  } catch (error) {
    console.error("创建知识失败:", error);
    throw new Error("创建知识失败");
  }
}

export async function getKnowledgeList(
  search = "",
  tag = ""
) {
  try {
    const keyword = search.trim().toLowerCase();
    const selectedTag = tag.trim().toLowerCase();

    // 1. 获取全部知识
    const allPosts = await db.orm.public.Post
      .orderBy((post) => post.createdAt.desc())
      .all();

    // 2. 先进行标签过滤
    const filteredPosts = allPosts.filter((post) => {
      const matchesTag = !selectedTag || parseTags(post.aiTags)
        .map((item) => item.toLowerCase())
        .includes(selectedTag);

      return matchesTag;
    });

    // 3. 没有搜索关键词，直接返回
    if (!keyword) {
      return filteredPosts;
    }

    const TOP_K =
      aiConfig.retrievalTopK;

    const semanticScores =
      new Map<number, number>();

    let semanticAvailable = false;

    try {
      const searchEmbedding =
        await generateEmbedding(search);

      console.log(
        "搜索 Embedding 生成成功:",
        searchEmbedding.length
      );

      const vectorCandidates =
        await searchKnowledgeChunks(
          searchEmbedding,
          Math.max(TOP_K * 4, 20)
        );

      for (const candidate of vectorCandidates) {
        const current =
          semanticScores.get(
            candidate.postId
          ) ?? Number.NEGATIVE_INFINITY;

        semanticScores.set(
          candidate.postId,
          Math.max(
            current,
            candidate.similarity
          )
        );
      }

      semanticAvailable = true;
    } catch (semanticError) {
      console.error(
        "语义检索不可用，降级为关键词搜索:",
        semanticError
      );
    }
    // 6. 计算每篇知识的语义相似度
    const scoredPosts = filteredPosts.map((post) => {
      const semanticScore =
        semanticScores.get(post.id) ?? 0;
      // 7. 保留传统关键词搜索
      const title =
        post.title?.toLowerCase() ?? "";

      const content =
        post.content?.toLowerCase() ?? "";

      const aiTags =
        post.aiTags?.toLowerCase() ?? "";

      const lexicalScore = lexicalOverlap(
        keyword,
        `${title}\n${content}\n${aiTags}`
      );

      const titleExact =
        title.includes(keyword);

      const exactMatch =
        titleExact ||
        content.includes(keyword) ||
        aiTags.includes(keyword);

      const finalScore =
        semanticAvailable
          ? semanticScore * 0.8 +
            lexicalScore * 0.15 +
            (exactMatch ? 0.05 : 0)
          : lexicalScore * 0.7 +
            (exactMatch ? 0.2 : 0) +
            (titleExact ? 0.1 : 0);
      
      console.log(
        "搜索相关度:",
        post.title,
        "semantic:",
        semanticScore.toFixed(4),
        "lexical:",
        lexicalScore.toFixed(4),
        "exact:",
        exactMatch,
        "final:",
        finalScore.toFixed(4)
      );

      return {
        ...post,
        _score: finalScore,
      };
    });

    // 8. 设置最低相关度
    const MIN_SCORE =
      semanticAvailable
        ? aiConfig.searchMinScore
        : 0.3;

    // 10. 先过滤，再排序，再限制数量
    const relevantPosts = scoredPosts
      .filter((post) => post._score >= MIN_SCORE)
      .sort((a, b) => b._score - a._score)
      .slice(0, TOP_K);

    console.log(
      "搜索模式:",
      semanticAvailable
        ? "hybrid"
        : "lexical-fallback"
    );
    console.log(
      "最终搜索结果:",
      relevantPosts.map((post) => ({
        id: post.id,
        title: post.title,
        score: post._score,
      }))
    );

    // 11. 去掉内部评分字段
    return relevantPosts.map((item) => {
      const post = { ...item };
      delete (post as Partial<typeof item>)._score;
      return post;
    });

  } catch (error) {
    console.error(
      "获取知识失败:",
      error
    );

    return [];
  }
}

export async function getAllKnowledgeTags() {
  try {
    const allPosts = await db.orm.public.Post.all();

    const tags = allPosts.flatMap((post) => parseTags(post.aiTags));

    return Array.from(new Set(tags)).sort();
  } catch (error) {
    console.error("获取 AI 标签失败:", error);
    return [];
  }
}

export async function getKnowledgeStats() {
  try {
    const allPosts = await db.orm.public.Post.all();

    const total = allPosts.length;

    const withSummary = allPosts.filter(
      (post) => post.aiSummary?.trim()
    ).length;

    const allTags = allPosts.flatMap((post) => parseTags(post.aiTags));

    const uniqueTags = Array.from(new Set(allTags));

    const latestPost = allPosts
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() -
          new Date(a.updatedAt).getTime()
      )[0];

    return {
      total,
      withSummary,
      tagCount: uniqueTags.length,
      latestUpdatedAt: latestPost?.updatedAt ?? null,
    };
  } catch (error) {
    console.error("获取知识统计失败:", error);

    return {
      total: 0,
      withSummary: 0,
      tagCount: 0,
      latestUpdatedAt: null,
    };
  }
}

/**
 * 获取单条知识
 */
export async function getKnowledge(id: number) {
  try {
    const post = await db.orm.public.Post
      .where({
        id,
      })
      .first();

    return post;
  } catch (error) {
    console.error("获取知识失败:", error);
    return null;
  }
}


/**
 * 删除知识
 */
export async function deleteKnowledge(id: number) {
  try {
    await db.orm.public.Post
      .where({
        id,
      })
      .delete();

    console.log("知识删除成功:", id);
  } catch (error) {
    console.error("删除知识失败:", error);
    throw new Error("删除知识失败");
  }
}

export async function updateKnowledge(
  id: number,
  formData: FormData
) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("无效的知识 ID");
  }

  if (!title) {
    throw new Error("标题不能为空");
  }

  try {
    const knowledge = await db.orm.public.Post
      .where({ id })
      .first();

    if (!knowledge) {
      throw new Error("知识不存在");
    }

    console.log("开始更新知识:", id);

    // 数据库发生变化前先完成耗时的AI处理。
    const embedding =
      await generateKnowledgeEmbedding(
        title,
        content
      );

    await db.transaction(
      async (transaction) => {
        await transaction.orm.public.Post
          .where({ id })
          .update({
            title,
            content: content || null,
            aiSummary: null,
            aiTags: null,
            embedding:
              JSON.stringify(embedding),
          });

        await transaction.orm.public.KnowledgeChunk
          .where({
            postId: id,
          })
          .deleteAll();

        const chunkRows =
          buildKnowledgeChunkRows(
            id,
            embedding
          );

        await transaction.orm.public.KnowledgeChunk
          .createAll(chunkRows);
      }
    );

    console.log(
      "知识与pgvector索引更新成功:",
      id,
      "Chunk 数:",
      embedding.chunks.length
    );

    console.log(
      "知识内容已更新，AI分析等待按需重新生成:",
      id
    );

    revalidatePath("/");
    revalidatePath(`/knowledge/${id}`);
    revalidatePath(`/knowledge/${id}/edit`);

    console.log("知识更新完成:", id);
  } catch (error) {
    console.error("更新知识失败:", error);
    throw new Error("更新知识失败");
  }

  // 6. 返回详情页
  redirect(`/knowledge/${id}`);
}

export async function saveAiSummary(
  id: number,
  summary: string
) {
  try {
    await db.orm.public.Post
      .where({ id })
      .update({
        aiSummary: summary,
      });

    console.log("AI 摘要保存成功:", id);
  } catch (error) {
    console.error("保存 AI 摘要失败:", error);
    throw new Error("保存 AI 摘要失败");
  }
}
export async function generateAiSummary(id: number) {
  try {
    // 1. 获取知识
    const knowledge = await db.orm.public.Post
      .where({ id })
      .first();

    if (!knowledge) {
      throw new Error("知识不存在");
    }

    if (!knowledge.content?.trim()) {
      throw new Error("知识内容为空");
    }

    console.log("开始生成 AI 摘要:", knowledge.title);

    // 2. 调用本地 Ollama
    const response = await fetch(
      `${aiConfig.ollamaBaseUrl}/api/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiConfig.chatModel,

          prompt: `
请为下面这篇知识内容生成一个简洁、准确的中文摘要。

要求：
1. 使用中文
2. 控制在 100～150 字
3. 提取最重要的信息
4. 不要添加原文没有的信息
5. 只输出最终摘要
6. 不要输出思考过程
7. 不要输出“摘要：”等前缀

标题：
${knowledge.title}

内容：
${knowledge.content}
          `,

          // 不使用流式输出
          stream: false,

          // 关闭 Qwen3 Thinking
          think: false,
        }),
      }
    );

    console.log("Ollama HTTP 状态:", response.status);

    // 3. 检查 HTTP 状态
    if (!response.ok) {
      const errorText = await response.text();

      console.error("Ollama API 错误:", errorText);

      throw new Error(
        `Ollama API 请求失败: ${response.status}`
      );
    }

    // 4. 解析返回结果
    const data = await response.json();

    console.log("Ollama 返回:", data);

    const summary = data.response?.trim();

    if (!summary) {
      throw new Error("Ollama 没有返回摘要");
    }

    console.log("AI 摘要生成成功:", summary);

    // 5. 保存到数据库
    await saveAiSummary(id, summary);

    console.log("AI 摘要保存成功:", id);

    // 6. 返回摘要
    return summary;

  } catch (error) {
    console.error("生成 AI 摘要失败:", error);

    throw new Error("生成 AI 摘要失败");
  }
}

export async function generateAiTags(id: number) {
  try {
    // 1. 查询知识
    const post = await db.orm.public.Post
      .where({ id })
      .first();

    if (!post) {
      throw new Error("知识不存在");
    }

    // 2. 调用 Ollama
    const response = await fetch(`${aiConfig.ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.chatModel,
        prompt: `
请根据下面的知识内容提取 3-5 个最重要的中文标签。

要求：
1. 只返回 JSON 数组
2. 不要返回 Markdown
3. 不要解释
4. 每个标签尽量简短
5. 标签应该能够概括这篇知识的主题

标题：
${post.title}

内容：
${post.content ?? ""}
        `,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama 请求失败: ${response.status}`);
    }

    const data = await response.json();

    console.log("Ollama 标签原始返回:", data.response);

    // 3. 清理模型返回结果
    let tags: string[];

    try {
      tags = JSON.parse(data.response);
    } catch {
      // 如果模型多返回了一些文字，尝试提取 JSON 数组
      const match = data.response.match(/\[[\s\S]*\]/);

      if (!match) {
        throw new Error("AI 返回的标签格式无法解析");
      }

      tags = JSON.parse(match[0]);
    }

    // 4. 确保确实是字符串数组
    tags = tags
      .filter((tag: unknown) => typeof tag === "string")
      .map((tag: string) => tag.trim())
      .filter(Boolean)
      .slice(0, 5);

    // 5. 保存到数据库
    await db.orm.public.Post
      .where({ id })
      .update({
        aiTags: serializeTags(tags),
      });

    console.log("AI 标签生成成功:", id, tags);

    return tags;
  } catch (error) {
    console.error("生成 AI 标签失败:", error);
    throw new Error("生成 AI 标签失败");
  }
}


export async function generateAiAnalysis(
  formData: FormData
) {
  try {
    const idValue = formData.get("id");
    const id = Number(idValue);

    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("无效的知识 ID");
    }

    return await analyzeKnowledge(id);

  } catch (error) {
    console.error(
      "AI 分析失败:",
      error
    );

    if (error instanceof Error) {
      throw new Error(
        `AI 分析失败: ${error.message}`
      );
    }

    throw new Error("AI 分析失败");
  }
}

type AnalysisApiResponse = {
  summary: string;
  tags: string[];
  model: string;
  latency_ms: number;
};


async function requestKnowledgeAnalysis(
  title: string,
  content: string
): Promise<AnalysisApiResponse> {
  const response = await fetch(
    `${aiConfig.aiServiceUrl}/api/v1/analyze`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        content,
      }),
      signal: AbortSignal.timeout(
        aiConfig.requestTimeoutMs
      ),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI分析服务请求失败: ` +
      `${response.status} ${errorText}`
    );
  }

  const data =
    (await response.json()) as AnalysisApiResponse;

  if (!data.summary?.trim()) {
    throw new Error(
      "AI分析服务没有返回摘要"
    );
  }

  if (
    !Array.isArray(data.tags) ||
    data.tags.length === 0
  ) {
    throw new Error(
      "AI分析服务没有返回标签"
    );
  }

  return {
    ...data,
    summary: data.summary.trim(),
    tags: data.tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 5),
  };
}


async function analyzeKnowledge(id: number) {
  const knowledge =
    await db.orm.public.Post
      .where({ id })
      .first();

  if (!knowledge) {
    throw new Error("知识不存在");
  }

  const content =
    knowledge.content?.trim();

  if (!content) {
    throw new Error(
      "知识内容为空，无法执行AI分析"
    );
  }

  console.log(
    "开始调用Python AI分析服务:",
    id,
    knowledge.title
  );

  const result =
    await requestKnowledgeAnalysis(
      knowledge.title,
      content
    );

  await db.orm.public.Post
    .where({ id })
    .update({
      aiSummary: result.summary,
      aiTags: serializeTags(
        result.tags
      ),
    });

  console.log("AI分析完成:", {
    id,
    model: result.model,
    latencyMs: result.latency_ms,
    tagCount: result.tags.length,
  });

  revalidatePath("/");
  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${id}`);

  return {
    summary: result.summary,
    tags: result.tags,
  };
}

export async function getSemanticRelatedKnowledge(
  currentId: number,
  limit = 3
) {
  try {
    // 1. 获取当前知识
    const currentPost = await db.orm.public.Post
      .where({ id: currentId })
      .first();

    if (!currentPost) {
      return [];
    }

    // 2. 当前知识没有 embedding，就无法进行语义关联
    if (!currentPost.embedding) {
      console.log(
        "当前知识没有 embedding:",
        currentId
      );

      return [];
    }

    // 3. 获取其他知识
    const allPosts = await db.orm.public.Post
      .orderBy((post) => post.createdAt.desc())
      .all();

    // 5. 计算其他知识与当前知识的语义相似度
    const scoredPosts = allPosts
      .filter((post) => post.id !== currentId)
      .map((post) => {
        const semanticScore = payloadSimilarity(currentPost.embedding, post.embedding);

        return {
          post,
          score: semanticScore,
        };
      });

    // 6. 设置最低相关度
    const MIN_RELATED_SCORE = 0.72;

    // 7. 排序 + 过滤 + Top K
    const relatedPosts = scoredPosts
      .filter(
        (item) =>
          item.score >= MIN_RELATED_SCORE
      )
      .sort(
        (a, b) => b.score - a.score
      )
      .slice(0, limit);

    console.log(
      "语义关联知识:",
      relatedPosts.map((item) => ({
        id: item.post.id,
        title: item.post.title,
        score: Number(
          item.score.toFixed(4)
        ),
      }))
    );

    // 8. 返回知识对象
    return relatedPosts.map(
      (item) => item.post
    );

  } catch (error) {
    console.error(
      "获取语义关联知识失败:",
      error
    );

    return [];
  }
}

export async function getHybridRelatedKnowledge(
  currentId: number,
  limit = 3
) {
  try {
    // ==========================================
    // 1. 获取当前知识
    // ==========================================

    const currentPost = await db.orm.public.Post
      .where({ id: currentId })
      .first();

    if (!currentPost) {
      return [];
    }

    // ==========================================
    // 2. 获取当前知识 embedding
    // ==========================================

    if (!currentPost.embedding) {
      console.log(
        "当前知识没有 embedding:",
        currentId
      );

      return [];
    }

    // ==========================================
    // 3. 获取当前知识标签
    // ==========================================

    const currentTags = parseTags(currentPost.aiTags).map((tag) => tag.toLowerCase());

    // ==========================================
    // 4. 获取全部知识
    // ==========================================

    const allPosts = await db.orm.public.Post
      .orderBy((post) => post.createdAt.desc())
      .all();

    // ==========================================
    // 6. 计算每篇知识的混合相关度
    // ==========================================

    const scoredPosts = allPosts
      .filter(
        (post) => post.id !== currentId
      )
      .map((post) => {

        // --------------------------------------
        // A. Semantic Score
        // --------------------------------------

        const semanticScore = payloadSimilarity(currentPost.embedding, post.embedding);

        // --------------------------------------
        // B. Tag Score
        // --------------------------------------

        const postTags = parseTags(post.aiTags).map((tag) => tag.toLowerCase());

        const commonTags =
          currentTags.filter((tag) =>
            postTags.includes(tag)
          );

        let tagScore = 0;

        if (currentTags.length > 0) {
          tagScore =
            commonTags.length /
            currentTags.length;
        }

        // --------------------------------------
        // C. Hybrid Score
        // --------------------------------------

        const semanticWeight = 0.7;
        const tagWeight = 0.3;

        const hybridScore =
          semanticScore * semanticWeight +
          tagScore * tagWeight;

        return {
          post,
          semanticScore,
          tagScore,
          hybridScore,
          commonTags,
        };
      });

    // ==========================================
    // 7. 最低相关度
    // ==========================================

    const MIN_HYBRID_SCORE = 0.72;

    // ==========================================
    // 8. 排序 + 过滤 + Top K
    // ==========================================

    const relatedPosts = scoredPosts
      .filter(
        (item) =>
          item.hybridScore >=
          MIN_HYBRID_SCORE
      )
      .sort((a, b) => {

        // 第一优先级：混合分数
        if (
          b.hybridScore !==
          a.hybridScore
        ) {
          return (
            b.hybridScore -
            a.hybridScore
          );
        }

        // 第二优先级：语义分数
        return (
          b.semanticScore -
          a.semanticScore
        );
      })
      .slice(0, limit);

    // ==========================================
    // 9. 调试日志
    // ==========================================

    console.log(
      "混合推荐结果:",
      relatedPosts.map((item) => ({
        id: item.post.id,
        title: item.post.title,

        semantic:
          Number(
            item.semanticScore.toFixed(4)
          ),

        tag:
          Number(
            item.tagScore.toFixed(4)
          ),

        hybrid:
          Number(
            item.hybridScore.toFixed(4)
          ),

        commonTags:
          item.commonTags,
      }))
    );

    // ==========================================
    // 10. 返回知识
    // ==========================================

    return relatedPosts.map(
      (item) => item.post
    );

  } catch (error) {
    console.error(
      "获取混合相关知识失败:",
      error
    );

    return [];
  }
}

export async function searchKnowledgeForRAG(
  query: string,
  limit = 5
) {
  try {
    const keyword = query.trim();

    if (!keyword) {
      return [];
    }

    console.log(
      "RAG 开始检索:",
      keyword
    );

    // ==========================================
    // 1. 生成 Query Embedding
    // ==========================================

    const queryEmbedding =
      await generateEmbedding(keyword);

    console.log(
      "RAG Query Embedding:",
      queryEmbedding.length
    );

    // ==========================================
    // 2. 获取知识库
    // ==========================================

    const allPosts =
      await db.orm.public.Post
        .orderBy(
          (post) => post.createdAt.desc()
        )
        .all();

    // ==========================================
    // 3. Cosine Similarity
    // ==========================================

    // ==========================================
    // 4. 计算每篇知识与 Query 的语义相关度
    // ==========================================

    const scoredPosts = allPosts
      .filter(
        (post) => !!post.embedding
      )
      .map((post) => {
        const match = bestChunkMatch(queryEmbedding, post.embedding);
        const denseScore = match?.score ?? 0;
        const lexicalScore = lexicalOverlap(keyword, `${post.title}\n${match?.text || post.content || ""}`);
        return {
          post,
          score: denseScore * 0.85 + lexicalScore * 0.15,
          denseScore,
          lexicalScore,
          chunkIndex: match?.index ?? 0,
          excerpt: match?.text || (post.content ?? "").slice(0, aiConfig.contextCharsPerDocument),
        };
      });

    // ==========================================
    // 5. 最低相关度
    // ==========================================

    const MIN_SCORE = aiConfig.retrievalMinScore;

    const candidates = scoredPosts
      .filter(
        (item) =>
          item.score >= MIN_SCORE
      );

    console.log(
      "RAG 相关候选数量:",
      candidates.length
    );

    // ==========================================
    // 6. 文本相似度
    //
    // 用于判断两个知识是不是太相似
    // ==========================================

    const textSimilarity = (
      a: string,
      b: string
    ) => {

      const normalize = (text: string) =>
        text
          .toLowerCase()
          .replace(/\s+/g, "")
          .slice(0, 1000);

      const getNgrams = (
        text: string,
        n = 2
      ) => {

        const result =
          new Set<string>();

        for (
          let i = 0;
          i <= text.length - n;
          i++
        ) {
          result.add(
            text.slice(i, i + n)
          );
        }

        return result;
      };

      const textA =
        normalize(a);

      const textB =
        normalize(b);

      if (
        !textA ||
        !textB
      ) {
        return 0;
      }

      const setA =
        getNgrams(textA);

      const setB =
        getNgrams(textB);

      if (
        setA.size === 0 ||
        setB.size === 0
      ) {
        return 0;
      }

      let intersection = 0;

      for (const gram of setA) {
        if (setB.has(gram)) {
          intersection++;
        }
      }

      const union =
        new Set([
          ...setA,
          ...setB,
        ]).size;

      return (
        intersection / union
      );
    };

    // ==========================================
    // 7. MMR
    //
    // Lambda 越大：
    // 越强调 Query 相关性
    //
    // Lambda 越小：
    // 越强调结果之间的多样性
    // ==========================================

    const MMR_LAMBDA = aiConfig.mmrLambda;

    const selected:
      typeof candidates = [];

    const remaining =
      [...candidates];

    while (
      selected.length < limit &&
      remaining.length > 0
    ) {

      let bestIndex = 0;

      let bestMMR =
        -Infinity;

      // ------------------------------------------
      // 遍历候选知识
      // ------------------------------------------

      for (
        let i = 0;
        i < remaining.length;
        i++
      ) {

        const candidate =
          remaining[i];

        // ----------------------------------------
        // 相关性
        // ----------------------------------------

        const relevance =
          candidate.score;

        // ----------------------------------------
        // 与已经选择知识的最大相似度
        // ----------------------------------------

        let maxSimilarity = 0;

        for (
          const chosen of selected
        ) {

          const candidateText = `
            ${candidate.post.title}
            ${candidate.post.content ?? ""}
          `;

          const chosenText = `
            ${chosen.post.title}
            ${chosen.post.content ?? ""}
          `;

          const similarity =
            textSimilarity(
              candidateText,
              chosenText
            );

          maxSimilarity =
            Math.max(
              maxSimilarity,
              similarity
            );
        }

        // ----------------------------------------
        // MMR
        // ----------------------------------------

        const mmrScore =
          MMR_LAMBDA * relevance -
          (1 - MMR_LAMBDA) *
            maxSimilarity;

        console.log(
          "MMR:",
          candidate.post.title,
          "relevance:",
          relevance.toFixed(4),
          "redundancy:",
          maxSimilarity.toFixed(4),
          "score:",
          mmrScore.toFixed(4)
        );

        if (
          mmrScore > bestMMR
        ) {
          bestMMR =
            mmrScore;

          bestIndex =
            i;
        }
      }

      // ------------------------------------------
      // 选择当前最优知识
      // ------------------------------------------

      const selectedItem =
        remaining.splice(
          bestIndex,
          1
        )[0];

      selected.push(
        selectedItem
      );
    }

    // ==========================================
    // 8. 最终结果日志
    // ==========================================

    console.log(
      "RAG MMR 最终结果:",
      selected.map(
        (item) => ({
          id: item.post.id,
          title: item.post.title,
          score:
            Number(
              item.score.toFixed(4)
            ),
        })
      )
    );

    // ==========================================
    // 9. 返回最终 MMR 结果
    // ==========================================

    return selected;

  } catch (error) {

    console.error(
      "RAG 检索失败:",
      error
    );

    return [];
  }
}

export async function askKnowledge(
  question: string
) {
  try {
    const query = question.trim();

    if (!query) {
      throw new Error("问题不能为空");
    }

    console.log("开始 RAG 问答:", query);

    // ==========================================
    // 1. 检索知识库
    // ==========================================

    const results =
      await searchKnowledgeForRAG(
        query,
        aiConfig.retrievalTopK
      );

    console.log(
      "RAG 找到知识:",
      results.map((item) => ({
        id: item.post.id,
        title: item.post.title,
        score: Number(
          item.score.toFixed(4)
        ),
      }))
    );
    const ragMetrics = {
      question: query,
      retrievedCount: results.length,
      topScore:
        results.length > 0
          ? results[0].score
          : 0,
      sourceIds:
        results.map(
          (item) => item.post.id
        ),
    };
    console.log(
      "RAG Metrics:",
      ragMetrics
    );
    // ==========================================
    // 2. 没有足够相关知识
    // ==========================================

    if (results.length === 0) {
      const noResultAnswer = "根据当前知识库内容，无法确定。";
      await db.orm.public.RAGQueryLog.create({
        question: ragMetrics.question,
        retrievedCount: 0,
        topScore: 0,
        sourceIds: "[]",
        answer: noResultAnswer,
      });
      return {
        answer: noResultAnswer,
        sources: [],
      };
    }

    // ==========================================
    // 3. 构造高质量 Context
    // ==========================================

    const context = results
      .map((item, index) => {
        const post = item.post;

        const content = item.excerpt
          .trim()
          .slice(0, aiConfig.contextCharsPerDocument);

        const summary = (post.aiSummary ?? "")
          .trim();

        return `
    【知识 ${index + 1}】

    标题：
    ${post.title}

    匹配片段：第 ${item.chunkIndex + 1} 段

    正文：
    ${content || "暂无正文"}

    AI 摘要：
    ${summary || "暂无摘要"}
        `.trim();
      })
      .join(
        "\n\n====================\n\n"
      );

    console.log(
      "RAG Context 长度:",
      context.length
    );

    // ==========================================
    // 4. 构造严格 RAG Prompt
    // ==========================================

    const prompt = `
你是 KnowFlow 的知识库 AI 助手。

你的任务是根据“知识库内容”回答用户的问题。

【必须遵守的规则】

1. 只能使用知识库内容中的信息回答问题。
2. 不允许使用你自己的背景知识补充答案。
3. 不允许猜测、推测或编造知识库中不存在的信息。
4. 如果知识库内容无法充分回答问题，必须回答：
“根据当前知识库内容，无法确定。”
5. 如果只能回答问题的一部分，只回答能够从知识库确定的部分。
6. 回答应该简洁、准确、直接。
7. 使用中文回答。
8. 可以使用分点形式回答。
9. 不要提及知识库内部的技术实现。
10. 不要提及 Embedding、RAG、Context、Prompt 等词。
11. 不要重复用户的问题。
12. 不要虚构不存在的知识标题、知识内容或事实。

【判断标准】

回答中的每一个事实，都必须能够在下面提供的知识库内容中找到依据。

如果无法找到依据，就不要回答该事实。

【用户问题】

${query}

【知识库内容】

${context}

【回答】

请直接回答用户问题。
    `.trim();

    console.log(
      "RAG Prompt 长度:",
      prompt.length
    );

    // ==========================================
    // 5. 调用 Ollama
    // ==========================================

    const response =
      await fetch(
        `${aiConfig.ollamaBaseUrl}/api/generate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            model: aiConfig.chatModel,

            prompt,

            stream: false,

            think: false,

            options: {
              temperature: 0.1,
              num_predict: 300,
            },
          }),
        }
      );

    // ==========================================
    // 6. 检查 Ollama
    // ==========================================

    if (!response.ok) {
      throw new Error(
        `Ollama 请求失败: ${response.status}`
      );
    }

    // ==========================================
    // 7. 获取 AI 回答
    // ==========================================

    const data =
      await response.json();

    let answer =
      String(
        data.response ?? ""
      ).trim();

    if (!answer) {
      throw new Error(
        "AI 没有返回回答"
      );
    }

    // ==========================================
    // 8. 清理可能出现的 Markdown 包装
    // ==========================================

    answer = answer
      .replace(/^```[a-zA-Z]*\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // ==========================================
    // 9. 防止模型出现明显的无依据回答
    // ==========================================

    // if (
    //   answer.includes(
    //     "根据当前知识库内容，无法确定"
    //   )
    // ) {
    //   answer =
    //     "根据当前知识库内容，无法确定。";
    // }

    console.log(
      "RAG AI 回答:",
      answer
    );

    await db.orm.public.RAGQueryLog.create({
      question: ragMetrics.question,
      retrievedCount: ragMetrics.retrievedCount,
      topScore: ragMetrics.topScore,
      sourceIds: JSON.stringify(ragMetrics.sourceIds),
      answer,
    });

    // ==========================================
    // 10. 返回回答 + 来源
    // ==========================================

    return {
      answer,

      sources:
        results.map((item) => ({
          id: item.post.id,
          title: item.post.title,
          score: item.score,
          chunkIndex: item.chunkIndex,
          excerpt: item.excerpt.slice(0, 180),
        })),
    };

  } catch (error) {

    console.error(
      "RAG 问答失败:",
      error
    );

    throw new Error(
      "RAG 问答失败"
    );
  }
}

export async function reindexAllKnowledge() {
  const posts =
    await db.orm.public.Post.all();

  let updated = 0;
  let failed = 0;
  let chunks = 0;

  for (const post of posts) {
    try {
      const payload =
        await generateKnowledgeEmbedding(
          post.title,
          post.content ?? ""
        );

      await db.transaction(
        async (transaction) => {
          await transaction.orm.public.Post
            .where({
              id: post.id,
            })
            .update({
              embedding:
                JSON.stringify(payload),
            });

          await transaction.orm.public.KnowledgeChunk
            .where({
              postId: post.id,
            })
            .deleteAll();

          const chunkRows =
            buildKnowledgeChunkRows(
              post.id,
              payload
            );

          await transaction.orm.public.KnowledgeChunk
            .createAll(chunkRows);
        }
      );

      updated += 1;
      chunks += payload.chunks.length;
    } catch (error) {
      failed += 1;

      console.error(
        "知识重建索引失败:",
        post.id,
        error
      );
    }
  }

  revalidatePath("/");
  revalidatePath("/knowledge");
  revalidatePath("/system");

  console.log("知识索引重建完成:", {
    total: posts.length,
    updated,
    failed,
    chunks,
  });
}

export async function importKnowledgeFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("请选择文件");
  if (file.size > 2 * 1024 * 1024) throw new Error("文件不能超过 2MB");

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["txt", "md", "markdown"].includes(extension)) {
    throw new Error("目前支持 TXT、MD 和 Markdown 文件");
  }

  const content = (await file.text()).trim();
  if (!content) throw new Error("文件内容为空");
  const title = String(formData.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
  const knowledgeForm = new FormData();
  knowledgeForm.set("title", title);
  knowledgeForm.set("content", content);
  await createKnowledge(knowledgeForm);
  revalidatePath("/import");
  redirect("/");
}

