export type ErrorCategory =
  "CONFIG_ERROR" | "EXECUTION_ERROR" | "SECURITY_ERROR" | "VERIFICATION_ERROR";

export class PipeSealError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly exitCode: 1 | 2 = 2,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PipeSealError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigError extends PipeSealError {
  constructor(message: string, details?: unknown) {
    super(message, "CONFIG_ERROR", 2, details);
    this.name = "ConfigError";
  }
}

export class ExecutionError extends PipeSealError {
  constructor(message: string, details?: unknown) {
    super(message, "EXECUTION_ERROR", 2, details);
    this.name = "ExecutionError";
  }
}

export class SecurityError extends PipeSealError {
  constructor(message: string, details?: unknown) {
    super(message, "SECURITY_ERROR", 2, details);
    this.name = "SecurityError";
  }
}
