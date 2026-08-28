import Link from "next/link";
import { db } from "@/prisma/db";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const posts =
    await db.orm.public.Post
      .orderBy(
        (post) => post.createdAt.desc()
      )
      .all();

  return (
    <div className="min-h-screen p-8">

      {/* 页面头部 */}
      <div className="mb-8 flex items-center justify-between">

        <div>
          <h1 className="text-3xl font-bold">
            知识库
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            管理你的 AI 知识内容
          </p>
        </div>

      </div>

      {/* 知识数量 */}
      <div className="mb-6 rounded-xl border bg-white p-5">
        <p className="text-sm text-gray-500">
          知识总数
        </p>

        <p className="mt-1 text-2xl font-bold">
          {posts.length}
        </p>
      </div>

      {/* 知识列表 */}
      <div className="space-y-4">

        {posts.length === 0 ? (
          <div className="rounded-xl border bg-white p-10 text-center">
            <p className="text-gray-500">
              暂无知识内容
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <Link
              key={post.id}
              href={`/knowledge/${post.id}`}
              className="block rounded-xl border bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-md"
            >

              <div className="flex items-start justify-between gap-6">

                <div className="min-w-0 flex-1">

                  <h2 className="text-lg font-semibold">
                    {post.title}
                  </h2>

                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">
                    {post.content || "暂无正文"}
                  </p>

                  {/* AI 信息 */}
                  <div className="mt-4 flex flex-wrap gap-2">

                    {post.aiSummary && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600">
                        AI 摘要
                      </span>
                    )}

                    {post.aiTags && (
                      <span className="rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-600">
                        AI 标签
                      </span>
                    )}

                    {post.embedding && (
                      <span className="rounded-full bg-green-50 px-3 py-1 text-xs text-green-600">
                        Embedding
                      </span>
                    )}

                  </div>

                </div>

                <div className="shrink-0 text-sm text-gray-400">
                  查看 →
                </div>

              </div>

            </Link>
          ))
        )}

      </div>

    </div>
  );
}
