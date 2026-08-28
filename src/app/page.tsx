import Link from "next/link";
import { parseTags } from "@/lib/retrieval";

import {
  createKnowledge,
  getKnowledgeList,
  getAllKnowledgeTags,
  getKnowledgeStats,
} from "./actions/knowledge";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tag?: string;
  }>;
}) {
  const params = await searchParams;

  const allTags = await getAllKnowledgeTags();
  const stats = await getKnowledgeStats();

  const query = params.q ?? "";
  const tag = params.tag ?? "";

  const knowledge = await getKnowledgeList(query, tag);

  // ==========================================
  // 首页只展示最近 4 条
  // ==========================================

  const recentKnowledge = knowledge.slice(0, 4);

  return (
    <main className="min-h-screen bg-slate-50">

      <div className="mx-auto max-w-6xl px-6 py-10">

        {/* ========================================== */}
        {/* Header */}
        {/* ========================================== */}

        <header className="mb-10">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-lg text-white shadow-sm">
              K
            </div>

            <div>

              <p className="text-sm font-semibold tracking-wide text-blue-600">
                KNOWFLOW
              </p>

              <p className="text-xs text-slate-400">
                AI Knowledge Platform
              </p>

            </div>

          </div>

          <div className="mt-7">

            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              我的知识库
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              把学习过程中遇到的重要知识沉淀下来，
              让 AI 帮你整理、理解和检索。
            </p>

          </div>

        </header>


        {/* ========================================== */}
        {/* Knowledge Stats */}
        {/* ========================================== */}

        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">

          {/* Total */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex items-center justify-between">

              <p className="text-sm font-medium text-slate-500">
                知识总数
              </p>

              <span className="text-lg">
                📚
              </span>

            </div>

            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              {stats.total}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              当前知识库中的知识
            </p>

          </div>


          {/* Summary */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex items-center justify-between">

              <p className="text-sm font-medium text-slate-500">
                AI 摘要
              </p>

              <span className="text-lg">
                ✨
              </span>

            </div>

            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              {stats.withSummary}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              已生成 AI 摘要
            </p>

          </div>


          {/* Tags */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex items-center justify-between">

              <p className="text-sm font-medium text-slate-500">
                AI 标签
              </p>

              <span className="text-lg">
                🏷️
              </span>

            </div>

            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              {stats.tagCount}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              已完成标签生成
            </p>

          </div>


          {/* Updated */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex items-center justify-between">

              <p className="text-sm font-medium text-slate-500">
                最近更新
              </p>

              <span className="text-lg">
                🕒
              </span>

            </div>

            <p className="mt-3 text-lg font-bold tracking-tight text-slate-900">

              {stats.latestUpdatedAt
                ? new Date(
                    stats.latestUpdatedAt
                  ).toLocaleDateString(
                    "zh-CN"
                  )
                : "-"}

            </p>

            <p className="mt-1 text-xs text-slate-400">
              最近一次知识更新
            </p>

          </div>

        </section>


        {/* ========================================== */}
        {/* Search */}
        {/* ========================================== */}

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="mb-5">

            <h2 className="text-lg font-semibold text-slate-900">
              搜索知识
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              快速查找知识库中的内容
            </p>

          </div>


          <form
            method="GET"
            action="/"
            className="flex flex-col gap-3 sm:flex-row"
          >

            <div className="relative flex-1">

              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                🔍
              </span>

              <input
                name="q"
                defaultValue={query}
                placeholder="搜索知识，例如：React、Next.js、数据库..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />

            </div>


            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              搜索
            </button>


            {query && (

              <Link
                href="/"
                className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                清除
              </Link>

            )}

          </form>


          {/* AI Tags */}

          {allTags.length > 0 && (

            <div className="mt-5">

              <div className="mb-3 flex items-center gap-2">

                <span className="text-sm font-medium text-slate-600">
                  AI 标签
                </span>

                <span className="text-xs text-slate-400">
                  按标签筛选
                </span>

              </div>


              <div className="flex flex-wrap gap-2">

                <Link
                  href={`/?q=${encodeURIComponent(query)}`}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    !tag
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  全部
                </Link>


                {allTags.map((item) => (

                  <Link
                    key={item}
                    href={`/?q=${encodeURIComponent(
                      query
                    )}&tag=${encodeURIComponent(
                      item
                    )}`}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      tag.toLowerCase() ===
                      item.toLowerCase()
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {item}
                  </Link>

                ))}

              </div>

            </div>

          )}

        </section>


        {/* ========================================== */}
        {/* Create Knowledge */}
        {/* ========================================== */}

        <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="mb-6">

            <div className="flex items-center gap-3">

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-lg">
                ✨
              </div>

              <div>

                <h2 className="text-lg font-semibold text-slate-900">
                  新建知识
                </h2>

                <p className="mt-0.5 text-sm text-slate-400">
                  将新的学习内容保存到 KnowFlow
                </p>

              </div>

            </div>

          </div>


          <form
            action={createKnowledge}
            className="space-y-5"
          >

            {/* Title */}

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
                required
                placeholder="例如：React Server Components"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />

            </div>


            {/* Content */}

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
                rows={7}
                required
                placeholder="记录你今天学到的内容..."
                className="w-full resize-none rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />

            </div>


            {/* Submit */}

            <div className="flex items-center justify-between gap-4">

              <p className="text-xs text-slate-400">
                保存后可以继续使用 AI 摘要、标签和 RAG 问答。
              </p>

              <button
                type="submit"
                className="shrink-0 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md"
              >
                保存知识
              </button>

            </div>

          </form>

        </section>


        {/* ========================================== */}
        {/* Recent Knowledge */}
        {/* ========================================== */}

        <section>

          <div className="mb-5 flex items-end justify-between">

            <div>

              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {query
                  ? "搜索结果"
                  : "我的知识"}
              </h2>

              {query && (

                <p className="mt-1 text-sm text-slate-400">

                  搜索：

                  <span className="ml-1 font-medium text-slate-600">
                    {query}
                  </span>

                </p>

              )}

              {!query && (

                <p className="mt-1 text-sm text-slate-400">
                  最近保存的知识
                </p>

              )}

            </div>


            {/* 查看全部 */}

            <Link
              href="/knowledge"
              className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-blue-600"
            >

              <span>
                查看全部
              </span>

              <span className="transition group-hover:translate-x-1">
                →
              </span>

            </Link>

          </div>


          {/* ========================================== */}
          {/* Empty */}
          {/* ========================================== */}

          {recentKnowledge.length === 0 ? (

            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                📚
              </div>

              <h3 className="mt-5 text-lg font-semibold text-slate-900">

                {query
                  ? "没有找到相关知识"
                  : "还没有保存任何知识"}

              </h3>

              <p className="mt-2 text-sm text-slate-400">

                {query
                  ? "尝试使用其他关键词搜索。"
                  : "创建第一条知识，让 KnowFlow 开始工作。"}

              </p>

            </div>

          ) : (

            <div className="grid gap-4 lg:grid-cols-2">

              {recentKnowledge.map(
                (item) => (

                  <Link
                    key={item.id}
                    href={`/knowledge/${item.id}`}
                    className="group flex min-h-[260px] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
                  >

                    {/* Header */}

                    <div className="flex items-start justify-between gap-4">

                      <h3 className="line-clamp-2 text-lg font-semibold leading-7 text-slate-900 transition group-hover:text-blue-600">
                        {item.title}
                      </h3>

                      <span className="shrink-0 text-lg text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500">
                        →
                      </span>

                    </div>


                    {/* Content */}

                    {item.content && (

                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-500">
                        {item.content}
                      </p>

                    )}


                    {/* AI Summary */}

                    {item.aiSummary && (

                      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4">

                        <div className="mb-2 flex items-center gap-2">

                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-xs">
                            ✨
                          </span>

                          <span className="text-xs font-semibold text-blue-600">
                            AI 摘要
                          </span>

                        </div>

                        <p className="line-clamp-3 text-sm leading-6 text-slate-600">
                          {item.aiSummary}
                        </p>

                      </div>

                    )}


                    {/* Footer */}

                    <div className="mt-auto pt-5">

                      <div className="flex items-end justify-between gap-4">

                        {/* Tags */}

                        <div className="flex min-w-0 flex-wrap gap-2">

                          {parseTags(item.aiTags)
                            .map(
                              (tag) =>
                                tag.trim()
                            )
                            .filter(Boolean)
                            .map(
                              (tag) => (

                                <span
                                  key={tag}
                                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500"
                                >
                                  {tag}
                                </span>

                              )
                            )}

                        </div>


                        {/* Date */}

                        <span className="shrink-0 text-xs text-slate-400">
                          {item.createdAt}
                        </span>

                      </div>

                    </div>

                  </Link>

                )
              )}

            </div>

          )}


          {/* ========================================== */}
          {/* More hint */}
          {/* ========================================== */}

          {!query &&
            knowledge.length > 4 && (

              <div className="mt-6 text-center">

                <Link
                  href="/knowledge"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600 hover:shadow"
                >

                  查看全部 {knowledge.length} 条知识

                  <span>
                    →
                  </span>

                </Link>

              </div>

            )}

        </section>

      </div>

    </main>
  );
}
