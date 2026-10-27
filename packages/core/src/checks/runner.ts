import { type CheckConfig } from "../config/types.js";
import { type CheckContext, type CheckResult } from "./types.js";
import { runSchemaCheck } from "./schema.js";
import { runNotNullCheck } from "./not_null.js";
import { runUniqueCheck } from "./unique.js";
import { runCustomSqlCheck } from "./custom_sql.js";
import { runRowCountCheck } from "./row_count.js";
import { runOutputMatchCheck } from "./output_match.js";

export async function runChecks(
  checks: CheckConfig[],
  context: CheckContext,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    let result: CheckResult;
    try {
      switch (check.type) {
        case "schema":
          result = await runSchemaCheck(check, context);
          break;
        case "not_null":
          result = await runNotNullCheck(check, context);
          break;
        case "unique":
          result = await runUniqueCheck(check, context);
          break;
        case "custom_sql":
          result = await runCustomSqlCheck(check, context);
          break;
        case "row_count":
          result = await runRowCountCheck(check, context);
          break;
        case "output_match":
          result = await runOutputMatchCheck(check, context);
          break;
        default: {
          const exhaustiveCheck: never = check;
          throw new Error(`Unhandled check type: ${String(exhaustiveCheck)}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = {
        name: check.name ?? `${check.type}_check`,
        type: check.type,
        targetTable:
          ("target" in check && check.target) || context.defaultTargetTable,
        status: "fail",
        durationMs: 0,
        details: { error: msg },
        diagnostics: `Check execution error: ${msg}`,
      };
    }
    results.push(result);
  }

  return results;
}
