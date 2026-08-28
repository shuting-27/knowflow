"use server";
import { db } from "@/prisma/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aiConfig } from "@/lib/ai-config";
import { bestChunkMatch, lexicalOverlap, parseTags, payloadSimilarity, serializeTags, type EmbeddingPayload } from "@/lib/retrieval";
import { splitTextIntoChunks } from "@/lib/chunking";

const DEMO_EMAIL = "demo@knowflow.local";

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(
    `${aiConfig.ollamaBaseUrl}/api/embeddings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.embeddingModel,
        prompt: text,
      }),
      signal: AbortSignal.timeout(aiConfig.requestTimeoutMs),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Ollama Embedding 请求失败: ${response.status}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data.embedding)) {
    throw new Error("Ollama 没有返回 embedding");
  }

  console.log(
    "Embedding 生成成功，维度:",
    data.embedding.length
  );

  return data.embedding;
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

    // 1. 查找 demo 用户
    let user = await db.orm.public.User
      .where({
        email: DEMO_EMAIL,
      })
      .first();

    // 2. 如果用户不存在，就创建
    if (!user) {
      user = await db.orm.public.User.create({
        email: DEMO_EMAIL,
        username: "demo",
        name: "KnowFlow Demo",
      });
    }

    // 3. 创建知识
    const post = await db.orm.public.Post.create({
      title,
      content: content || null,
      authorId: user.id,
      embedding: JSON.stringify(embedding),
    });

    console.log("知识创建成功:", title);
    console.log("知识 ID:", post.id);

    console.log(
      "Embedding 保存成功:",
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

    // 4. 生成搜索词 embedding
    const searchEmbedding = await generateEmbedding(search);

    console.log(
      "搜索 Embedding 生成成功:",
      searchEmbedding.length
    );

    // 6. 计算每篇知识的语义相似度
    const scoredPosts = filteredPosts.map((post) => {
      let semanticScore = 0;

      semanticScore = bestChunkMatch(searchEmbedding, post.embedding)?.score ?? 0;

      // 7. 保留传统关键词搜索
      const title =
        post.title?.toLowerCase() ?? "";

      const content =
        post.content?.toLowerCase() ?? "";

      const aiTags =
        post.aiTags?.toLowerCase() ?? "";

      const keywordMatch =
        title.includes(keyword) ||
        content.includes(keyword) ||
        aiTags.includes(keyword);

      // 关键词匹配给予额外加分
      const finalScore =
        semanticScore * 0.85 +
        (keywordMatch ? 0.15 : 0);
      
      console.log(
        "搜索相关度:",
        post.title,
        "semantic:",
        semanticScore.toFixed(4),
        "keyword:",
        keywordMatch,
        "final:",
        finalScore.toFixed(4)
      );

      return {
        ...post,
        _score: finalScore,
      };
    });

    // 8. 设置最低相关度
    const MIN_SCORE = 0.65;

    // 9. 最多返回前 5 个最相关结果
    const TOP_K = 5;

    // 10. 先过滤，再排序，再限制数量
    const relevantPosts = scoredPosts
      .filter((post) => post._score >= MIN_SCORE)
      .sort((a, b) => b._score - a._score)
      .slice(0, TOP_K);

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
    // 1. 确认知识存在
    const knowledge = await db.orm.public.Post
      .where({ id })
      .first();

    if (!knowledge) {
      throw new Error("知识不存在");
    }

    console.log("开始更新知识:", id);

    // 2. 更新标题和内容
    await db.orm.public.Post
      .where({ id })
      .update({
        title,
        content: content || null,

        // 内容变化后，旧 AI 分析失效
        aiSummary: null,
        aiTags: null,

        // 先清除旧 embedding
        embedding: null,
      });

    console.log("知识内容更新成功:", id);

    // 3. 重新生成 embedding
    console.log("开始重新生成 Embedding:", id);

    const embedding = await generateKnowledgeEmbedding(title, content);

    // 4. 保存新的 embedding
    await db.orm.public.Post
      .where({ id })
      .update({
        embedding: JSON.stringify(embedding),
      });

    console.log(
      "Embedding 更新成功:",
      id,
      "Chunk 数:",
      embedding.chunks.length
    );

    await analyzeKnowledge(id);

    console.log(
      "AI 摘要和标签更新成功:",
      id
    );

    // 5. 刷新页面缓存
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

async function analyzeKnowledge(id: number) {
  // 查询知识
  const knowledge = await db.orm.public.Post
    .where({ id })
    .first();

  if (!knowledge) {
    throw new Error("知识不存在");
  }

  console.log(
    "开始 AI 分析:",
    id,
    knowledge.title
  );

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
请分析下面这篇知识内容。

请严格返回 JSON，不要返回 Markdown，不要返回解释。

格式必须是：

{
  "summary": "一句到两句话的中文摘要",
  "tags": [
    "标签1",
    "标签2",
    "标签3",
    "标签4"
  ]
}

要求：

1. summary 必须简洁准确
2. tags 返回 3~5 个最重要的标签
3. 标签使用中文或常见技术名称
4. 不要出现 # 符号
5. 只返回 JSON

标题：
${knowledge.title}

内容：
${knowledge.content ?? ""}
        `,

        stream: false,
        think: false,

        options: {
          temperature: 0.2,
          num_predict: 200,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Ollama 请求失败: ${response.status}`
    );
  }

  const data = await response.json();

  console.log(
    "Ollama AI 分析原始返回:",
    data.response
  );

  const cleanResponse = String(data.response ?? "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const result = JSON.parse(cleanResponse);

  const summary =
    typeof result.summary === "string"
      ? result.summary.trim()
      : "";

  const tags = Array.isArray(result.tags)
    ? result.tags
        .map((tag: unknown) =>
          String(tag).trim()
        )
        .filter(Boolean)
        .slice(0, 5)
    : [];

  if (!summary) {
    throw new Error("AI 没有返回摘要");
  }

  await db.orm.public.Post
    .where({ id })
    .update({
      aiSummary: summary,
      aiTags: serializeTags(tags),
    });

  console.log(
    "AI 分析保存成功:",
    id
  );

  return {
    summary,
    tags,
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
  const posts = await db.orm.public.Post.all();
  let updated = 0;
  let failed = 0;

  for (const post of posts) {
    try {
      const payload = await generateKnowledgeEmbedding(post.title, post.content ?? "");
      await db.orm.public.Post.where({ id: post.id }).update({ embedding: JSON.stringify(payload) });
      updated++;
    } catch (error) {
      failed++;
      console.error("知识重建索引失败:", post.id, error);
    }
  }

  revalidatePath("/");
  revalidatePath("/knowledge");
  revalidatePath("/system");
  console.log("知识索引重建完成:", { total: posts.length, updated, failed });
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

async function generateKnowledgeEmbedding(title: string, content: string): Promise<EmbeddingPayload> {
  const source = `标题：${title}\n\n${content}`.trim();
  const chunks = splitTextIntoChunks(source, aiConfig.chunkSize, aiConfig.chunkOverlap, aiConfig.maxChunksPerKnowledge);
  const embedded = [];
  for (const chunk of chunks) embedded.push({ ...chunk, embedding: await generateEmbedding(chunk.text) });
  return { version: 2, model: aiConfig.embeddingModel, chunks: embedded };
}
