const response = await fetch("http://127.0.0.1:11434/api/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "qwen3:1.7b",
    prompt: "请用一句中文介绍 React Server Components",
    stream: false,
    think: false,
  }),
});

console.log("HTTP 状态:", response.status);

const text = await response.text();

console.log("Ollama 原始返回:");
console.log(text);