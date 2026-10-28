import { z } from "zod";
import {
  verifyPipeline,
  ConfigError,
  ExecutionError,
  SecurityError,
  type VerificationReport,
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

export const VerifyInputSchema = {
  configPath: z
    .string()
    .describe(
      "Path to the PipeSeal verification YAML config file (relative to project root)",
    ),
  include_sample_values: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to include raw sample row values in failure diagnostics (default: false for data privacy).",
    ),
  includeSampleValues: z
    .boolean()
    .optional()
    .describe("Alias for include_sample_values"),
  projectRoot: z
    .string()
    .optional()
    .describe(
      "Optional trusted project root directory. Defaults to the current working directory.",
    ),
};

export async function handleVerify(args: {
  configPath: string;
  include_sample_values?: boolean;
  includeSampleValues?: boolean;
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
    const rawReport: VerificationReport =
      await verifyPipeline(resolvedConfigPath);

    // Sanitize host paths in report inputs
    const sanitizedInputs = rawReport.inputs.map((inp) => ({
      ...inp,
      source: pathGuard.toRelativeSafePath(inp.source),
    }));

    // Sanitize checks according to privacy preferences
    const sanitizedChecks = rawReport.checks.map((check) =>
      sanitizeCheckResult(check, includeSamples, pathGuard),
    );

    const sanitizedReport: VerificationReport = {
      ...rawReport,
      inputs: sanitizedInputs,
      checks: sanitizedChecks,
    };

    const isPass = sanitizedReport.summary.status === "PASS";
    const statusMsg = isPass
      ? `PipeSeal verification PASSED: ${sanitizedReport.summary.passed}/${sanitizedReport.summary.total_checks} checks passed in ${sanitizedReport.duration_ms}ms.`
      : `PipeSeal verification FAILED: ${sanitizedReport.summary.failed}/${sanitizedReport.summary.total_checks} check(s) failed in ${sanitizedReport.duration_ms}ms.` +
        (!includeSamples
          ? " (Raw failure sample values omitted for privacy; set include_sample_values: true to view sample values)"
          : "");

    return formatSuccessResponse(statusMsg, {
      status: sanitizedReport.summary.status,
      exitCode: isPass ? 0 : 1,
      durationMs: sanitizedReport.duration_ms,
      summary: sanitizedReport.summary,
      checks: sanitizedReport.checks,
      inputs: sanitizedReport.inputs,
      transformations: sanitizedReport.transformations,
      configFingerprint: sanitizedReport.config.fingerprint,
      sampleValuesOmitted: !includeSamples,
      privacyNotice: PRIVACY_LIMITATION_NOTICE,
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      return formatErrorResponse("CONFIG_ERROR", err.message);
    }
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
    const msg = err instanceof Error ? err.message : String(err);
    return formatErrorResponse(
      "EXECUTION_ERROR",
      `Verification failed: ${msg}`,
    );
  }
}
