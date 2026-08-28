"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateAiSummary } from "@/app/actions/knowledge";

type AiSummaryButtonProps = {
  id: number;
  hasSummary: boolean;
};

export default function AiSummaryButton({
  id,
  hasSummary,
}: AiSummaryButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    try {
      setLoading(true);

      await generateAiSummary(id);

      router.refresh();
    } catch (error) {
      console.error("生成 AI 摘要失败:", error);
      alert("生成 AI 摘要失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={loading}
      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading
        ? "AI 正在生成..."
        : hasSummary
          ? "重新生成 AI 摘要"
          : "生成 AI 摘要"}
    </button>
  );
}