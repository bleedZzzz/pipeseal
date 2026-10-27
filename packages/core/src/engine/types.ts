export interface ColumnMetadata {
  name: string;
  type: string;
  nullable: boolean;
}

export interface InputMetadata {
  name: string;
  source: string;
  fingerprint: string;
  rowCount: number;
  columns: ColumnMetadata[];
}

export interface TransformationResult {
  name: string;
  fingerprint: string;
  durationMs: number;
  outputRowCount: number;
  columns: ColumnMetadata[];
}

export interface QueryResult {
  columnNames: string[];
  rowCount: number;
  rows: unknown[][];
}

export interface ExecutionEngine {
  initialize(): Promise<void>;
  loadFixture(
    name: string,
    sourcePath: string,
    format: string,
  ): Promise<InputMetadata>;
  lockdown(): Promise<void>;
  executeTransformation(
    name: string,
    sql: string,
    timeoutMs?: number,
  ): Promise<TransformationResult>;
  runQuery(sql: string, timeoutMs?: number): Promise<QueryResult>;
  getTableColumns(tableName: string): Promise<ColumnMetadata[]>;
  destroy(): Promise<void>;
}
