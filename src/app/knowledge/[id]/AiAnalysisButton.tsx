"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateAiAnalysis } from "@/app/actions/knowledge";

type AiAnalysisButtonProps = {
  id: number;
  hasAnalysis: boolean;
};

export default function AiAnalysisButton({
  id,
  hasAnalysis,
}: AiAnalysisButtonProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(hasAnalysis);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    try {
      setLoading(true);
      setError("");

      const formData = new FormData();
      formData.append("id", String(id));

      await generateAiAnalysis(formData);

      setAnalyzed(true);

      // 刷新 Server Component
      router.refresh();
    } catch (error) {
      console.error("AI 分析失败:", error);

      setError("AI 分析失败，请确认 Ollama 正在运行。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={loading}
        className={`rounded-xl px-5 py-3 font-medium text-white transition ${
          loading
            ? "cursor-not-allowed bg-slate-400"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {loading
          ? "AI 正在分析..."
          : analyzed
            ? "重新 AI 分析"
            : "开始 AI 分析"}
      </button>

      {loading && (
        <p className="mt-3 text-sm text-slate-500">
          Ollama 正在分析这篇知识，请稍候……
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}