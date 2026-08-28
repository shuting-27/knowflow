export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function parseEmbedding(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "number") ? parsed : null;
  } catch { return null; }
}

export type EmbeddedChunk = {
  index: number;
  text: string;
  start: number;
  end: number;
  embedding: number[];
};

export type EmbeddingPayload = {
  version: 2;
  model: string;
  chunks: EmbeddedChunk[];
};

export function parseEmbeddingPayload(value: string | null | undefined): EmbeddingPayload | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "number")) {
      return { version: 2, model: "legacy", chunks: [{ index: 0, text: "", start: 0, end: 0, embedding: parsed }] };
    }
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as Partial<EmbeddingPayload>;
    if (payload.version !== 2 || !Array.isArray(payload.chunks)) return null;
    const chunks = payload.chunks.filter((chunk) =>
      chunk && Array.isArray(chunk.embedding) && chunk.embedding.every((item) => typeof item === "number")
    );
    return { version: 2, model: String(payload.model ?? "unknown"), chunks };
  } catch { return null; }
}

export function bestChunkMatch(query: number[], value: string | null | undefined) {
  const payload = parseEmbeddingPayload(value);
  if (!payload || payload.chunks.length === 0) return null;
  return payload.chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(query, chunk.embedding) }))
    .sort((left, right) => right.score - left.score)[0];
}

export function payloadSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const a = parseEmbeddingPayload(left);
  const b = parseEmbeddingPayload(right);
  if (!a || !b) return 0;
  let best = 0;
  for (const x of a.chunks) for (const y of b.chunks) best = Math.max(best, cosineSimilarity(x.embedding, y.embedding));
  return best;
}

export function parseTags(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).map((tag) => tag.trim()).filter(Boolean);
  } catch { /* support legacy comma-separated tags */ }
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

export function serializeTags(tags: string[]) {
  return JSON.stringify([...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]);
}

export function textJaccardSimilarity(left: string, right: string, n = 2) {
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, "").slice(0, 2000);
  const ngrams = (text: string) => {
    const result = new Set<string>();
    for (let index = 0; index <= text.length - n; index++) result.add(text.slice(index, index + n));
    return result;
  };
  const a = ngrams(normalize(left));
  const b = ngrams(normalize(right));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return intersection / new Set([...a, ...b]).size;
}

export function lexicalOverlap(query: string, document: string) {
  const tokens = (value: string) => {
    const normalized = value.toLowerCase();
    const words = normalized.match(/[a-z0-9_+#.-]{2,}/g) ?? [];
    const chinese = normalized.match(/[\u4e00-\u9fff]/g)?.join("") ?? "";
    const bigrams = [];
    for (let index = 0; index < chinese.length - 1; index++) bigrams.push(chinese.slice(index, index + 2));
    return new Set([...words, ...bigrams]);
  };
  const q = tokens(query);
  const d = tokens(document);
  if (q.size === 0) return 0;
  let hits = 0;
  for (const token of q) if (d.has(token)) hits++;
  return hits / q.size;
}
