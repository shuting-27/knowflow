export type TextChunk = {
  index: number;
  text: string;
  start: number;
  end: number;
};

export function splitTextIntoChunks(
  input: string,
  chunkSize = 700,
  overlap = 120,
  maxChunks = 40
): TextChunk[] {
  const text = input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];
  if (chunkSize < 100 || overlap < 0 || overlap >= chunkSize) {
    throw new Error("无效的 Chunk 参数");
  }

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < text.length && chunks.length < maxChunks) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const candidates = [window.lastIndexOf("\n\n"), window.lastIndexOf("。"), window.lastIndexOf("！"), window.lastIndexOf("？")];
      const boundary = Math.max(...candidates);
      if (boundary >= Math.floor(chunkSize * 0.55)) end = start + boundary + 1;
    }

    const value = text.slice(start, end).trim();
    if (value) chunks.push({ index: chunks.length, text: value, start, end });
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

