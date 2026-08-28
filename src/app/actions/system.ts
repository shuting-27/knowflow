"use server";

import { db } from "@/prisma/db";

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL ??
  "http://127.0.0.1:8000";

type AiServiceHealth = {
  status: "healthy" | "degraded";
  service: string;
  version: string;
  dependencies: {
    ollama: {
      status:
        | "healthy"
        | "degraded"
        | "unavailable";
      available: boolean;
      chat_model: {
        name: string;
        ready: boolean;
      };
      embedding_model: {
        name: string;
        ready: boolean;
      };
      installed_models: string[];
      latency_ms: number;
      error: string | null;
    };
  };
};

export async function getSystemHealth() {
  let database = false;
  let aiService = false;
  let ollama = false;

  let installedModels: string[] = [];
  let chatModel = "unknown";
  let embeddingModel = "unknown";
  let latencyMs = 0;
  let aiServiceError: string | null = null;

  try {
    await db.orm.public.Post.all();
    database = true;
  } catch (error) {
    console.error(
      "数据库健康检查失败:",
      error
    );
  }

  try {
    const response = await fetch(
      `${AI_SERVICE_URL}/api/v1/health`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(
        `AI服务返回状态码 ${response.status}`
      );
    }

    const data =
      (await response.json()) as AiServiceHealth;

    const ollamaHealth =
      data.dependencies.ollama;

    aiService = true;
    ollama = ollamaHealth.available;

    installedModels =
      ollamaHealth.installed_models;

    chatModel =
      ollamaHealth.chat_model.name;

    embeddingModel =
      ollamaHealth.embedding_model.name;

    latencyMs =
      ollamaHealth.latency_ms;

    if (data.status !== "healthy") {
      aiServiceError =
        ollamaHealth.error ??
        "AI服务处于降级状态";
    }
  } catch (error) {
    aiServiceError =
      error instanceof Error
        ? error.message
        : "无法连接AI服务";

    console.error(
      "AI服务健康检查失败:",
      error
    );
  }

  return {
    database,
    aiService,
    ollama,
    installedModels,
    chatModel,
    embeddingModel,
    latencyMs,
    aiServiceError,
  };
}