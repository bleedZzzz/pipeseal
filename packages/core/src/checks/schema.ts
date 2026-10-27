import { type SchemaCheckConfig } from "../config/types.js";
import { type CheckContext, type CheckResult } from "./types.js";

export async function runSchemaCheck(
  config: SchemaCheckConfig,
  context: CheckContext,
): Promise<CheckResult> {
  const startTime = performance.now();
  const targetTable = config.target ?? context.defaultTargetTable;
  const checkName = config.name ?? `schema_validation_${targetTable}`;

  const actualColumns = await context.engine.getTableColumns(targetTable);
  const actualColMap = new Map(
    actualColumns.map((col) => [col.name.toLowerCase(), col]),
  );

  const missingColumns: string[] = [];
  const typeMismatches: Array<{
    column: string;
    expected: string;
    actual: string;
  }> = [];
  const nullabilityViolations: string[] = [];

  for (const expected of config.expect.columns) {
    const actual = actualColMap.get(expected.name.toLowerCase());
    if (!actual) {
      missingColumns.push(expected.name);
      continue;
    }

    // Type check (case-insensitive substring/prefix match to handle VARCHAR vs VARCHAR(255) vs TEXT)
    const normExpected = expected.type
      .toUpperCase()
      .replace(/\(.*\)/, "")
      .trim();
    const normActual = actual.type
      .toUpperCase()
      .replace(/\(.*\)/, "")
      .trim();

    const isTypeCompatible =
      normExpected === normActual ||
      (normExpected === "VARCHAR" &&
        (normActual === "TEXT" || normActual === "STRING")) ||
      (normExpected === "TEXT" &&
        (normActual === "VARCHAR" || normActual === "STRING")) ||
      (normExpected === "INTEGER" &&
        (normActual === "INT4" ||
          normActual === "BIGINT" ||
          normActual === "INT")) ||
      (normExpected === "BIGINT" &&
        (normActual === "INT8" || normActual === "INTEGER"));

    if (!isTypeCompatible) {
      typeMismatches.push({
        column: expected.name,
        expected: expected.type,
        actual: actual.type,
      });
    }

    if (expected.nullable === false && actual.nullable) {
      // Check if actual data in this table has any nulls
      const nullCheck = await context.engine.runQuery(
        `SELECT COUNT(*) AS cnt FROM "${targetTable}" WHERE "${actual.name}" IS NULL`,
      );
      const cnt = Number(nullCheck.rows[0]?.[0] ?? 0);
      if (cnt > 0) {
        nullabilityViolations.push(
          `${expected.name} (${cnt} NULL values found)`,
        );
      }
    }
  }

  const passed =
    missingColumns.length === 0 &&
    typeMismatches.length === 0 &&
    nullabilityViolations.length === 0;

  const durationMs = Math.round(performance.now() - startTime);

  const issues: string[] = [];
  if (missingColumns.length > 0) {
    issues.push(`Missing columns: ${missingColumns.join(", ")}`);
  }
  if (typeMismatches.length > 0) {
    const mismatchStrs = typeMismatches.map(
      (m) => `${m.column} (expected ${m.expected}, got ${m.actual})`,
    );
    issues.push(`Type mismatches: ${mismatchStrs.join("; ")}`);
  }
  if (nullabilityViolations.length > 0) {
    issues.push(`Non-nullable violations: ${nullabilityViolations.join("; ")}`);
  }

  return {
    name: checkName,
    type: "schema",
    targetTable,
    status: passed ? "pass" : "fail",
    durationMs,
    details: {
      expectedColumns: config.expect.columns.map((c) => c.name),
      actualColumns: actualColumns.map((c) => ({ name: c.name, type: c.type })),
      missingColumns,
      typeMismatches,
      nullabilityViolations,
    },
    diagnostics: passed ? undefined : issues.join(" | "),
  };
}
