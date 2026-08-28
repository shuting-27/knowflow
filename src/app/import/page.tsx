import Link from "next/link";
import { importKnowledgeFile } from "@/app/actions/knowledge";

export default function ImportPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold text-blue-600">KNOWFLOW INGESTION</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">导入知识文件</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          导入 TXT 或 Markdown 文件。系统会自动进行重叠切分并为每个片段生成 Embedding。
        </p>

        <form action={importKnowledgeFile} className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <div>
            <label htmlFor="title" className="mb-2 block text-sm font-medium text-slate-700">知识标题（可选）</label>
            <input id="title" name="title" placeholder="留空时使用文件名" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label htmlFor="file" className="mb-2 block text-sm font-medium text-slate-700">知识文件</label>
            <input id="file" name="file" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" required className="w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm" />
            <p className="mt-2 text-xs text-slate-400">最大 2MB；长文档最多生成 40 个片段。</p>
          </div>
          <div className="flex gap-3">
            <button className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800">导入并向量化</button>
            <Link href="/" className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-medium text-slate-600">取消</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
