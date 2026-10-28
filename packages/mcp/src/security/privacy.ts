import { type CheckResult } from "@pipeseal/core";
import { type PathGuard } from "./path-guard.js";

/**
 * Notice documenting the inherent limitations of heuristic data redaction.
 */
export const PRIVACY_LIMITATION_NOTICE =
  "Automated redaction cannot reliably identify every domain-specific sensitive value or piece of personal information. By default, PipeSeal MCP tools omit raw row values entirely (include_sample_values: false).";

const SECRET_PATTERNS = [
  // High-entropy bearer tokens and JWTs
  /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g,
  // AWS access key ID
  /\b(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
  // Key/secret assignments: password=..., api_key=..., token=...
  /(?<=\b(?:password|passwd|secret|token|api_?key|auth_?token|access_?token|bearer)\s*[:=]\s*["']?)[^"'\s,;]+/gi,
];

// File paths: Windows drive paths and Unix absolute paths
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^"'\s,;<>]+/g;
const UNIX_PATH_PATTERN =
  /(?:^|[\s"'])(\/(?:Users|home|root|etc|var|tmp|private)[^"'\s,;<>]+)/g;

/**
 * Redacts secrets and absolute host paths from diagnostic and error strings.
 */
export function redactSecretsAndPaths(
  text: string,
  pathGuard?: PathGuard,
): string {
  if (!text || typeof text !== "string") {
    return text;
  }

  let result = text;

  // 1. Redact known secret token formats
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED_SECRET]");
  }

  // 2. Redact absolute host filesystem paths
  if (pathGuard) {
    result = result.replace(WINDOWS_PATH_PATTERN, (match) => {
      try {
        return pathGuard.toRelativeSafePath(match);
      } catch {
        return "[REDACTED_PATH]";
      }
    });
    result = result.replace(UNIX_PATH_PATTERN, (_match, group) => {
      try {
        return pathGuard.toRelativeSafePath(group);
      } catch {
        return "[REDACTED_PATH]";
      }
    });
  } else {
    result = result.replace(WINDOWS_PATH_PATTERN, "[REDACTED_PATH]");
    result = result.replace(UNIX_PATH_PATTERN, "[REDACTED_PATH]");
  }

  return result;
}

/**
 * Deeply sanitizes an object or array to redact secrets and paths recursively.
 */
export function deepRedact<T>(input: T, pathGuard?: PathGuard): T {
  if (input === null || input === undefined) {
    return input;
  }
  if (typeof input === "string") {
    return redactSecretsAndPaths(input, pathGuard) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => deepRedact(item, pathGuard)) as unknown as T;
  }
  if (typeof input === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      copy[key] = deepRedact(value, pathGuard);
    }
    return copy as T;
  }
  return input;
}

/**
 * Sanitizes check results to ensure raw row values are omitted unless explicitly requested.
 */
export function sanitizeCheckResult(
  check: CheckResult,
  includeSampleValues: boolean,
  pathGuard?: PathGuard,
): CheckResult {
  const sanitizedDiagnostics = check.diagnostics
    ? redactSecretsAndPaths(check.diagnostics, pathGuard)
    : undefined;

  if (includeSampleValues) {
    return {
      ...check,
      diagnostics: sanitizedDiagnostics,
      details: check.details
        ? (deepRedact(check.details, pathGuard) as Record<string, unknown>)
        : {},
      sampleFailures: check.sampleFailures
        ? check.sampleFailures.map((s) => redactSecretsAndPaths(s, pathGuard))
        : undefined,
    };
  }

  // When includeSampleValues is false, strip raw sample row data from details and sampleFailures
  const sanitizedDetails: Record<string, unknown> = {
    ...(check.details ? deepRedact(check.details, pathGuard) : {}),
  };

  // Strip raw sample rows or violation values
  if (Array.isArray(sanitizedDetails.violations)) {
    sanitizedDetails.violations = sanitizedDetails.violations.map(
      (v: Record<string, unknown>) => ({
        column: v.column,
        row_number: v.row_number,
        value: "[OMITTED_FOR_PRIVACY]",
      }),
    );
  }
  if (Array.isArray(sanitizedDetails.duplicateGroups)) {
    sanitizedDetails.duplicateGroups = sanitizedDetails.duplicateGroups.map(
      (g: Record<string, unknown>) => ({
        count: g.count,
        values: "[OMITTED_FOR_PRIVACY]",
      }),
    );
  }
  if (sanitizedDetails.actualSample) {
    sanitizedDetails.actualSample = "[OMITTED_FOR_PRIVACY]";
  }
  if (sanitizedDetails.expectedSample) {
    sanitizedDetails.expectedSample = "[OMITTED_FOR_PRIVACY]";
  }

  const sampleFailures =
    check.sampleFailures && check.sampleFailures.length > 0
      ? [
          `[${check.sampleFailures.length} sample failure(s) omitted for data privacy. Set include_sample_values: true to inspect raw sample rows.]`,
        ]
      : undefined;

  return {
    ...check,
    diagnostics: sanitizedDiagnostics,
    details: sanitizedDetails,
    sampleFailures,
  };
}
