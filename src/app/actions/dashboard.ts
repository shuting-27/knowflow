"use server";

import { db } from "@/prisma/db";

export async function getDashboardStats() {
  try {
    // ==========================================
    // 1. 获取知识库
    // ==========================================

    const posts =
      await db.orm.public.Post.all();

    // ==========================================
    // 2. 获取 RAG 查询记录
    // ==========================================

    const ragLogs =
    await db.orm.public.RAGQueryLog
        .orderBy(
        (log) => log.createdAt.asc()
        )
        .all();

    // ==========================================
    // 3. 知识库统计
    // ==========================================

    const knowledgeCount =
      posts.length;

    const aiSummaryCount =
      posts.filter(
        (post) =>
          !!post.aiSummary?.trim()
      ).length;

    const aiTagCount =
      posts.filter(
        (post) =>
          !!post.aiTags?.trim()
      ).length;

    const embeddingCount =
      posts.filter(
        (post) =>
          !!post.embedding?.trim()
      ).length;

    // ==========================================
    // 4. RAG 基础统计
    // ==========================================

    const ragQueryCount =
      ragLogs.length;

    const totalRetrieved =
      ragLogs.reduce(
        (sum, log) =>
          sum + log.retrievedCount,
        0
      );

    const avgRetrievedCount =
      ragQueryCount > 0
        ? totalRetrieved /
          ragQueryCount
        : 0;

    // ==========================================
    // 5. 平均 Top Score
    // ==========================================

    const scoredLogs =
      ragLogs.filter(
        (log) =>
          log.topScore !== null &&
          log.topScore !== undefined
      );

    const totalScore =
      scoredLogs.reduce(
        (sum, log) =>
          sum + (log.topScore ?? 0),
        0
      );

    const avgTopScore =
      scoredLogs.length > 0
        ? totalScore /
          scoredLogs.length
        : 0;

    // ==========================================
    // 6. 无结果查询
    // ==========================================

    const noResultCount =
      ragLogs.filter(
        (log) =>
          log.retrievedCount === 0
      ).length;

    // ==========================================
    // 7. 有结果查询
    // ==========================================

    const successfulQueryCount =
      ragLogs.filter(
        (log) =>
          log.retrievedCount > 0
      ).length;

    // ==========================================
    // 8. RAG 有效检索率
    // ==========================================

    const ragSuccessRate =
      ragQueryCount > 0
        ? (
            successfulQueryCount /
            ragQueryCount
          ) * 100
        : 0;

    // ==========================================
    // 9. AI 能力覆盖率
    // ==========================================

    const aiCoverage =
      knowledgeCount > 0
        ? (
            (
              aiSummaryCount +
              aiTagCount +
              embeddingCount
            ) /
            (knowledgeCount * 3)
          ) * 100
        : 0;

    // ==========================================
    // 10. 最近 RAG 查询
    // ==========================================

    const recentQueries =
      [...ragLogs]
        .sort(
          (a, b) =>
            new Date(
              b.createdAt
            ).getTime() -
            new Date(
              a.createdAt
            ).getTime()
        )
        .slice(0, 10)
        .map((log) => ({
          id: log.id,

          question:
            log.question,

          retrievedCount:
            log.retrievedCount,

          topScore:
            log.topScore ?? 0,

          createdAt:
            log.createdAt,
        }));

    const ragTrend = ragLogs.map((log) => ({
    id: log.id,

    question: log.question,

    retrievedCount:
        log.retrievedCount,

    topScore:
        log.topScore ?? 0,

    createdAt:
        String(log.createdAt),
    }));
    // ==========================================
    // 11. 输出 Dashboard Metrics
    // ==========================================

    const stats = {
      // Knowledge
      knowledgeCount,

      aiSummaryCount,

      aiTagCount,

      embeddingCount,

      // RAG
      ragQueryCount,

      ragTrend,

      avgRetrievedCount:
        Number(
          avgRetrievedCount.toFixed(2)
        ),

      avgTopScore:
        Number(
          avgTopScore.toFixed(4)
        ),

      noResultCount,

      successfulQueryCount,

      ragSuccessRate:
        Number(
          ragSuccessRate.toFixed(1)
        ),

      // AI
      aiCoverage:
        Number(
          aiCoverage.toFixed(1)
        ),

      // Recent
      recentQueries,
    };

    console.log(
      "Dashboard Stats:",
      stats
    );

    return stats;

  } catch (error) {

    console.error(
      "Dashboard 数据获取失败:",
      error
    );

    throw new Error(
      "Dashboard 数据获取失败"
    );
  }
}