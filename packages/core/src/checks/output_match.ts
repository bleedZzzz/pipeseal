import { type OutputMatchCheckConfig } from "../config/types.js";
import { type CheckContext, type CheckResult } from "./types.js";
import { safeJsonStringify } from "../report/builder.js";

export async function runOutputMatchCheck(
  config: OutputMatchCheckConfig,
  context: CheckContext,
): Promise<CheckResult> {
  const startTime = performance.now();
  const targetTable = config.target ?? context.defaultTargetTable;
  const checkName = config.name ?? `output_match_${targetTable}`;

  const expectedTable = context.expectedTables?.get(config.expected);
  if (!expectedTable) {
    return {
      name: checkName,
      type: "output_match",
      targetTable,
      status: "fail",
      durationMs: 0,
      details: {
        error: `Expected fixture was not staged for ${config.expected}`,
      },
      diagnostics: `Expected fixture was not loaded: ${config.expected}`,
    };
  }

  // 1. Column & Schema Validation
  const actualCols = await context.engine.getTableColumns(targetTable);
  const expectedCols = await context.engine.getTableColumns(expectedTable);

  const actualColMap = new Map(
    actualCols.map((c) => [c.name.toLowerCase(), c]),
  );
  const expectedColMap = new Map(
    expectedCols.map((c) => [c.name.toLowerCase(), c]),
  );

  let columnsToCompare: string[];
  if (config.compare && config.compare.length > 0) {
    columnsToCompare = config.compare;
  } else {
    columnsToCompare = expectedCols.map((c) => c.name);
  }

  const missingInActual: string[] = [];
  const missingInExpected: string[] = [];
  const typeMismatches: string[] = [];

  for (const colName of columnsToCompare) {
    const act = actualColMap.get(colName.toLowerCase());
    const exp = expectedColMap.get(colName.toLowerCase());

    if (!act) {
      missingInActual.push(colName);
      continue;
    }
    if (!exp) {
      missingInExpected.push(colName);
      continue;
    }

    // Check type compatibility
    const actType = act.type
      .toUpperCase()
      .replace(/\(.*\)/, "")
      .trim();
    const expType = exp.type
      .toUpperCase()
      .replace(/\(.*\)/, "")
      .trim();

    const isCompatible =
      actType === expType ||
      (actType === "VARCHAR" && (expType === "TEXT" || expType === "STRING")) ||
      (actType === "TEXT" && (expType === "VARCHAR" || expType === "STRING")) ||
      (actType === "INTEGER" &&
        (expType === "INT4" || expType === "BIGINT" || expType === "INT")) ||
      (actType === "BIGINT" && (expType === "INT8" || expType === "INTEGER"));

    if (!isCompatible) {
      typeMismatches.push(
        `${colName} (actual ${act.type} != expected ${exp.type})`,
      );
    }
  }

  if (
    missingInActual.length > 0 ||
    missingInExpected.length > 0 ||
    typeMismatches.length > 0
  ) {
    const durationMs = Math.round(performance.now() - startTime);
    const errors: string[] = [];
    if (missingInActual.length > 0)
      errors.push(`Columns missing in actual: ${missingInActual.join(", ")}`);
    if (missingInExpected.length > 0)
      errors.push(
        `Columns missing in expected: ${missingInExpected.join(", ")}`,
      );
    if (typeMismatches.length > 0)
      errors.push(`Column type mismatches: ${typeMismatches.join("; ")}`);

    return {
      name: checkName,
      type: "output_match",
      targetTable,
      status: "fail",
      durationMs,
      details: {
        missingInActual,
        missingInExpected,
        typeMismatches,
      },
      diagnostics: `Schema mismatch before row comparison: ${errors.join(" | ")}`,
    };
  }

  // 2. Row Comparison
  const quotedCols = columnsToCompare.map((c) => `"${c}"`).join(", ");

  const actualCountRes = await context.engine.runQuery(
    `SELECT COUNT(*) FROM "${targetTable}"`,
  );
  const expectedCountRes = await context.engine.runQuery(
    `SELECT COUNT(*) FROM "${expectedTable}"`,
  );
  const actualCount = Number(actualCountRes.rows[0]?.[0] ?? 0);
  const expectedCount = Number(expectedCountRes.rows[0]?.[0] ?? 0);

  // Scenario A: Ordered comparison
  if (config.ordered) {
    if (actualCount !== expectedCount) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        name: checkName,
        type: "output_match",
        targetTable,
        status: "fail",
        durationMs,
        details: {
          ordered: true,
          actualCount,
          expectedCount,
        },
        diagnostics: `Row count mismatch in ordered comparison: actual has ${actualCount} rows, expected has ${expectedCount} rows`,
      };
    }

    const actualRowsRes = await context.engine.runQuery(
      `SELECT ${quotedCols} FROM "${targetTable}"`,
    );
    const expectedRowsRes = await context.engine.runQuery(
      `SELECT ${quotedCols} FROM "${expectedTable}"`,
    );

    let mismatchIndex = -1;
    let actualSample: unknown[] = [];
    let expectedSample: unknown[] = [];

    for (let i = 0; i < actualRowsRes.rowCount; i++) {
      const aRow = actualRowsRes.rows[i] ?? [];
      const eRow = expectedRowsRes.rows[i] ?? [];

      const matches = aRow.every((val, colIdx) => {
        const expVal = eRow[colIdx];
        if (val === null && expVal === null) return true;
        if (val === null || expVal === null) return false;
        return val === expVal;
      });

      if (!matches) {
        mismatchIndex = i;
        actualSample = aRow;
        expectedSample = eRow;
        break;
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    if (mismatchIndex !== -1) {
      return {
        name: checkName,
        type: "output_match",
        targetTable,
        status: "fail",
        durationMs,
        details: {
          ordered: true,
          mismatchRowIndex: mismatchIndex,
        },
        diagnostics: `Ordered mismatch at row index ${mismatchIndex + 1}`,
        sampleFailures: [
          `Expected row: ${safeJsonStringify(expectedSample)}`,
          `Actual row:   ${safeJsonStringify(actualSample)}`,
        ],
      };
    }

    return {
      name: checkName,
      type: "output_match",
      targetTable,
      status: "pass",
      durationMs,
      details: {
        ordered: true,
        matchedRows: actualCount,
        columns: columnsToCompare,
      },
    };
  }

  // Scenario B: Order-independent multiset (bag) comparison via EXCEPT ALL
  const extraCountRes = await context.engine.runQuery(
    `SELECT COUNT(*) FROM ((SELECT ${quotedCols} FROM "${targetTable}") EXCEPT ALL (SELECT ${quotedCols} FROM "${expectedTable}"))`,
  );
  const missingCountRes = await context.engine.runQuery(
    `SELECT COUNT(*) FROM ((SELECT ${quotedCols} FROM "${expectedTable}") EXCEPT ALL (SELECT ${quotedCols} FROM "${targetTable}"))`,
  );

  const extraCount = Number(extraCountRes.rows[0]?.[0] ?? 0);
  const missingCount = Number(missingCountRes.rows[0]?.[0] ?? 0);

  const passed = extraCount === 0 && missingCount === 0;
  const durationMs = Math.round(performance.now() - startTime);

  const sampleFailures: string[] = [];
  if (!passed) {
    if (missingCount > 0) {
      const sampleMissing = await context.engine.runQuery(
        `(SELECT ${quotedCols} FROM "${expectedTable}") EXCEPT ALL (SELECT ${quotedCols} FROM "${targetTable}") LIMIT 3`,
      );
      for (const row of sampleMissing.rows) {
        sampleFailures.push(`Missing expected row: ${safeJsonStringify(row)}`);
      }
    }
    if (extraCount > 0) {
      const sampleExtra = await context.engine.runQuery(
        `(SELECT ${quotedCols} FROM "${targetTable}") EXCEPT ALL (SELECT ${quotedCols} FROM "${expectedTable}") LIMIT 3`,
      );
      for (const row of sampleExtra.rows) {
        sampleFailures.push(`Unexpected actual row: ${safeJsonStringify(row)}`);
      }
    }
  }

  return {
    name: checkName,
    type: "output_match",
    targetTable,
    status: passed ? "pass" : "fail",
    durationMs,
    details: {
      ordered: false,
      actualCount,
      expectedCount,
      extraCount,
      missingCount,
      columns: columnsToCompare,
    },
    diagnostics: passed
      ? undefined
      : `Output comparison mismatch: ${missingCount} missing row(s), ${extraCount} unexpected row(s)`,
    sampleFailures: sampleFailures.length > 0 ? sampleFailures : undefined,
  };
}
