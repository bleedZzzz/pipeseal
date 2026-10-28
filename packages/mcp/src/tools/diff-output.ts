import { z } from "zod";
import {
  verifyPipeline,
  ConfigError,
  ExecutionError,
  SecurityError,
  type PipeSealConfig,
  type InputConfig,
  type CheckResult,
} from "@pipeseal/core";
import { PathGuard, PathSecurityError } from "../security/path-guard.js";
import {
  PRIVACY_LIMITATION_NOTICE,
  sanitizeCheckResult,
} from "../security/privacy.js";
import {
  formatSuccessResponse,
  formatErrorResponse,
  type McpCallToolResult,
} from "./types.js";

const MAX_DIFF_SAMPLES = 100;
const DEFAULT_DIFF_SAMPLES = 20;

export const DiffOutputInputSchema = {
  configPath: z
    .string()
    .optional()
    .describe(
      "Path to a PipeSeal verification YAML config that declares an output_match check",
    ),
  checkName: z
    .string()
    .optional()
    .describe("Optional name of the specific output_match check in the config"),
  expectedFixture: z
    .string()
    .optional()
    .describe("Path to expected CSV fixture file relative to project root"),
  actualSql: z
    .string()
    .optional()
    .describe("SQL query that generates the actual output table to compare"),
  inputs: z
    .array(
      z.object({
        name: z.string(),
        source: z.string(),
        format: z.enum(["csv", "json", "parquet"]).optional().default("csv"),
      }),
    )
    .optional()
    .describe("Declared fixture inputs required for actualSql"),
  ordered: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to compare rows in strict ordered sequence"),
  orderBy: z
    .array(z.string())
    .optional()
    .describe(
      "Columns to order by for ordered comparison (with optional ASC/DESC)",
    ),
  compareColumns: z
    .array(z.string())
    .optional()
    .describe("Subset of columns to compare"),
  include_sample_values: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to include raw sample row values for missing and extra rows (default: false for data privacy).",
    ),
  includeSampleValues: z
    .boolean()
    .optional()
    .describe("Alias for include_sample_values"),
  maxDiffSamples: z
    .number()
    .optional()
    .default(DEFAULT_DIFF_SAMPLES)
    .describe(
      `Maximum sample discrepancy rows to return when include_sample_values is true (max ${MAX_DIFF_SAMPLES})`,
    ),
  projectRoot: z
    .string()
    .optional()
    .describe("Optional trusted project root directory"),
};

export async function handleDiffOutput(args: {
  configPath?: string;
  checkName?: string;
  expectedFixture?: string;
  actualSql?: string;
  inputs?: Array<{
    name: string;
    source: string;
    format?: "csv" | "json" | "parquet";
  }>;
  ordered?: boolean;
  orderBy?: string[];
  compareColumns?: string[];
  include_sample_values?: boolean;
  includeSampleValues?: boolean;
  maxDiffSamples?: number;
  projectRoot?: string;
}): Promise<McpCallToolResult> {
  const includeSamples = Boolean(
    args.include_sample_values ?? args.includeSampleValues ?? false,
  );

  if (
    !args.configPath &&
    !(args.expectedFixture && args.actualSql && args.inputs)
  ) {
    return formatErrorResponse(
      "INVALID_INPUT",
      "Either 'configPath' OR ('expectedFixture' + 'actualSql' + 'inputs') must be provided for output diff analysis.",
    );
  }

  let pathGuard: PathGuard;
  try {
    pathGuard = new PathGuard({ trustedRoot: args.projectRoot });
  } catch (err) {
    return formatErrorResponse(
      "PATH_SECURITY_ERROR",
      `Invalid project root: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let targetCheckResult: CheckResult | undefined;

  // Mode A: Diff existing check in a pipeline config
  if (args.configPath) {
    let resolvedConfigPath: string;
    try {
      resolvedConfigPath = pathGuard.resolveAndValidate(args.configPath);
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return formatErrorResponse("PATH_SECURITY_ERROR", err.message, {
          requestedPath: err.requestedPath,
        });
      }
      return formatErrorResponse(
        "PATH_SECURITY_ERROR",
        `Failed to validate config path: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      const report = await verifyPipeline(resolvedConfigPath);
      const outputMatchChecks = report.checks.filter(
        (c) => c.type === "output_match",
      );

      if (outputMatchChecks.length === 0) {
        return formatErrorResponse(
          "INVALID_INPUT",
          `No 'output_match' checks found in config '${pathGuard.toRelativeSafePath(resolvedConfigPath)}'.`,
        );
      }

      if (args.checkName) {
        targetCheckResult = outputMatchChecks.find(
          (c) => c.name === args.checkName,
        );
        if (!targetCheckResult) {
          return formatErrorResponse(
            "INVALID_INPUT",
            `Check '${args.checkName}' of type 'output_match' not found in config. Available checks: ${outputMatchChecks.map((c) => c.name).join(", ")}`,
          );
        }
      } else {
        targetCheckResult = outputMatchChecks[0];
      }
    } catch (err) {
      if (err instanceof ConfigError) {
        return formatErrorResponse("CONFIG_ERROR", err.message);
      }
      if (err instanceof SecurityError) {
        return formatErrorResponse("SECURITY_ERROR", err.message);
      }
      if (err instanceof ExecutionError) {
        return formatErrorResponse("EXECUTION_ERROR", err.message);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return formatErrorResponse(
        "EXECUTION_ERROR",
        `Failed to run verification: ${msg}`,
      );
    }
  }

  // Mode B: Ad-hoc output diff
  if (args.expectedFixture && args.actualSql && args.inputs) {
    let resolvedExpected: string;
    const validatedInputs: InputConfig[] = [];

    try {
      resolvedExpected = pathGuard.resolveAndValidate(args.expectedFixture);
      for (const inp of args.inputs) {
        validatedInputs.push({
          name: inp.name,
          source: pathGuard.resolveAndValidate(inp.source),
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
        `Path validation error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const inMemoryConfig: PipeSealConfig = {
      version: "1",
      name: "adhoc_output_diff",
      inputs: validatedInputs,
      transformations: [
        {
          name: "actual_diff_table",
          sql: args.actualSql,
        },
      ],
      checks: [
        {
          type: "output_match",
          name: "adhoc_output_diff_check",
          target: "actual_diff_table",
          expected: resolvedExpected,
          ordered: args.ordered ?? false,
          order_by: args.orderBy,
          compare: args.compareColumns,
        },
      ],
    };

    try {
      const report = await verifyPipeline(inMemoryConfig);
      targetCheckResult = report.checks[0];
    } catch (err) {
      if (err instanceof SecurityError) {
        return formatErrorResponse("SECURITY_ERROR", err.message);
      }
      if (err instanceof ExecutionError) {
        return formatErrorResponse("EXECUTION_ERROR", err.message);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return formatErrorResponse(
        "EXECUTION_ERROR",
        `Output diff run failed: ${msg}`,
      );
    }
  }

  if (!targetCheckResult) {
    return formatErrorResponse(
      "EXECUTION_ERROR",
      "Failed to obtain output comparison result",
    );
  }

  const passed = targetCheckResult.status === "pass";
  const details = targetCheckResult.details ?? {};
  const isOrdered = Boolean(details.ordered);

  // Apply privacy sanitization
  const sanitizedCheck = sanitizeCheckResult(
    targetCheckResult,
    includeSamples,
    pathGuard,
  );

  let summaryMsg: string;
  if (passed) {
    summaryMsg = `Output comparison MATCH: Actual output matches expected fixture (${isOrdered ? "ordered" : "order-independent multiset"}).`;
  } else {
    summaryMsg =
      `Output comparison MISMATCH: ${targetCheckResult.diagnostics ?? "Discrepancy detected between actual output and expected fixture."}` +
      (!includeSamples
        ? " (Raw row samples omitted for privacy; set include_sample_values: true to view sample values)"
        : "");
  }

  const maxSamples = Math.min(
    Math.max(1, args.maxDiffSamples ?? DEFAULT_DIFF_SAMPLES),
    MAX_DIFF_SAMPLES,
  );

  const sampleFailures = sanitizedCheck.sampleFailures ?? [];
  const boundedFailures = sampleFailures.slice(0, maxSamples);

  return formatSuccessResponse(summaryMsg, {
    checkName: sanitizedCheck.name,
    targetTable: sanitizedCheck.targetTable,
    status: sanitizedCheck.status,
    passed,
    comparisonSemantics: isOrdered ? "ordered" : "order_independent_multiset",
    durationMs: sanitizedCheck.durationMs,
    details: sanitizedCheck.details,
    diagnostics: sanitizedCheck.diagnostics,
    sampleFailures: boundedFailures,
    sampleValuesOmitted: !includeSamples,
    privacyNotice: PRIVACY_LIMITATION_NOTICE,
  });
}
