"use client";
import Link from "next/link";
import { useState } from "react";
import { askKnowledge } from "@/app/actions/knowledge";

type Source = {
  id: number;
  title: string;
  score: number;
  chunkIndex: number;
  excerpt: string;
};

export default function RagChat() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAsk() {
    const q = question.trim();

    if (!q || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setAnswer("");
    setSources([]);

    try {
      const result = await askKnowledge(q);

      setAnswer(result.answer);
      setSources(result.sources);
    } catch (error) {
      console.error("RAG 问答失败:", error);

      setError("AI 问答失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* 标题 */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>

          <h2 className="text-xl font-semibold text-slate-900">
            AI 知识问答
          </h2>
        </div>

        <p className="mt-2 text-sm text-slate-500">
          基于你的知识库回答问题，而不是凭空生成答案。
        </p>
      </div>

      {/* 输入区域 */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleAsk();
            }
          }}
          placeholder="例如：React Server Components 是什么？"
          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          disabled={loading}
        />

        <button
          type="button"
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "AI 思考中..." : "AI 问答"}
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* AI 回答 */}
      {answer && (
        <div className="mt-6">
          <div className="mb-2 text-sm font-medium text-blue-600">
            AI 回答
          </div>

          <div className="rounded-xl bg-blue-50 px-5 py-4">
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {answer}
            </p>
          </div>
        </div>
      )}

      {/* 来源 */}
      {sources.length > 0 && (
        <div className="mt-6">

            <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">
                参考知识
            </div>

            <div className="text-xs text-slate-400">
                {sources.length} 条来源
            </div>
            </div>

            <div className="space-y-3">

            {sources.map((source) => (
                <Link
                key={source.id}
                href={`/knowledge/${source.id}`}
                className="block rounded-xl border border-slate-200 px-4 py-4 transition hover:border-blue-300 hover:bg-blue-50"
                >

                <div className="flex items-start justify-between gap-4">

                    <div className="min-w-0">

                    <div className="flex items-center gap-2">

                        <span className="text-sm">
                        📄
                        </span>

                        <p className="truncate text-sm font-medium text-slate-800">
                        {source.title}
                        </p>

                    </div>

                    <p className="mt-2 text-xs text-slate-400">
                        第 {source.chunkIndex + 1} 个匹配片段 · 与问题的语义相似度
                    </p>

                    {source.excerpt && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                        {source.excerpt}
                      </p>
                    )}

                    </div>

                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    {(source.score * 100).toFixed(1)}%
                    </span>

                </div>

                <div className="mt-3 flex items-center justify-end">
                    <span className="text-xs font-medium text-blue-600">
                    查看知识 →
                    </span>
                </div>

                </Link>
            ))}

            </div>

        </div>
      )}
    </section>
  );
}
