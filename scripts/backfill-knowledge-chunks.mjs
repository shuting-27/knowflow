import "dotenv/config";

import pgvector from "@prisma/orm-extension-pgvector/runtime";
import postgres from "@prisma/orm-postgres/runtime";

import contractJson from "../src/prisma/contract.json" with {
  type: "json",
};

const VECTOR_DIMENSIONS = 768;
const shouldApply = process.argv.includes("--apply");

const db = postgres({
  contractJson,
  extensions: [pgvector],
});

const runtime = await db.connect({
  url: process.env.DATABASE_URL,
});

function getRows(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result?.rows)) {
    return result.rows;
  }

  throw new Error(
    `无法识别Prisma查询结果: ${
      Object.keys(result ?? {}).join(", ")
    }`
  );
}

function parseStoredPayload(post) {
  if (!post.embedding) {
    return null;
  }

  const parsed = JSON.parse(post.embedding);
  const source =
    `标题：${post.title}\n\n${post.content ?? ""}`.trim();

  if (
    Array.isArray(parsed) &&
    parsed.every(Number.isFinite)
  ) {
    return {
      model: "legacy",
      chunks: [
        {
          index: 0,
          text: source,
          start: 0,
          end: source.length,
          embedding: parsed,
        },
      ],
    };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.version !== 2 ||
    typeof parsed.model !== "string" ||
    !Array.isArray(parsed.chunks)
  ) {
    throw new Error("EmbeddingPayload格式不正确");
  }

  return {
    model: parsed.model,
    chunks: parsed.chunks,
  };
}

function validateChunk(chunk) {
  return (
    chunk &&
    Number.isInteger(chunk.index) &&
    chunk.index >= 0 &&
    typeof chunk.text === "string" &&
    chunk.text.length > 0 &&
    Number.isInteger(chunk.start) &&
    Number.isInteger(chunk.end) &&
    chunk.start >= 0 &&
    chunk.end > chunk.start &&
    Array.isArray(chunk.embedding) &&
    chunk.embedding.length === VECTOR_DIMENSIONS &&
    chunk.embedding.every(Number.isFinite)
  );
}

try {
  const posts = getRows(
    await runtime.query(
      db.sql.public.post
        .select("id")
        .select("title")
        .select("content")
        .select("embedding")
        .build()
    )
  );

  const existingChunks = getRows(
    await runtime.query(
      db.sql.public.knowledge_chunk
        .select("postId")
        .select("chunkIndex")
        .build()
    )
  );

  const existingKeys = new Set(
    existingChunks.map(
      (chunk) =>
        `${chunk.postId}:${chunk.chunkIndex}`
    )
  );

  const pendingRows = [];
  const stats = {
    posts: posts.length,
    withoutEmbedding: 0,
    invalidPosts: 0,
    duplicateChunks: 0,
    alreadyExisting: 0,
    pending: 0,
  };

  for (const post of posts) {
    try {
      const payload = parseStoredPayload(post);

      if (!payload) {
        stats.withoutEmbedding += 1;
        continue;
      }

      const indexes = new Set();

      for (const chunk of payload.chunks) {
        if (!validateChunk(chunk)) {
          throw new Error(
            `Chunk ${chunk?.index ?? "unknown"} 校验失败`
          );
        }

        if (indexes.has(chunk.index)) {
          stats.duplicateChunks += 1;
          throw new Error(
            `存在重复Chunk索引: ${chunk.index}`
          );
        }

        indexes.add(chunk.index);

        const key = `${post.id}:${chunk.index}`;

        if (existingKeys.has(key)) {
          stats.alreadyExisting += 1;
          continue;
        }

        pendingRows.push({
          postId: post.id,
          chunkIndex: chunk.index,
          text: chunk.text,
          startOffset: chunk.start,
          endOffset: chunk.end,
          embedding: chunk.embedding,
          embeddingModel: payload.model,
        });

        existingKeys.add(key);
      }
    } catch (error) {
      stats.invalidPosts += 1;

      console.error("知识回填校验失败:", {
        postId: post.id,
        title: post.title,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  stats.pending = pendingRows.length;

  console.log("知识分块回填统计:", stats);

  if (!shouldApply) {
    console.log(
      "当前为预览模式，使用 --apply 执行写入"
    );
  } else if (stats.invalidPosts > 0) {
    throw new Error(
      "存在无效知识记录，已取消全部写入"
    );
  } else if (pendingRows.length === 0) {
    console.log("没有需要写入的新分块");
  } else {
    const result = await runtime.execute(
      db.sql.public.knowledge_chunk
        .insert(pendingRows)
        .build()
    );

    console.log("知识分块写入完成:", result);

    if (
      result.affectedRows !== pendingRows.length
    ) {
      throw new Error(
        "实际写入数量与计划数量不一致"
      );
    }
  }
} finally {
  await runtime.close();
}