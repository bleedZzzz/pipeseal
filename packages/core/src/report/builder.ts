import { randomUUID } from "node:crypto";
import { type VerificationReport, type ReportSummary } from "./types.js";
import {
  type InputMetadata,
  type TransformationResult,
} from "../engine/types.js";
import { type CheckResult } from "../checks/types.js";

export interface BuildReportOptions {
  configName: string;
  configFingerprint: string;
  inputs: InputMetadata[];
  transformations: TransformationResult[];
  checks: CheckResult[];
  totalDurationMs: number;
}

export function safeJsonStringify(val: unknown): string {
  return JSON.stringify(val, (_, value) =>
    typeof value === "bigint" ? Number(value) : value,
  );
}

export function sanitizeDiagnostics(text: string): string {
  // Redact potential connection strings, tokens, and home directory prefixes
  return text
    .replace(/\b(password|token|secret|key)=([^&\s;]+)/gi, "$1=***REDACTED***")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer ***REDACTED***")
    .replace(/[A-Z]:\\(?:Users|home)\\[^\\]+\\/gi, "<user-home>/")
    .replace(/\/home\/[^/]+\//gi, "<user-home>/");
}

export function buildVerificationReport(
  options: BuildReportOptions,
): VerificationReport {
  const runId = `ps_run_${new Date().toISOString().replace(/[:.]/g, "")}_${randomUUID().slice(0, 8)}`;
  const passed = options.checks.filter((c) => c.status === "pass").length;
  const failed = options.checks.length - passed;
  const isPassing = failed === 0;

  const summary: ReportSummary = {
    total_checks: options.checks.length,
    passed,
    failed,
    status: isPassing ? "PASS" : "FAIL",
  };

  const sanitizedChecks = options.checks.map((check) => ({
    ...check,
    diagnostics: check.diagnostics
      ? sanitizeDiagnostics(check.diagnostics)
      : undefined,
    sampleFailures: check.sampleFailures?.map((s) => sanitizeDiagnostics(s)),
  }));

  const limitations = [
    "Unsigned report: provides cryptographic input fingerprints but does not provide detached signature non-repudiation (v0.4 target).",
    "Passing assertions verify only declared checks, not full semantic transformation correctness or data freshness.",
    "Verification executed in an isolated DuckDB in-memory environment, which may exhibit minor dialect differences from production warehouses.",
  ];

  return {
    schema_version: "1.0.0",
    run_id: runId,
    timestamp: new Date().toISOString(),
    duration_ms: Math.round(options.totalDurationMs),
    config: {
      name: options.configName,
      fingerprint: options.configFingerprint,
    },
    inputs: options.inputs.map((inp) => ({
      name: inp.name,
      source: inp.source,
      fingerprint: inp.fingerprint,
      row_count: inp.rowCount,
    })),
    transformations: options.transformations.map((t) => ({
      name: t.name,
      fingerprint: t.fingerprint,
      duration_ms: t.durationMs,
      output_row_count: t.outputRowCount,
    })),
    checks: sanitizedChecks,
    summary,
    limitations,
    exit_code: isPassing ? 0 : 1,
  };
}
