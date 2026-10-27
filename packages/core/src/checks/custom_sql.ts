import { type CustomSqlCheckConfig } from "../config/types.js";
import { type CheckContext, type CheckResult } from "./types.js";
import { safeJsonStringify } from "../report/builder.js";

export async function runCustomSqlCheck(
  config: CustomSqlCheckConfig,
  context: CheckContext,
): Promise<CheckResult> {
  const startTime = performance.now();
  const res = await context.engine.runQuery(config.sql);
  const rowCount = res.rowCount;

  let passed: boolean;
  let diagnostics: string | undefined;
  const sampleFailures: string[] = [];

  if (config.expect === "zero_rows") {
    passed = rowCount === 0;
    if (!passed) {
      diagnostics = `Custom SQL assertion expected 0 failing rows, but returned ${rowCount} row(s)`;
      for (const row of res.rows.slice(0, 3)) {
        sampleFailures.push(safeJsonStringify(row));
      }
    }
  } else {
    passed = rowCount > 0;
    if (!passed) {
      diagnostics = `Custom SQL assertion expected rows, but returned 0 rows`;
    }
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    name: config.name,
    type: "custom_sql",
    targetTable: context.defaultTargetTable,
    status: passed ? "pass" : "fail",
    durationMs,
    details: {
      expect: config.expect,
      returnedRowCount: rowCount,
    },
    diagnostics,
    sampleFailures: sampleFailures.length > 0 ? sampleFailures : undefined,
  };
}
