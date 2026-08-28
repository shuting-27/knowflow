# KnowFlow

KnowFlow 是一个本地优先的 AI 知识库与 RAG 问答系统，将文件导入、重叠 Chunk 切分、AI 摘要与标签、混合检索、MMR 多样性召回、片段级引用、受约束问答和运行指标整合为完整闭环。

## 核心能力

- 知识新增、编辑、删除、搜索与标签过滤
- Ollama 本地推理，无需把个人知识发送到云端
- `nomic-embed-text` 文档与查询向量化
- TXT/Markdown 导入与可配置重叠 Chunk 切分
- 词项覆盖度与 Chunk 余弦相似度融合搜索
- 相关度阈值过滤、Top-K 召回与 MMR 去冗余
- 语义分数与标签重合度融合的相关推荐
- 严格知识上下文约束、无结果拒答和来源追踪
- 查询日志、平均 Top Score、非空召回率和 AI 覆盖率 Dashboard
- PostgreSQL、Ollama 及模型安装状态诊断
- Recall@K、MRR 和拒答准确率离线评测脚本

## 技术栈

Next.js 16、React 19、TypeScript、PostgreSQL 17、Prisma Next ORM、Ollama、Qwen3 1.7B、nomic-embed-text、Tailwind CSS 4、Docker Compose。

## RAG 链路

1. 创建、编辑或导入知识时按边界进行重叠切分，并为每个 Chunk 生成 Embedding。
2. 为用户问题生成 Query Embedding。
3. 融合 Chunk 余弦相似度与词项覆盖度召回候选，并根据阈值过滤。
4. 使用 MMR 抑制候选文档之间的内容冗余。
5. 组合知识正文与 AI 摘要，构造受控 Context。
6. 通过低温度 Prompt 约束本地模型只能依据知识库回答。
7. 返回答案、知识来源、Chunk 编号、原文片段和相似度，并记录查询日志。

```text
MMR(d) = λ · relevance(d, query) - (1 - λ) · max similarity(d, selected)
```

## 本地启动

要求：Node.js 20+、Docker Desktop、Ollama。

```bash
cp .env.example .env
docker compose up -d
ollama pull qwen3:1.7b
ollama pull nomic-embed-text
npm install
npx prisma db init
npm run dev
```

访问 <http://localhost:3000>。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 本地 PostgreSQL | 数据库连接地址 |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama 服务地址 |
| `OLLAMA_CHAT_MODEL` | `qwen3:1.7b` | 生成模型 |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | 向量模型 |
| `RAG_TOP_K` | `5` | 最大召回数量 |
| `RAG_MIN_SCORE` | `0.55` | 最低相关度 |
| `RAG_MMR_LAMBDA` | `0.70` | MMR 相关性权重 |
| `RAG_CONTEXT_CHARS` | `2000` | 单篇知识最大上下文字符数 |
| `RAG_CHUNK_SIZE` | `700` | Chunk 目标字符数 |
| `RAG_CHUNK_OVERLAP` | `120` | 相邻 Chunk 重叠字符数 |
| `RAG_MAX_CHUNKS` | `40` | 单篇知识最大 Chunk 数 |
| `OLLAMA_TIMEOUT_MS` | `120000` | 本地模型请求超时 |

## 质量检查

```bash
npm run verify
npm run evaluate
```

该命令依次执行 ESLint、TypeScript 严格检查和 Next.js 生产构建。

## 当前边界与路线

评测集位于 `evaluation/sample.json`。把其中的示例替换为人工标注问题、相关知识 ID、实际排序和拒答结果，再运行评测，不能把示例的 100% 当成项目实验结论。

## 从旧版升级

新版不改变数据库表结构，旧的一维 Embedding 可以继续读取。启动后进入“系统状态”，点击“重建全部知识索引”，即可将旧知识升级为 Chunk 向量包。重建过程中 Ollama 必须运行。

## 当前边界与路线

当前版本适用于个人知识库和简历演示。版本化 Chunk 向量包仍保存在 PostgreSQL 文本字段中，检索在应用层执行，适合中小规模数据，不应描述为高并发向量数据库。

面向更大规模数据的后续升级：pgvector + HNSW、标准 BM25、轻量 Reranker，以及基于人工标注答案的 Faithfulness 评测。

## 简历描述参考

> 基于 Next.js、TypeScript、PostgreSQL 与 Ollama 构建本地化 AI 知识库，设计重叠 Chunk 切分、稠密语义与词项覆盖融合召回、阈值过滤及 MMR 多样性筛选，返回片段级可追溯来源；建立查询日志、运行状态诊断及 Recall@K/MRR 离线评测工具，形成“知识导入—AI 增强—混合检索—受约束问答—指标分析”闭环。
