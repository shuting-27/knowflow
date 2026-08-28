import { readFile } from "node:fs/promises";

const file = process.argv[2] ?? "evaluation/sample.json";
const rows = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(rows) || rows.length === 0) throw new Error("评测集必须是非空 JSON 数组");

const ks = [1, 3, 5];
const recall = Object.fromEntries(ks.map((k) => [k, 0]));
let reciprocalRank = 0;
let retrievalRows = 0;
let rejectCorrect = 0;
let rejectRows = 0;

for (const row of rows) {
  const relevant = new Set(row.relevantIds ?? []);
  const ranked = row.rankedIds ?? [];
  if (relevant.size > 0) {
    retrievalRows++;
    for (const k of ks) if (ranked.slice(0, k).some((id) => relevant.has(id))) recall[k]++;
    const rank = ranked.findIndex((id) => relevant.has(id));
    if (rank >= 0) reciprocalRank += 1 / (rank + 1);
  }
  if (typeof row.shouldReject === "boolean") {
    rejectRows++;
    if (Boolean(row.rejected) === row.shouldReject) rejectCorrect++;
  }
}

const percent = (value) => `${(value * 100).toFixed(1)}%`;
console.log(`Dataset: ${file} (${rows.length} questions)`);
for (const k of ks) console.log(`Recall@${k}: ${percent(retrievalRows ? recall[k] / retrievalRows : 0)}`);
console.log(`MRR: ${(retrievalRows ? reciprocalRank / retrievalRows : 0).toFixed(4)}`);
console.log(`Reject accuracy: ${percent(rejectRows ? rejectCorrect / rejectRows : 0)}`);

