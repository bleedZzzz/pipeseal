import { type CheckResult } from "../checks/types.js";

export interface ReportSummary {
  total_checks: number;
  passed: number;
  failed: number;
  status: "PASS" | "FAIL";
}

export interface VerificationReport {
  schema_version: "1.0.0";
  run_id: string;
  timestamp: string;
  duration_ms: number;
  config: {
    name: string;
    fingerprint: string;
  };
  inputs: Array<{
    name: string;
    source: string;
    fingerprint: string;
    row_count: number;
  }>;
  transformations: Array<{
    name: string;
    fingerprint: string;
    duration_ms: number;
    output_row_count: number;
  }>;
  checks: CheckResult[];
  summary: ReportSummary;
  limitations: string[];
  exit_code: 0 | 1 | 2;
}
