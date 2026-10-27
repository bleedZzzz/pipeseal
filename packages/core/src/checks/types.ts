import { type ExecutionEngine } from "../engine/types.js";

export interface CheckContext {
  engine: ExecutionEngine;
  defaultTargetTable: string;
  expectedTables?: Map<string, string>;
}

export type CheckStatus = "pass" | "fail";

export interface CheckResult {
  name: string;
  type: string;
  targetTable: string;
  status: CheckStatus;
  durationMs: number;
  details: Record<string, unknown>;
  diagnostics?: string;
  sampleFailures?: string[];
}

export interface CheckHandler<TConfig> {
  run(config: TConfig, context: CheckContext): Promise<CheckResult>;
}
