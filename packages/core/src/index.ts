export { verifyPipeline, type VerifyOptions } from "./verifier.js";
export { loadConfigFile, type LoadedConfig } from "./config/loader.js";
export {
  PipeSealConfigSchema,
  InputConfigSchema,
  TransformationConfigSchema,
  SchemaCheckSchema,
  NotNullCheckSchema,
  UniqueCheckSchema,
  CustomSqlCheckSchema,
  RowCountCheckSchema,
  OutputMatchCheckSchema,
  CheckConfigSchema,
  type PipeSealConfig,
  type InputConfig,
  type InputFormat,
  type TransformationConfig,
  type ColumnSchema,
  type SchemaCheckConfig,
  type NotNullCheckConfig,
  type UniqueCheckConfig,
  type CustomSqlCheckConfig,
  type RowCountCheckConfig,
  type OutputMatchCheckConfig,
  type CheckConfig,
} from "./config/types.js";

export { type VerificationReport, type ReportSummary } from "./report/types.js";

export {
  type CheckResult,
  type CheckStatus,
  type CheckContext,
} from "./checks/types.js";

export {
  type ColumnMetadata,
  type InputMetadata,
  type TransformationResult,
  type QueryResult,
  type ExecutionEngine,
} from "./engine/types.js";

export {
  PipeSealError,
  ConfigError,
  ExecutionError,
  SecurityError,
  type ErrorCategory,
} from "./errors.js";
