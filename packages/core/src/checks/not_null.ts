import { type NotNullCheckConfig } from "../config/types.js";
import { type CheckContext, type CheckResult } from "./types.js";
import { safeJsonStringify } from "../report/builder.js";

export async function runNotNullCheck(
  config: NotNullCheckConfig,
  context: CheckContext,
): Promise<CheckResult> {
  const startTime = performance.now();
  const targetTable = config.target ?? context.defaultTargetTable;
  const checkName =
    config.name ?? `not_null_${config.columns.join("_")}_on_${targetTable}`;

  const violations: Array<{
    column: string;
    nullCount: number;
    sampleRows?: unknown[][];
  }> = [];
  const sampleFailures: string[] = [];

  for (const col of config.columns) {
    const res = await context.engine.runQuery(
      `SELECT COUNT(*) AS null_cnt FROM "${targetTable}" WHERE "${col}" IS NULL`,
    );
    const nullCount = Number(res.rows[0]?.[0] ?? 0);

    if (nullCount > 0) {
      // Fetch up to 3 sample rows that have null in this column
      const sampleRes = await context.engine.runQuery(
        `SELECT * FROM "${targetTable}" WHERE "${col}" IS NULL LIMIT 3`,
      );

      violations.push({
        column: col,
        nullCount,
        sampleRows: sampleRes.rows,
      });

      sampleFailures.push(
        `Column "${col}" has ${nullCount} NULL row(s). Sample: ${safeJsonStringify(sampleRes.rows[0])}`,
      );
    }
  }

  const passed = violations.length === 0;
  const durationMs = Math.round(performance.now() - startTime);

  let diagnostics: string | undefined;
  if (!passed) {
    diagnostics = violations
      .map((v) => `Column "${v.column}" contained ${v.nullCount} NULL value(s)`)
      .join("; ");
  }

  return {
    name: checkName,
    type: "not_null",
    targetTable,
    status: passed ? "pass" : "fail",
    durationMs,
    details: {
      columns: config.columns,
      violations: violations.map((v) => ({
        column: v.column,
        nullCount: v.nullCount,
      })),
    },
    diagnostics,
    sampleFailures: sampleFailures.length > 0 ? sampleFailures : undefined,
  };
}
