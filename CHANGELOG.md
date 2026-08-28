# Changelog

## 0.2.0

- 新增 TXT/Markdown 文件导入。
- 新增可配置的重叠 Chunk 切分和逐 Chunk Embedding。
- 兼容旧版一维 Embedding，并提供全量索引重建入口。
- 新增稠密语义与词项覆盖度融合检索。
- RAG 来源增加 Chunk 编号和原文片段。
- 保留相关度阈值与 MMR 多样性筛选。
- 新增 PostgreSQL、Ollama 和本地模型健康检查页。
- 新增 Recall@K、MRR 和拒答准确率评测工具。
- 模型、切分、检索和超时参数全部环境变量化。
- 修复标签格式、RAG 日志时序、动态页面构建和类型定义问题。
