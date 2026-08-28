"use server";

import { db } from "@/prisma/db";
import { aiConfig } from "@/lib/ai-config";

export async function getSystemHealth() {
  const startedAt = Date.now();
  let database = false;
  let ollama = false;
  let installedModels: string[] = [];

  try {
    await db.orm.public.Post.all();
    database = true;
  } catch { database = false; }

  try {
    const response = await fetch(`${aiConfig.ollamaBaseUrl}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json() as { models?: { name?: string }[] };
      installedModels = (data.models ?? []).map((model) => model.name ?? "").filter(Boolean);
      ollama = true;
    }
  } catch { ollama = false; }

  return {
    database,
    ollama,
    installedModels,
    chatModel: aiConfig.chatModel,
    embeddingModel: aiConfig.embeddingModel,
    latencyMs: Date.now() - startedAt,
  };
}

