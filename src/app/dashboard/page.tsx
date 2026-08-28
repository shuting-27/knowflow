import { getDashboardStats } from "@/app/actions/dashboard";

export const dynamic = "force-dynamic";

function MetricCard({
  icon,
  label,
  value,
  description,
}: {
  icon: string;
  label: string;
  value: string | number;
  description: string;
}) {
  return (
    <div className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">
            {label}
          </p>

          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            {value}
          </p>

          <p className="mt-2 text-xs text-gray-400">
            {description}
          </p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-xl transition group-hover:bg-gray-900 group-hover:text-white">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  value,
}: {
  value: number;
}) {
  const safeValue = Math.min(
    Math.max(value, 0),
    100
  );

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-gray-900 transition-all duration-700"
        style={{
          width: `${safeValue}%`,
        }}
      />
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "excellent" | "good" | "warning" | "empty";
}) {
  if (status === "empty") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
        暂无数据
      </span>
    );
  }

  if (status === "excellent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        检索优秀
      </span>
    );
  }

  if (status === "good") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        检索良好
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
      需要关注
    </span>
  );
}

function getRagHealth(
  score: number,
  queryCount: number
): "excellent" | "good" | "warning" | "empty" {
  if (queryCount === 0) {
    return "empty";
  }

  if (score >= 0.85) {
    return "excellent";
  }

  if (score >= 0.7) {
    return "good";
  }

  return "warning";
}

function RagTrendChart({
  data,
}: {
  data: {
    id: number;
    question: string;
    retrievedCount: number;
    topScore: number;
    createdAt: string;
  }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">
        暂无 RAG 查询数据
      </div>
    );
  }

  const chartData = data.slice(-100);

  const width = 900;
  const height = 300;

  const paddingLeft = 55;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 45;

  const chartWidth =
    width - paddingLeft - paddingRight;

  const chartHeight =
    height - paddingTop - paddingBottom;

  const points = chartData.map(
    (item, index) => {
      const x =
        chartData.length === 1
          ? paddingLeft + chartWidth / 2
          : paddingLeft +
            (index /
              (chartData.length - 1)) *
              chartWidth;

      const y =
        paddingTop +
        (1 - item.topScore) *
          chartHeight;

      return {
        ...item,
        x,
        y,
      };
    }
  );

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
    )
    .join(" ");

  return (
    <div className="w-full overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-900" />
            最高相关度
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            查询次数
          </div>
        </div>

        <span className="text-xs text-gray-400">
          最近 {chartData.length} 次查询
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-72 w-full"
        preserveAspectRatio="none"
      >
        {/* 网格线 */}

        {[0, 0.25, 0.5, 0.75, 1].map(
          (ratio) => {
            const y =
              paddingTop +
              ratio * chartHeight;

            const score =
              100 - ratio * 100;

            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={
                    width -
                    paddingRight
                  }
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-100"
                  strokeWidth="1"
                />

                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-gray-400 text-[11px]"
                >
                  {score.toFixed(0)}%
                </text>
              </g>
            );
          }
        )}

        {/* X 轴 */}

        <line
          x1={paddingLeft}
          y1={
            paddingTop +
            chartHeight
          }
          x2={
            width -
            paddingRight
          }
          y2={
            paddingTop +
            chartHeight
          }
          stroke="currentColor"
          className="text-gray-200"
        />

        {/* 面积 */}

        {points.length > 1 && (
          <path
            d={`
              ${linePath}
              L ${points[points.length - 1].x}
                ${paddingTop + chartHeight}
              L ${points[0].x}
                ${paddingTop + chartHeight}
              Z
            `}
            fill="currentColor"
            className="text-gray-50"
          />
        )}

        {/* 折线 */}

        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          className="text-gray-900"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 数据点 */}

        {points.map((point) => (
          <g key={point.id}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill="white"
              stroke="currentColor"
              className="text-gray-900"
              strokeWidth="3"
            />

            <text
              x={point.x}
              y={
                paddingTop +
                chartHeight +
                25
              }
              textAnchor="middle"
              className="fill-gray-400 text-[10px]"
            >
              #{point.id}
            </text>
          </g>
        ))}
      </svg>

      {/* 查询列表 */}

      {/* <div className="mt-3 space-y-2">
        {chartData
          .slice(-3)
          .reverse()
          .map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2"
            >
              <p className="min-w-0 truncate text-xs text-gray-600">
                {item.question}
              </p>

              <div className="flex shrink-0 items-center gap-4 text-xs">
                <span className="text-gray-400">
                  检索 {item.retrievedCount}
                </span>

                <span className="font-semibold text-gray-900">
                  {(item.topScore * 100).toFixed(
                    1
                  )}
                  %
                </span>
              </div>
            </div>
          ))}
      </div> */}
    </div>
  );
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const ragHealth = getRagHealth(
    stats.avgTopScore,
    stats.ragQueryCount
  );

  const summaryCoverage =
    stats.knowledgeCount > 0
      ? (stats.aiSummaryCount /
          stats.knowledgeCount) *
        100
      : 0;

  const tagCoverage =
    stats.knowledgeCount > 0
      ? (stats.aiTagCount /
          stats.knowledgeCount) *
        100
      : 0;

  const embeddingCoverage =
    stats.knowledgeCount > 0
      ? (stats.embeddingCount /
          stats.knowledgeCount) *
        100
      : 0;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* ===================================== */}
        {/* Header */}
        {/* ===================================== */}

        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                KnowFlow AI Dashboard
              </h1>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                AI System Running
              </span>
            </div>

            <p className="mt-2 text-sm text-gray-500">
              知识库、AI 能力与 RAG 检索运行概览
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-gray-400">
              KNOWFLOW AI
            </p>

            <p className="mt-1 text-sm font-semibold text-gray-800">
              Knowledge Intelligence
            </p>
          </div>
        </div>

        {/* ===================================== */}
        {/* 核心指标 */}
        {/* ===================================== */}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon="📚"
            label="知识总数"
            value={stats.knowledgeCount}
            description="当前知识库中的知识"
          />

          <MetricCard
            icon="🧠"
            label="Embedding"
            value={stats.embeddingCount}
            description="已完成向量化的知识"
          />

          <MetricCard
            icon="💬"
            label="RAG 查询"
            value={stats.ragQueryCount}
            description="累计 AI 问答请求"
          />

          <MetricCard
            icon="🎯"
            label="RAG 成功率"
            value={`${stats.ragSuccessRate}%`}
            description="成功检索到相关知识的比例"
          />
        </section>

        {/* ===================================== */}
        {/* AI Overview */}
        {/* ===================================== */}

        <section className="mt-6 grid gap-6 lg:grid-cols-3">

          {/* AI Coverage */}

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  AI 能力覆盖
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  知识库中 AI 能力的完整程度
                </p>
              </div>

              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900">
                  {stats.aiCoverage}%
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  Overall AI Coverage
                </p>
              </div>
            </div>

            <div className="mt-6">
              <ProgressBar
                value={stats.aiCoverage}
              />
            </div>

            <div className="mt-7 grid gap-5 md:grid-cols-3">

              {/* Summary */}

              <div className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    AI 摘要
                  </span>

                  <span className="text-sm font-semibold text-gray-900">
                    {summaryCoverage.toFixed(0)}%
                  </span>
                </div>

                <div className="mt-3">
                  <ProgressBar
                    value={summaryCoverage}
                  />
                </div>

                <p className="mt-3 text-xs text-gray-400">
                  {stats.aiSummaryCount} /{" "}
                  {stats.knowledgeCount} 条知识
                </p>
              </div>

              {/* Tags */}

              <div className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    AI 标签
                  </span>

                  <span className="text-sm font-semibold text-gray-900">
                    {tagCoverage.toFixed(0)}%
                  </span>
                </div>

                <div className="mt-3">
                  <ProgressBar
                    value={tagCoverage}
                  />
                </div>

                <p className="mt-3 text-xs text-gray-400">
                  {stats.aiTagCount} /{" "}
                  {stats.knowledgeCount} 条知识
                </p>
              </div>

              {/* Embedding */}

              <div className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Embedding
                  </span>

                  <span className="text-sm font-semibold text-gray-900">
                    {embeddingCoverage.toFixed(0)}%
                  </span>
                </div>

                <div className="mt-3">
                  <ProgressBar
                    value={embeddingCoverage}
                  />
                </div>

                <p className="mt-3 text-xs text-gray-400">
                  {stats.embeddingCount} /{" "}
                  {stats.knowledgeCount} 条知识
                </p>
              </div>

            </div>
          </div>

          {/* RAG Health */}

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  RAG Health
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  当前检索系统健康状态
                </p>
              </div>

              <StatusBadge
                status={ragHealth}
              />
            </div>

            <div className="mt-8">
              <p className="text-sm text-gray-500">
                平均最高相关度
              </p>

              <p className="mt-2 text-4xl font-bold tracking-tight text-gray-900">
                {(stats.avgTopScore * 100).toFixed(
                  1
                )}
                %
              </p>

              <div className="mt-4">
                <ProgressBar
                  value={
                    stats.avgTopScore * 100
                  }
                />
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-gray-400">
                  平均检索
                </p>

                <p className="mt-1 text-xl font-bold text-gray-900">
                  {stats.avgRetrievedCount}
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  条 / 查询
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-gray-400">
                  查询成功率
                </p>

                <p className="mt-1 text-xl font-bold text-gray-900">
                  {stats.ragSuccessRate}%
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  有效检索
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================== */}
        {/* RAG Trend */}
        {/* ===================================== */}

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                RAG 查询趋势
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                AI 问答请求与检索质量变化
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Total Queries{" "}
              <span className="font-semibold text-gray-900">
                {stats.ragQueryCount}
              </span>
            </div>
          </div>

          <RagTrendChart
            data={stats.ragTrend}
          />
        </section>

        {/* ===================================== */}
        {/* RAG Quality */}
        {/* ===================================== */}

        <section className="mt-6 grid gap-6 lg:grid-cols-2">

          {/* Retrieval Quality */}

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                检索质量
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                RAG 知识召回效果
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">

              <div className="rounded-xl bg-gray-50 p-5">
                <p className="text-sm text-gray-500">
                  平均最高相关度
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {(stats.avgTopScore * 100).toFixed(
                    1
                  )}
                  %
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-5">
                <p className="text-sm text-gray-500">
                  平均返回知识
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {stats.avgRetrievedCount}
                </p>
              </div>

              <div className="rounded-xl border border-gray-100 p-5">
                <p className="text-sm text-gray-500">
                  成功查询
                </p>

                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {stats.successfulQueryCount}
                </p>

                <p className="mt-1 text-xs text-green-600">
                  有效知识召回
                </p>
              </div>

              <div className="rounded-xl border border-gray-100 p-5">
                <p className="text-sm text-gray-500">
                  无结果查询
                </p>

                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {stats.noResultCount}
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  未找到相关知识
                </p>
              </div>

            </div>
          </div>

          {/* Query Status */}

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                RAG 查询状态
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                AI 问答检索运行情况
              </p>
            </div>

            <div className="flex items-center gap-8">

              <div className="flex h-36 w-36 shrink-0 flex-col items-center justify-center rounded-full border-[12px] border-gray-900">
                <span className="text-3xl font-bold text-gray-900">
                  {stats.ragSuccessRate}%
                </span>

                <span className="mt-1 text-xs text-gray-400">
                  Success
                </span>
              </div>

              <div className="flex-1 space-y-5">

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      成功查询
                    </span>

                    <span className="font-semibold text-gray-900">
                      {stats.successfulQueryCount}
                    </span>
                  </div>

                  <ProgressBar
                    value={
                      stats.ragQueryCount > 0
                        ? (stats.successfulQueryCount /
                            stats.ragQueryCount) *
                          100
                        : 0
                    }
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      无结果查询
                    </span>

                    <span className="font-semibold text-gray-900">
                      {stats.noResultCount}
                    </span>
                  </div>

                  <ProgressBar
                    value={
                      stats.ragQueryCount > 0
                        ? (stats.noResultCount /
                            stats.ragQueryCount) *
                          100
                        : 0
                    }
                  />
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* ===================================== */}
        {/* Recent Queries */}
        {/* ===================================== */}

        <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">

          <div className="border-b border-gray-100 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  最近 AI 查询
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  最近的知识库 AI 问答记录
                </p>
              </div>

              <span className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Last 10
              </span>
            </div>
          </div>

          {stats.recentQueries.length === 0 ? (

            <div className="px-6 py-12 text-center text-sm text-gray-400">
              暂无查询记录
            </div>

          ) : (

            <div className="divide-y divide-gray-100">

              {stats.recentQueries.map(
                (query) => {

                  const score =
                    query.topScore * 100;

                  const status =
                    getRagHealth(
                      query.topScore,
                      1
                    );

                  return (
                    <div
                      key={query.id}
                      className="px-6 py-5 transition hover:bg-gray-50"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-500">
                              #{query.id}
                            </span>

                            <p className="truncate font-medium text-gray-900">
                              {query.question}
                            </p>
                          </div>

                          <p className="mt-2 pl-10 text-xs text-gray-400">
                            {String(
                              query.createdAt
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-6 pl-10 md:pl-0">

                          <div className="text-right">
                            <p className="text-xs text-gray-400">
                              检索数量
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                              {query.retrievedCount}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-xs text-gray-400">
                              最高相关度
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                              {score.toFixed(1)}%
                            </p>
                          </div>

                          <StatusBadge
                            status={status}
                          />

                        </div>
                      </div>
                    </div>
                  );
                }
              )}

            </div>
          )}
        </section>

        {/* ===================================== */}
        {/* Footer */}
        {/* ===================================== */}

        <div className="mt-8 flex items-center justify-between text-xs text-gray-400">
          <span>
            KnowFlow AI Knowledge Platform
          </span>

          <span>
            RAG Monitoring Dashboard
          </span>
        </div>

      </div>
    </main>
  );
}
