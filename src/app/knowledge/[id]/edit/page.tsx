import Link from "next/link";
import { db } from "@/prisma/db";
import { updateKnowledge } from "@/app/actions/knowledge";

export const dynamic = "force-dynamic";

export default async function EditKnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const knowledgeId = Number(id);

  const knowledge = await db.orm.public.Post
    .where({ id: knowledgeId })
    .first();

  if (!knowledge) {
    return (
      <main className="min-h-screen bg-slate-50 p-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-900">
            知识不存在
          </h1>

          <Link
            href="/"
            className="mt-6 inline-block text-blue-600"
          >
            返回知识库
          </Link>
        </div>
      </main>
    );
  }

  const updateAction = updateKnowledge.bind(null, knowledge.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-12">

        <header className="mb-8">
          <p className="mb-2 text-sm font-medium text-blue-600">
            KNOWFLOW
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            编辑知识
          </h1>

          <p className="mt-2 text-slate-500">
            修改你的知识内容。
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <form action={updateAction} className="space-y-6">

            <div>
              <label
                htmlFor="title"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                标题
              </label>

              <input
                id="title"
                name="title"
                type="text"
                defaultValue={knowledge.title}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="content"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                内容
              </label>

              <textarea
                id="content"
                name="content"
                rows={12}
                defaultValue={knowledge.content ?? ""}
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex gap-3">

              <Link
                href={`/knowledge/${knowledge.id}`}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                取消
              </Link>

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                保存修改
              </button>

            </div>

          </form>

        </section>
      </div>
    </main>
  );
}
