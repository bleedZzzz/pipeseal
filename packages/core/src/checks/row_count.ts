import { type RowCountCheckConfig } from "../config/types.js";
import { type CheckContext, type CheckResult } from "./types.js";

export async function runRowCountCheck(
  config: RowCountCheckConfig,
  context: CheckContext,
): Promise<CheckResult> {
  const startTime = performance.now();
  const targetTable = config.target ?? context.defaultTargetTable;
  const checkName = config.name ?? `row_count_${targetTable}`;

  const queryRes = await context.engine.runQuery(
    `SELECT COUNT(*) AS total_rows FROM "${targetTable}"`,
  );
  const rawCount = queryRes.rows[0]?.[0] ?? 0;
  const actualCount =
    typeof rawCount === "bigint" ? Number(rawCount) : Number(rawCount);

  let passed = true;
  const reasons: string[] = [];

  if (config.min !== undefined && actualCount < config.min) {
    passed = false;
    reasons.push(
      `Actual row count ${actualCount} is less than minimum required ${config.min}`,
    );
  }

  if (config.max !== undefined && actualCount > config.max) {
    passed = false;
    reasons.push(
      `Actual row count ${actualCount} is greater than maximum allowed ${config.max}`,
    );
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    name: checkName,
    type: "row_count",
    targetTable,
    status: passed ? "pass" : "fail",
    durationMs,
    details: {
      actualCount,
      min: config.min,
      max: config.max,
    },
    diagnostics: passed ? undefined : reasons.join("; "),
  };
}
