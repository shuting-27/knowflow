import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import "dotenv/config";
import pgvector from "@prisma/orm-extension-pgvector/runtime";
import postgres from "@prisma/orm-postgres/runtime";

import contractJson from "../src/prisma/contract.json" with {
  type: "json",
};
import { lexicalOverlap } from "../src/lib/retrieval.ts";

const datasetFile =
  process.argv[2] ?? "evaluation/rag-retrieval.json";

const corpusFile =
  process.env.EVALUATION_CORPUS ??
  "evaluation/corpus.json";

const outputFile =
  process.argv[3] ??
  "evaluation/latest-results.json";

const aiServiceUrl =
  process.env.AI_SERVICE_URL ??
  "http://127.0.0.1:8000";

const topK = numberFromEnv("RAG_TOP_K", 5);
const minScore = numberFromEnv(
  "RAG_MIN_SCORE",
  0.35
);
const mmrLambda = numberFromEnv(
  "RAG_MMR_LAMBDA",
  0.7
);
const embeddingDimensions = 768;

const db = postgres({
  contractJson,
  extensions: [pgvector],
  url: process.env.DATABASE_URL,
});

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);

  return Number.isFinite(value)
    ? value
    : fallback;
}

function percentile(
  values,
  percentileValue
) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort(
    (left, right) => left - right
  );

  const index = Math.min(
    sorted.length - 1,
    Math.ceil(
      percentileValue * sorted.length
    ) - 1
  );

  return sorted[Math.max(index, 0)];
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length
  );
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function textSimilarity(
  left,
  right,
  n = 2
) {
  const normalize = (text) =>
    text
      .toLowerCase()
      .replace(/\s+/g, "")
      .slice(0, 1000);

  const ngrams = (text) => {
    const result = new Set();

    for (
      let index = 0;
      index <= text.length - n;
      index++
    ) {
      result.add(
        text.slice(index, index + n)
      );
    }

    return result;
  };

  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);

  if (
    !normalizedLeft ||
    !normalizedRight
  ) {
    return 0;
  }

  const leftSet = ngrams(
    normalizedLeft
  );
  const rightSet = ngrams(
    normalizedRight
  );

  if (
    leftSet.size === 0 ||
    rightSet.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (const value of leftSet) {
    if (rightSet.has(value)) {
      intersection++;
    }
  }

  const union = new Set([
    ...leftSet,
    ...rightSet,
  ]).size;

  return intersection / union;
}

async function generateEmbedding(text) {
  const response = await fetch(
    `${aiServiceUrl}/api/v1/embeddings`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      signal:
        AbortSignal.timeout(120_000),
      body: JSON.stringify({
        texts: [text],
        input_type: "query",
      }),
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Embedding请求失败: ` +
      `${response.status} ${errorText}`
    );
  }

  const data = await response.json();
  const embedding =
    data.embeddings?.[0];

  if (
    !Array.isArray(embedding) ||
    embedding.length !==
      embeddingDimensions ||
    embedding.some(
      (value) =>
        !Number.isFinite(value)
    )
  ) {
    throw new Error(
      "Embedding响应格式不正确"
    );
  }

  return {
    embedding,
    latencyMs: Number(
      data.latency_ms ?? 0
    ),
    model: String(
      data.model ?? "unknown"
    ),
  };
}

async function searchChunks(
  queryEmbedding,
  limit
) {
  const startedAt = performance.now();

  const rows = await db.transaction(
    async (transaction) => {
      const plan =
        transaction.sql.public
          .knowledge_chunk
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

      return await transaction.query(
        plan
      );
    }
  );

  return {
    rows,
    latencyMs:
      performance.now() - startedAt,
  };
}

function rankCandidates(
  question,
  vectorRows,
  postsById,
  allowedTitles,
  limit
) {
  const bestCandidateByPost =
    new Map();

  for (const row of vectorRows) {
    const postId = Number(row.postId);
    const similarity = Number(
      row.similarity
    );

    if (
      !Number.isInteger(postId) ||
      !Number.isFinite(similarity)
    ) {
      continue;
    }

    const current =
      bestCandidateByPost.get(postId);

    if (
      !current ||
      similarity > current.similarity
    ) {
      bestCandidateByPost.set(
        postId,
        {
          postId,
          chunkIndex: Number(
            row.chunkIndex
          ),
          text: String(
            row.text ?? ""
          ),
          similarity,
        }
      );
    }
  }

  const candidates = [];

  for (
    const candidate of
    bestCandidateByPost.values()
  ) {
    const post = postsById.get(
      candidate.postId
    );

    if (
      !post ||
      !allowedTitles.has(post.title)
    ) {
      continue;
    }

    const denseScore =
      candidate.similarity;

    const lexicalScore =
      lexicalOverlap(
        question,
        [
          post.title,
          candidate.text,
          post.aiTags ?? "",
        ].join("\n")
      );

    const score =
      denseScore * 0.85 +
      lexicalScore * 0.15;

    if (score < minScore) {
      continue;
    }

    candidates.push({
      post,
      chunkIndex:
        candidate.chunkIndex,
      excerpt: candidate.text,
      denseScore,
      lexicalScore,
      score,
    });
  }

  const selected = [];
  const remaining = [...candidates];

  while (
    selected.length < limit &&
    remaining.length > 0
  ) {
    let bestIndex = 0;
    let bestMmrScore = -Infinity;

    for (
      let index = 0;
      index < remaining.length;
      index++
    ) {
      const candidate =
        remaining[index];

      let maxSimilarity = 0;

      for (const chosen of selected) {
        const candidateText = [
          candidate.post.title,
          candidate.post.content ?? "",
        ].join("\n");

        const chosenText = [
          chosen.post.title,
          chosen.post.content ?? "",
        ].join("\n");

        maxSimilarity = Math.max(
          maxSimilarity,
          textSimilarity(
            candidateText,
            chosenText
          )
        );
      }

      const mmrScore =
        mmrLambda * candidate.score -
        (1 - mmrLambda) *
          maxSimilarity;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIndex = index;
      }
    }

    selected.push(
      remaining.splice(
        bestIndex,
        1
      )[0]
    );
  }

  return selected;
}

const dataset = JSON.parse(
  await readFile(
    datasetFile,
    "utf8"
  )
);

if (
  !Array.isArray(dataset) ||
  dataset.length === 0
) {
  throw new Error(
    "评测集必须是非空JSON数组"
  );
}

const corpus = JSON.parse(
  await readFile(
    corpusFile,
    "utf8"
  )
);

if (
  !Array.isArray(corpus) ||
  corpus.length === 0
) {
  throw new Error(
    "评测语料必须是非空JSON数组"
  );
}

const corpusTitles = new Set(
  corpus.map((item) =>
    String(
      item.title ?? ""
    ).trim()
  )
);

if (
  corpusTitles.size !==
    corpus.length ||
  [...corpusTitles].some(
    (title) => !title
  )
) {
  throw new Error(
    "评测语料标题为空或重复"
  );
}

for (const row of dataset) {
  if (
    typeof row.id !== "string" ||
    typeof row.question !==
      "string" ||
    !Array.isArray(
      row.relevantTitles
    ) ||
    !row.relevantTitles.every(
      (title) =>
        typeof title ===
          "string" &&
        title.trim()
    ) ||
    typeof row.shouldReject !==
      "boolean"
  ) {
    throw new Error(
      `评测数据格式错误: ` +
      `${JSON.stringify(row)}`
    );
  }

  for (
    const title of
    row.relevantTitles
  ) {
    if (!corpusTitles.has(title)) {
      throw new Error(
        `评测标注引用了语料中不存在的标题: ` +
        `${row.id} -> ${title}`
      );
    }
  }
}

const ks = [1, 3, 5];

const hits = Object.fromEntries(
  ks.map((k) => [k, 0])
);

let reciprocalRank = 0;
let positiveCount = 0;
let negativeCount = 0;
let rejectCorrect = 0;

const totalLatencies = [];
const embeddingLatencies = [];
const vectorLatencies = [];
const details = [];
const embeddingModels = new Set();

try {
  const posts =
    await db.orm.public.Post.all();

  const postsById = new Map(
    posts.map(
      (post) => [post.id, post]
    )
  );

  const availableCorpusTitles =
    new Set(
      posts
        .map((post) => post.title)
        .filter((title) =>
          corpusTitles.has(title)
        )
    );

  const missingCorpusTitles = [
    ...corpusTitles,
  ].filter(
    (title) =>
      !availableCorpusTitles.has(title)
  );

  if (
    missingCorpusTitles.length > 0
  ) {
    throw new Error(
      "数据库缺少评测语料，请先运行 " +
      "`npm run seed:evaluation`: " +
      missingCorpusTitles.join(", ")
    );
  }

  console.log(
    "KnowFlow RAG Retrieval Evaluation"
  );
  console.log(
    "================================="
  );
  console.log(
    "Dataset:",
    datasetFile
  );
  console.log(
    "Corpus:",
    corpusFile
  );
  console.log(
    "Corpus documents:",
    corpusTitles.size
  );
  console.log(
    "Questions:",
    dataset.length
  );
  console.log("Top-K:", topK);
  console.log(
    "Minimum score:",
    minScore
  );
  console.log(
    "MMR lambda:",
    mmrLambda
  );
  console.log("");

  for (
    let index = 0;
    index < dataset.length;
    index++
  ) {
    const row = dataset[index];

    const startedAt =
      performance.now();

    const embeddingResult =
      await generateEmbedding(
        row.question
      );

    embeddingModels.add(
      embeddingResult.model
    );

    const vectorResult =
      await searchChunks(
        embeddingResult.embedding,
        Math.max(
          topK * 6,
          30
        )
      );

    const ranked =
      rankCandidates(
        row.question,
        vectorResult.rows,
        postsById,
        corpusTitles,
        topK
      );

    const rankedIds =
      ranked.map(
        (item) => item.post.id
      );

    const rankedTitles =
      ranked.map(
        (item) => item.post.title
      );

    const relevantTitles =
      new Set(
        row.relevantTitles
      );

    const rejected =
      rankedTitles.length === 0;

    const totalLatencyMs =
      performance.now() -
      startedAt;

    totalLatencies.push(
      totalLatencyMs
    );

    embeddingLatencies.push(
      embeddingResult.latencyMs
    );

    vectorLatencies.push(
      vectorResult.latencyMs
    );

    let firstRelevantRank = -1;

    if (
      relevantTitles.size > 0
    ) {
      positiveCount++;

      for (const k of ks) {
        if (
          rankedTitles
            .slice(0, k)
            .some((title) =>
              relevantTitles.has(
                title
              )
            )
        ) {
          hits[k]++;
        }
      }

      firstRelevantRank =
        rankedTitles.findIndex(
          (title) =>
            relevantTitles.has(
              title
            )
        );

      if (
        firstRelevantRank >= 0
      ) {
        reciprocalRank +=
          1 /
          (firstRelevantRank + 1);
      }
    } else {
      negativeCount++;

      if (
        rejected ===
        row.shouldReject
      ) {
        rejectCorrect++;
      }
    }

    const passed =
      relevantTitles.size > 0
        ? firstRelevantRank >= 0
        : rejected ===
          row.shouldReject;

    const result = {
      id: row.id,
      question: row.question,
      relevantTitles:
        row.relevantTitles,
      rankedTitles,
      rankedIds,
      rejected,
      passed,
      firstRelevantRank:
        firstRelevantRank >= 0
          ? firstRelevantRank + 1
          : null,
      totalLatencyMs: Number(
        totalLatencyMs.toFixed(2)
      ),
      embeddingLatencyMs:
        Number(
          embeddingResult
            .latencyMs
            .toFixed(2)
        ),
      vectorLatencyMs: Number(
        vectorResult.latencyMs
          .toFixed(2)
      ),
      results: ranked.map(
        (item) => ({
          id: item.post.id,
          title:
            item.post.title,
          score: Number(
            item.score.toFixed(4)
          ),
          denseScore: Number(
            item.denseScore
              .toFixed(4)
          ),
          lexicalScore: Number(
            item.lexicalScore
              .toFixed(4)
          ),
          chunkIndex:
            item.chunkIndex,
        })
      ),
    };

    details.push(result);

    console.log(
      `[${String(index + 1)
        .padStart(2, "0")}` +
        `/${dataset.length}]`,
      passed ? "PASS" : "FAIL",
      row.id,
      `ranked=[${rankedTitles.join(
        " | "
      )}]`,
      `latency=${totalLatencyMs.toFixed(
        1
      )}ms`
    );
  }

  const summary = {
    dataset: datasetFile,
    corpus: corpusFile,
    corpusDocuments:
      corpusTitles.size,
    questions: dataset.length,
    positiveQuestions:
      positiveCount,
    negativeQuestions:
      negativeCount,
    hitAt1:
      positiveCount > 0
        ? hits[1] /
          positiveCount
        : 0,
    hitAt3:
      positiveCount > 0
        ? hits[3] /
          positiveCount
        : 0,
    hitAt5:
      positiveCount > 0
        ? hits[5] /
          positiveCount
        : 0,
    mrr:
      positiveCount > 0
        ? reciprocalRank /
          positiveCount
        : 0,
    rejectAccuracy:
      negativeCount > 0
        ? rejectCorrect /
          negativeCount
        : 0,
    averageTotalLatencyMs:
      average(totalLatencies),
    p95TotalLatencyMs:
      percentile(
        totalLatencies,
        0.95
      ),
    averageEmbeddingLatencyMs:
      average(
        embeddingLatencies
      ),
    averageVectorLatencyMs:
      average(vectorLatencies),
    p95VectorLatencyMs:
      percentile(
        vectorLatencies,
        0.95
      ),
  };

  console.log("");
  console.log(
    "Evaluation Summary"
  );
  console.log(
    "=================="
  );
  console.log(
    "Hit@1:",
    percent(summary.hitAt1)
  );
  console.log(
    "Hit@3:",
    percent(summary.hitAt3)
  );
  console.log(
    "Hit@5:",
    percent(summary.hitAt5)
  );
  console.log(
    "MRR:",
    summary.mrr.toFixed(4)
  );
  console.log(
    "Reject accuracy:",
    percent(
      summary.rejectAccuracy
    )
  );
  console.log(
    "Average total latency:",
    `${summary
      .averageTotalLatencyMs
      .toFixed(2)} ms`
  );
  console.log(
    "P95 total latency:",
    `${summary
      .p95TotalLatencyMs
      .toFixed(2)} ms`
  );
  console.log(
    "Average embedding latency:",
    `${summary
      .averageEmbeddingLatencyMs
      .toFixed(2)} ms`
  );
  console.log(
    "Average pgvector latency:",
    `${summary
      .averageVectorLatencyMs
      .toFixed(2)} ms`
  );
  console.log(
    "P95 pgvector latency:",
    `${summary
      .p95VectorLatencyMs
      .toFixed(2)} ms`
  );

  const failed = details.filter(
    (item) => !item.passed
  );

  console.log("");
  console.log(
    "Failed cases:",
    failed.length
  );

  for (const item of failed) {
    console.log(
      "-",
      item.id,
      JSON.stringify({
        relevantTitles:
          item.relevantTitles,
        rankedTitles:
          item.rankedTitles,
        rankedIds:
          item.rankedIds,
        results: item.results,
      })
    );
  }

  await writeFile(
    outputFile,
    `${JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),
        configuration: {
          topK,
          minScore,
          mmrLambda,
          aiServiceUrl,
          corpusFile,
          embeddingModels: [
            ...embeddingModels,
          ],
        },
        summary,
        details,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log("");
  console.log(
    "Result file:",
    outputFile
  );
} finally {
  await db.close();
}