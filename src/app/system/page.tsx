import { getSystemHealth } from "@/app/actions/system";
import { reindexAllKnowledge } from "@/app/actions/knowledge";

export const dynamic = "force-dynamic";

function Status({ ok }: { ok: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{ok ? "运行正常" : "不可用"}</span>;
}

export default async function SystemPage() {
  const health = await getSystemHealth();
  const hasChatModel = health.installedModels.some((name) => name.startsWith(health.chatModel));
  const hasEmbeddingModel = health.installedModels.some((name) => name.startsWith(health.embeddingModel));

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold text-blue-600">SYSTEM HEALTH</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">系统状态</h1>
        <p className="mt-2 text-sm text-slate-500">快速检查 RAG 链路依赖，诊断数据库或模型未启动问题。</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            ["PostgreSQL", "知识、向量与查询日志持久化", health.database],
            ["Ollama", `服务探测耗时 ${health.latencyMs}ms`, health.ollama],
            [health.chatModel, "本地回答与知识分析模型", hasChatModel],
            [health.embeddingModel, "文档及查询向量模型", hasEmbeddingModel],
          ].map(([name, description, ok]) => (
            <section key={String(name)} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">{String(name)}</h2><Status ok={Boolean(ok)} /></div>
              <p className="mt-3 text-sm text-slate-500">{String(description)}</p>
            </section>
          ))}
        </div>
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-900">旧数据升级</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">升级到 Chunk 检索后，可执行一次重建索引。该操作会逐篇调用本地 Embedding 模型，数据较多时需要等待。</p>
          <form action={reindexAllKnowledge} className="mt-4">
            <button className="rounded-xl bg-amber-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-800">重建全部知识索引</button>
          </form>
        </section>
      </div>
    </main>
  );
}
