import { type UniqueCheckConfig } from "../config/types.js";
import { type CheckContext, type CheckResult } from "./types.js";

export async function runUniqueCheck(
  config: UniqueCheckConfig,
  context: CheckContext,
): Promise<CheckResult> {
  const startTime = performance.now();
  const targetTable = config.target ?? context.defaultTargetTable;
  const colList = config.columns.map((c) => `"${c}"`).join(", ");
  const checkName =
    config.name ?? `unique_${config.columns.join("_")}_on_${targetTable}`;

  const query = `
    SELECT ${colList}, COUNT(*) AS duplicate_count
    FROM "${targetTable}"
    GROUP BY ${colList}
    HAVING COUNT(*) > 1
    LIMIT 10
  `;

  const res = await context.engine.runQuery(query);
  const duplicateGroupCount = res.rowCount;
  const passed = duplicateGroupCount === 0;
  const durationMs = Math.round(performance.now() - startTime);

  const sampleFailures: string[] = [];
  if (!passed) {
    for (const row of res.rows.slice(0, 3)) {
      const dupCount = row[row.length - 1];
      const keyValues = row.slice(0, -1);
      sampleFailures.push(
        `Duplicate keys [${config.columns.join(", ")}] = [${keyValues.join(", ")}] occurred ${dupCount} times`,
      );
    }
  }

  return {
    name: checkName,
    type: "unique",
    targetTable,
    status: passed ? "pass" : "fail",
    durationMs,
    details: {
      columns: config.columns,
      duplicateGroupCount,
    },
    diagnostics: passed
      ? undefined
      : `Found ${duplicateGroupCount} duplicate group(s) on columns [${config.columns.join(", ")}]`,
    sampleFailures: sampleFailures.length > 0 ? sampleFailures : undefined,
  };
}
