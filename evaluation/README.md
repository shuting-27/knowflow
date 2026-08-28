# KnowFlow RAG Retrieval Evaluation

## 1. 评测目标

本评测用于验证 KnowFlow 在中文知识库场景下的检索效果、无关查询拒绝能力和检索性能，并对 Embedding 模型、任务前缀与相关度阈值进行对比。

## 2. 评测数据

评测集位于 `evaluation/rag-retrieval.json`，共包含 24 个问题：

- 20 个知识库内问题
- 4 个知识库外问题
- 16 个单知识问题
- 4 个跨知识或完整链路问题
- 包含直接关键词查询与语义改写查询

知识库包含系统架构、文档索引、pgvector 召回、混合检索、MMR、事务一致性、来源追踪和性能监控等主题，同时保留部分相似或无关知识作为干扰项。

## 3. 检索流程

评测脚本执行与生产环境一致的检索流程：

1. 调用 FastAPI 生成查询向量
2. 使用 pgvector 余弦距离召回 Top-30 文本分块
3. 按知识 ID 聚合多个 Chunk，并保留最高相关分块
4. 使用 85% 语义分数与 15% 关键词分数进行混合排序
5. 根据最低相关度阈值过滤候选
6. 使用 MMR 进行去冗余排序
7. 返回 Top-5 知识来源

最终配置：

- Embedding 模型：`nomic-embed-text-v2-moe`
- 查询前缀：`search_query:`
- 文档前缀：`search_document:`
- 向量维度：768
- Top-K：5
- 最低相关度：0.35
- MMR Lambda：0.70

## 4. 指标定义

- Hit@K：前 K 个结果中是否包含至少一个标注相关知识
- MRR：首个相关知识排名倒数的平均值
- Reject Accuracy：知识库外问题是否在检索阶段被正确拒绝
- Average Latency：单次完整检索的平均耗时
- P95 Latency：95% 查询能够达到的延迟范围

Reject Accuracy 仅表示检索阶段没有返回超过阈值的候选，不等同于生成答案的事实一致性。

## 5. 消融实验

| 方案 | 阈值 | Hit@1 | Hit@3 | Hit@5 | MRR | Reject Accuracy |
|---|---:|---:|---:|---:|---:|---:|
| nomic-embed-text，无任务前缀 | 0.55 | 45% | 55% | 60% | 0.5017 | 100% |
| nomic-embed-text，无任务前缀 | 0.50 | 60% | 80% | 85% | 0.7017 | 50% |
| nomic-embed-text-v2-moe，任务前缀 | 0.45 | 70% | 85% | 90% | 0.7875 | 100% |
| nomic-embed-text-v2-moe，任务前缀 | 0.40 | 75% | 90% | 95% | 0.8292 | 100% |
| nomic-embed-text-v2-moe，任务前缀 | 0.35 | 80% | 95% | 100% | 0.8792 | 100% |

相对于拒绝准确率同为 100% 的旧模型 0.55 基线，最终方案：

- Hit@1 提升 30 个百分点
- Hit@3 提升 40 个百分点
- Hit@5 提升 40 个百分点
- MRR 从 0.5017 提升至 0.8792，提升约 75.3%
- 无关查询检索拒绝准确率保持 100%

## 6. 最终性能

最终配置在固定 8 篇评测语料、24 条人工标注问题上的结果：

| 指标 | 结果 |
|---|---:|
| Corpus Documents | 8 |
| Questions | 24 |
| Hit@1 | 95.0% |
| Hit@3 | 100.0% |
| Hit@5 | 100.0% |
| MRR | 0.9750 |
| Reject Accuracy | 100.0% |
| Average Total Latency | 771.73 ms |
| P95 Total Latency | 758.52 ms |
| Average Embedding Latency | 703.71 ms |
| Average pgvector Latency | 50.21 ms |
| P95 pgvector Latency | 52.92 ms |

第一次查询包含约 2.65 秒的模型冷启动；后续热启动查询通常稳定在约 650～750 毫秒。测试设备为 Intel Core i5-1035G1、8GB 内存，无 CUDA 推理环境。

## 7. 复现方法

确保 PostgreSQL、FastAPI 和 Ollama 正常运行，然后执行：

```bash
npm run seed:evaluation
npm run evaluate -- evaluation/rag-retrieval.json evaluation/results-final.json
```

seed:evaluation 会幂等创建或更新固定评测语料，并重新生成文档向量。评测标注使用稳定的知识标题，不依赖数据库自增 ID。
完整结果保存在 `evaluation/results-final.json`。

## 8. 局限性

- 当前评测集规模较小，为 24 条人工标注的项目领域问题
- 评测结果只代表当前知识库和测试问题，不能泛化到开放领域
- 当前主要评估检索效果，尚未覆盖生成答案的忠实度与完整性
- 无关查询仅有 4 条，需要继续扩展负样本和困难负样本
- 后续应增加独立测试集，避免参数选择对当前评测集产生过拟合
