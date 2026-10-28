import { z } from "zod";
import {
  DuckDBEngine,
  runChecks,
  ConfigError,
  ExecutionError,
  SecurityError,
  type InputConfig,
  type CheckConfig,
  type CheckResult,
} from "@pipeseal/core";
import { PathGuard, PathSecurityError } from "../security/path-guard.js";
import {
  PRIVACY_LIMITATION_NOTICE,
  sanitizeCheckResult,
  deepRedact,
} from "../security/privacy.js";
import {
  formatSuccessResponse,
  formatErrorResponse,
  type McpCallToolResult,
} from "./types.js";

const MAX_TIMEOUT_MS = 60000;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_SAMPLE_ROWS = 20;

export const TestSqlInputSchema = {
  sql: z
    .string()
    .min(1, "SQL statement must not be empty")
    .describe(
      "SQL transformation statement to execute and verify in ephemeral DuckDB",
    ),
  transformationName: z
    .string()
    .optional()
    .default("test_transformation")
    .describe("Name of the target transformation table"),
  inputs: z
    .array(
      z.object({
        name: z.string().describe("Table name for this fixture in DuckDB"),
        source: z
          .string()
          .describe(
            "Path to CSV/JSON/Parquet fixture file relative to project root",
          ),
        format: z
          .enum(["csv", "json", "parquet"])
          .optional()
          .default("csv")
          .describe("Input fixture format"),
      }),
    )
    .min(
      1,
      "At least one input fixture must be declared for pipeline verification",
    )
    .describe("Declared input fixture datasets"),
  checks: z
    .array(z.record(z.unknown()))
    .optional()
    .describe(
      "Optional PipeSeal verification checks (e.g. schema, not_null, unique, row_count, custom_sql, output_match)",
    ),
  include_sample_values: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to include raw sample row values in the response (default: false for data privacy).",
    ),
  includeSampleValues: z
    .boolean()
    .optional()
    .describe("Alias for include_sample_values"),
  timeoutMs: z
    .number()
    .optional()
    .default(DEFAULT_TIMEOUT_MS)
    .describe(`Execution timeout in milliseconds (max ${MAX_TIMEOUT_MS}ms)`),
  projectRoot: z
    .string()
    .optional()
    .describe("Optional trusted project root directory"),
};

export async function handleTestSql(args: {
  sql: string;
  transformationName?: string;
  inputs: Array<{
    name: string;
    source: string;
    format?: "csv" | "json" | "parquet";
  }>;
  checks?: Array<Record<string, unknown>>;
  include_sample_values?: boolean;
  includeSampleValues?: boolean;
  timeoutMs?: number;
  projectRoot?: string;
}): Promise<McpCallToolResult> {
  const includeSamples = Boolean(
    args.include_sample_values ?? args.includeSampleValues ?? false,
  );

  let pathGuard: PathGuard;
  try {
    pathGuard = new PathGuard({ trustedRoot: args.projectRoot });
  } catch (err) {
    return formatErrorResponse(
      "PATH_SECURITY_ERROR",
      `Invalid project root: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Reject destructive or configuration-altering SQL commands
  if (/\b(ATTACH|COPY|SET|INSTALL|LOAD)\b/i.test(args.sql)) {
    return formatErrorResponse(
      "SECURITY_ERROR",
      "Destructive or configuration-altering SQL operation (ATTACH, COPY, SET, INSTALL, LOAD) is prohibited by PipeSeal security policy",
    );
  }

  // 1. Validate all fixture paths
  const validatedInputs: InputConfig[] = [];
  try {
    for (const inp of args.inputs) {
      const resolvedSource = pathGuard.resolveAndValidate(inp.source);
      validatedInputs.push({
        name: inp.name,
        source: resolvedSource,
        format: inp.format ?? "csv",
      });
    }
  } catch (err) {
    if (err instanceof PathSecurityError) {
      return formatErrorResponse("PATH_SECURITY_ERROR", err.message, {
        requestedPath: err.requestedPath,
      });
    }
    return formatErrorResponse(
      "PATH_SECURITY_ERROR",
      `Fixture path validation error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Validate checks if provided (and validate any expected fixture paths)
  const validatedChecks: CheckConfig[] = [];
  const expectedTables = new Map<string, string>();
  let expectedIndex = 0;

  if (args.checks && args.checks.length > 0) {
    try {
      for (const rawCheck of args.checks) {
        if (
          rawCheck.type === "output_match" &&
          typeof rawCheck.expected === "string"
        ) {
          const resolvedExpected = pathGuard.resolveAndValidate(
            rawCheck.expected,
          );
          if (!expectedTables.has(resolvedExpected)) {
            expectedTables.set(
              resolvedExpected,
              `_expected_${expectedIndex++}`,
            );
          }
          validatedChecks.push({
            ...rawCheck,
            expected: resolvedExpected,
          } as unknown as CheckConfig);
        } else {
          validatedChecks.push(rawCheck as unknown as CheckConfig);
        }
      }
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return formatErrorResponse("PATH_SECURITY_ERROR", err.message, {
          requestedPath: err.requestedPath,
        });
      }
      return formatErrorResponse(
        "INVALID_INPUT",
        `Invalid check configuration: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const effectiveTimeout = Math.min(
    Math.max(100, args.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    MAX_TIMEOUT_MS,
  );
  const transName = args.transformationName || "test_transformation";

  const engine = new DuckDBEngine({ defaultTimeoutMs: effectiveTimeout });

  try {
    await engine.initialize();

    // 3. Load declared fixtures into memory
    for (const inp of validatedInputs) {
      await engine.loadFixture(inp.name, inp.source, inp.format);
    }

    // Load expected fixtures for output_match checks if any
    for (const [expPath, expTableName] of expectedTables.entries()) {
      await engine.loadFixture(expTableName, expPath, "csv");
    }

    // 4. Lock down external access
    await engine.lockdown();

    // 5. Execute transformation
    const transResult = await engine.executeTransformation(transName, args.sql);

    // 6. Handle sample rows based on privacy preference
    let sampleRows: Array<Record<string, unknown>> = [];
    if (includeSamples) {
      const sampleQuery = await engine.runQuery(
        `SELECT * FROM "${transName}" LIMIT ${MAX_SAMPLE_ROWS}`,
      );
      const cols = sampleQuery.columnNames;
      sampleRows = sampleQuery.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        cols.forEach((col: string, idx: number) => {
          obj[col] = row[idx];
        });
        return deepRedact(obj, pathGuard);
      });
    }

    // 7. Run checks if requested
    let checkResults: CheckResult[] = [];
    let checksPassed = true;
    let failedCount = 0;

    if (validatedChecks.length > 0) {
      const rawChecks = await runChecks(validatedChecks, {
        engine,
        defaultTargetTable: transName,
        expectedTables,
      });

      checkResults = rawChecks.map((c) =>
        sanitizeCheckResult(c, includeSamples, pathGuard),
      );
      failedCount = checkResults.filter((c) => c.status === "fail").length;
      checksPassed = failedCount === 0;
    }

    const isPass = checksPassed;
    const summaryMsg = isPass
      ? `SQL test execution PASSED: '${transName}' generated ${transResult.outputRowCount} rows in ${transResult.durationMs}ms.` +
        (!includeSamples
          ? " (Raw row samples omitted for privacy; set include_sample_values: true to view sample values)"
          : "")
      : `SQL test execution completed with check FAILURE: ${failedCount}/${checkResults.length} assertion(s) failed.`;

    return formatSuccessResponse(summaryMsg, {
      status: isPass ? "PASS" : "FAIL",
      exitCode: isPass ? 0 : 1,
      transformation: {
        name: transName,
        outputRowCount: transResult.outputRowCount,
        durationMs: transResult.durationMs,
        columns: transResult.columns,
        sqlFingerprint: transResult.fingerprint,
      },
      sampleRows: includeSamples ? sampleRows : [],
      sampleRowsOmitted: !includeSamples,
      summary: {
        total_checks: checkResults.length,
        passed: checkResults.length - failedCount,
        failed: failedCount,
        status: isPass ? "PASS" : "FAIL",
      },
      checks: checkResults,
      inputs: validatedInputs.map((inp) => ({
        name: inp.name,
        source: pathGuard.toRelativeSafePath(inp.source),
        format: inp.format,
      })),
      privacyNotice: PRIVACY_LIMITATION_NOTICE,
    });
  } catch (err) {
    if (err instanceof SecurityError) {
      return formatErrorResponse("SECURITY_ERROR", err.message);
    }
    if (err instanceof ExecutionError) {
      const isTimeout =
        err.message.toLowerCase().includes("timeout") ||
        err.message.toLowerCase().includes("interrupt");
      return formatErrorResponse(
        isTimeout ? "TIMEOUT_ERROR" : "EXECUTION_ERROR",
        err.message,
      );
    }
    if (err instanceof ConfigError) {
      return formatErrorResponse("CONFIG_ERROR", err.message);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return formatErrorResponse(
      "EXECUTION_ERROR",
      `SQL test execution failed: ${msg}`,
    );
  } finally {
    await engine.destroy();
  }
}
