const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

export const aiConfig = {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  chatModel: process.env.OLLAMA_CHAT_MODEL ?? "qwen3:1.7b",
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
  retrievalTopK: numberFromEnv("RAG_TOP_K", 5),
  retrievalMinScore: numberFromEnv("RAG_MIN_SCORE", 0.55),
  mmrLambda: numberFromEnv("RAG_MMR_LAMBDA", 0.7),
  contextCharsPerDocument: numberFromEnv("RAG_CONTEXT_CHARS", 2000),
  chunkSize: numberFromEnv("RAG_CHUNK_SIZE", 700),
  chunkOverlap: numberFromEnv("RAG_CHUNK_OVERLAP", 120),
  maxChunksPerKnowledge: numberFromEnv("RAG_MAX_CHUNKS", 40),
  requestTimeoutMs: numberFromEnv("OLLAMA_TIMEOUT_MS", 120000),
};
