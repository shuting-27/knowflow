import { readFile } from "node:fs/promises";

import "dotenv/config";
import pgvector from "@prisma/orm-extension-pgvector/runtime";
import postgres from "@prisma/orm-postgres/runtime";

import contractJson from "../src/prisma/contract.json" with {
  type: "json",
};

const corpusFile =
  process.argv[2] ?? "evaluation/corpus.json";

const aiServiceUrl =
  process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";

const dimensions = 768;
const demoEmail = "demo@knowflow.local";

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const chunkSize = numberFromEnv(
  "RAG_CHUNK_SIZE",
  700
);

const chunkOverlap = numberFromEnv(
  "RAG_CHUNK_OVERLAP",
  120
);

const maxChunks = numberFromEnv(
  "RAG_MAX_CHUNKS",
  40
);

const db = postgres({
  contractJson,
  extensions: [pgvector],
  url: process.env.DATABASE_URL,
});

function validateCorpus(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("评测语料必须是非空JSON数组");
  }

  const titles = new Set();

  for (const row of rows) {
    if (
      typeof row.title !== "string" ||
      !row.title.trim() ||
      typeof row.content !== "string" ||
      !row.content.trim()
    ) {
      throw new Error(
        `评测语料格式错误: ${JSON.stringify(row)}`
      );
    }

    const title = row.title.trim();

    if (titles.has(title)) {
      throw new Error(`评测语料标题重复: ${title}`);
    }

    titles.add(title);
  }
}

async function prepareDocument(title, content) {
  const response = await fetch(
    `${aiServiceUrl}/api/v1/documents/prepare`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        title,
        content,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        max_chunks: maxChunks,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `文档预处理失败: ${response.status} ${errorText}`
    );
  }

  const result = await response.json();

  if (
    result.dimensions !== dimensions ||
    !Array.isArray(result.chunks) ||
    result.chunks.length === 0
  ) {
    throw new Error(
      `文档预处理结果无效: ${title}`
    );
  }

  for (const chunk of result.chunks) {
    if (
      !Number.isInteger(chunk.index) ||
      !Number.isInteger(chunk.start) ||
      !Number.isInteger(chunk.end) ||
      typeof chunk.text !== "string" ||
      !Array.isArray(chunk.embedding) ||
      chunk.embedding.length !== dimensions ||
      chunk.embedding.some(
        (value) => !Number.isFinite(value)
      )
    ) {
      throw new Error(
        `文档分块格式无效: ${title}`
      );
    }
  }

  return result;
}

function buildEmbeddingPayload(prepared) {
  return {
    version: 2,
    model: prepared.model,
    chunks: prepared.chunks.map((chunk) => ({
      index: chunk.index,
      text: chunk.text,
      start: chunk.start,
      end: chunk.end,
      embedding: chunk.embedding,
    })),
  };
}

function buildChunkRows(postId, payload) {
  return payload.chunks.map((chunk) => ({
    postId,
    chunkIndex: chunk.index,
    text: chunk.text,
    startOffset: chunk.start,
    endOffset: chunk.end,
    embedding: chunk.embedding,
    embeddingModel: payload.model,
  }));
}

const corpus = JSON.parse(
  await readFile(corpusFile, "utf8")
);

validateCorpus(corpus);

const stats = {
  corpus: corpus.length,
  created: 0,
  updated: 0,
  chunks: 0,
};

try {
  const userId = await db.transaction(
    async (transaction) => {
      let user =
        await transaction.orm.public.User
          .where({
            email: demoEmail,
          })
          .first();

      if (!user) {
        user =
          await transaction.orm.public.User.create({
            email: demoEmail,
            username: "demo",
            name: "KnowFlow Demo",
          });
      }

      return user.id;
    }
  );

  const existingPosts =
    await db.orm.public.Post.all();

  const postsByTitle = new Map();

  for (const post of existingPosts) {
    const title = post.title.trim();

    if (postsByTitle.has(title)) {
      throw new Error(
        `数据库中存在重复知识标题，无法安全初始化: ${title}`
      );
    }

    postsByTitle.set(title, post);
  }

  for (const source of corpus) {
    const title = source.title.trim();
    const content = source.content.trim();

    const prepared = await prepareDocument(
      title,
      content
    );

    const payload =
      buildEmbeddingPayload(prepared);

    const existing = postsByTitle.get(title);

    const post = await db.transaction(
      async (transaction) => {
        if (existing) {
          const updated =
            await transaction.orm.public.Post
              .where({
                id: existing.id,
              })
              .update({
                title,
                content,
                aiSummary: null,
                aiTags: null,
                embedding: JSON.stringify(payload),
              });

          await transaction.orm.public.KnowledgeChunk
            .where({
              postId: existing.id,
            })
            .deleteAll();

          await transaction.orm.public.KnowledgeChunk
            .createAll(
              buildChunkRows(
                existing.id,
                payload
              )
            );

          return updated;
        }

        const created =
          await transaction.orm.public.Post.create({
            title,
            content,
            authorId: userId,
            embedding: JSON.stringify(payload),
          });

        await transaction.orm.public.KnowledgeChunk
          .createAll(
            buildChunkRows(
              created.id,
              payload
            )
          );

        return created;
      }
    );

    postsByTitle.set(title, post);

    if (existing) {
      stats.updated++;
    } else {
      stats.created++;
    }

    stats.chunks += payload.chunks.length;

    console.log(
      existing ? "UPDATED" : "CREATED",
      post.id,
      title,
      `chunks=${payload.chunks.length}`,
      `model=${payload.model}`
    );
  }

  console.log("");
  console.log("评测语料初始化完成:", stats);
} finally {
  await db.close();
}