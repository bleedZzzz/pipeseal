import pc from "picocolors";
import { type VerificationReport } from "@pipeseal/core";

export function formatHumanReport(report: VerificationReport): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(pc.bold(pc.cyan("🦭 PipeSeal Pipeline Verification")));
  lines.push(pc.gray("─".repeat(50)));
  lines.push(`${pc.bold("Pipeline:")}   ${report.config.name}`);
  lines.push(`${pc.bold("Run ID:")}     ${pc.gray(report.run_id)}`);
  lines.push(`${pc.bold("Duration:")}   ${report.duration_ms}ms`);
  lines.push("");

  // Inputs
  lines.push(pc.bold("Inputs:"));
  for (const input of report.inputs) {
    lines.push(
      `  • ${pc.green(input.name)}: ${input.row_count} rows (${pc.gray(input.fingerprint.slice(0, 12))}...)`,
    );
  }
  lines.push("");

  // Transformations
  lines.push(pc.bold("Transformations:"));
  for (const trans of report.transformations) {
    lines.push(
      `  • ${pc.cyan(trans.name)}: ${trans.output_row_count} rows in ${trans.duration_ms}ms`,
    );
  }
  lines.push("");

  // Checks
  lines.push(pc.bold("Checks:"));
  for (const check of report.checks) {
    const statusBadge =
      check.status === "pass"
        ? pc.bold(pc.green("✔ PASS"))
        : pc.bold(pc.red("✖ FAIL"));

    lines.push(
      `  ${statusBadge} ${pc.white(check.name)} (${check.durationMs}ms)`,
    );
    if (check.diagnostics) {
      lines.push(`         ${pc.yellow(check.diagnostics)}`);
    }
    if (check.sampleFailures && check.sampleFailures.length > 0) {
      for (const sample of check.sampleFailures) {
        lines.push(`         ${pc.gray("↳")} ${pc.dim(sample)}`);
      }
    }
  }
  lines.push("");

  // Summary
  lines.push(pc.gray("─".repeat(50)));
  const statusColor =
    report.summary.status === "PASS"
      ? pc.bgGreen(pc.black(" PASS "))
      : pc.bgRed(pc.white(" FAIL "));
  lines.push(
    `Result: ${statusColor}  ${report.summary.passed}/${report.summary.total_checks} checks passed (Exit code: ${report.exit_code})`,
  );
  lines.push("");

  return lines.join("\n");
}
