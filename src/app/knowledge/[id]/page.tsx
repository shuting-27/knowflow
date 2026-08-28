import Link from "next/link";
import DeleteButton from "./DeleteButton";
import { getKnowledge, getHybridRelatedKnowledge } from "@/app/actions/knowledge";
import AiAnalysisButton from "./AiAnalysisButton";
import RagChat from "./RagChat";
import { parseTags } from "@/lib/retrieval";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function KnowledgeDetail({
  params,
}: Props) {
  const { id } = await params;
  const knowledge = await getKnowledge(Number(id));
  const relatedKnowledge =
    await getHybridRelatedKnowledge(
      Number(id),
      3
    );

  // const result = await askKnowledge(
  //     "汽车发动机维修有哪些常见故障？"
  //   );

  //   console.log(result);

  if (!knowledge) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="text-2xl font-bold text-slate-900">
            知识不存在
          </h1>

          <Link
            href="/knowledge"
            className="mt-6 inline-block text-blue-600"
          >
            ← 返回知识库
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-12">

        <Link
          href="/"
          className="text-sm text-blue-600 hover:underline"
        >
          ← 返回首页
        </Link>

        <article className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">

          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {knowledge.title}
          </h1>

          <div className="mt-3 text-sm text-slate-400">
            {knowledge.createdAt}
          </div>

          <div className="mt-8 whitespace-pre-wrap text-base leading-8 text-slate-700">
            {knowledge.content}
          </div>
          {knowledge.aiSummary && (
            <section className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-6">
              <div className="mb-2 text-sm font-medium text-blue-600">
                AI 摘要
              </div>

              <p className="leading-7 text-slate-700">
                {knowledge.aiSummary}
              </p>
            </section>
          )}
          {knowledge.aiTags && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 text-sm font-medium text-slate-500">
                AI 标签
              </div>

              <div className="flex flex-wrap gap-2">
                {parseTags(knowledge.aiTags)
                  .map((tag) => tag.trim())
                  .filter(Boolean)
                  .map((tag) => (
                    <Link
                      key={tag}
                      href={`/?tag=${encodeURIComponent(tag)}`}
                      className="rounded-full bg-blue-50 px-3 py-1.5 text-sm text-blue-600 transition hover:bg-blue-100"
                    >
                      {tag}
                    </Link>
                  ))}
              </div>
            </section>
          )}
          {/* <div className="mt-8">
            <AiSummaryButton
              id={knowledge.id}
              hasSummary={Boolean(knowledge.aiSummary)}
            />
          </div> */}
          <AiAnalysisButton
            id={knowledge.id}
            hasAnalysis={Boolean(knowledge.aiSummary || knowledge.aiTags)}
          />
          <div className="mt-8 flex gap-3">
            <Link
              href="/knowledge"
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              返回知识库
            </Link>
            <Link
              href={`/knowledge/${knowledge.id}/edit`}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              编辑
            </Link>

            <DeleteButton id={knowledge.id} />
        </div>
        {relatedKnowledge.length > 0 && (
          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                相关知识
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                根据内容语义和知识标签智能推荐
              </p>
            </div>

            <div className="space-y-3">
              {relatedKnowledge.map((related) => (
                <Link
                  key={related.id}
                  href={`/knowledge/${related.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <h3 className="font-semibold text-slate-900">
                    {related.title}
                  </h3>

                  {related.aiSummary && (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                      {related.aiSummary}
                    </p>
                  )}

                  {related.aiTags && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {parseTags(related.aiTags)
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
        <RagChat />
        </article>

      </div>
    </main>
  );
}
