const response = await fetch("http://localhost:11434/api/embeddings", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "nomic-embed-text",
    prompt: "React Server Components 是什么",
  }),
});

console.log("HTTP 状态:", response.status);

const data = await response.json();

console.log("Ollama 原始返回:");
console.log(data);

if (data.embedding) {
  console.log("embedding 长度:", data.embedding.length);
  console.log("前 10 个向量:", data.embedding.slice(0, 10));
}