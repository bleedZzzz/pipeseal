import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { StagingManager } from "./sandbox.js";
import {
  type ExecutionEngine,
  type InputMetadata,
  type TransformationResult,
  type QueryResult,
  type ColumnMetadata,
} from "./types.js";
import { computeHash, computeFileHash } from "../config/fingerprint.js";
import { ExecutionError, SecurityError } from "../errors.js";

export interface DuckDBEngineOptions {
  memoryLimit?: string;
  threads?: number;
  defaultTimeoutMs?: number;
}

export class DuckDBEngine implements ExecutionEngine {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private readonly staging = new StagingManager();
  private isLockedDown = false;

  constructor(private readonly options: DuckDBEngineOptions = {}) {}

  async initialize(): Promise<void> {
    try {
      await this.staging.initialize();
      this.instance = await DuckDBInstance.create(":memory:", {
        allow_community_extensions: "false",
        allow_unsigned_extensions: "false",
      });
      this.connection = await this.instance.connect();

      if (this.options.threads) {
        await this.connection.run(`SET threads = ${this.options.threads}`);
      }
      if (this.options.memoryLimit) {
        await this.connection.run(
          `SET max_memory = '${this.options.memoryLimit}'`,
        );
      }
    } catch (err) {
      await this.destroy();
      const msg = err instanceof Error ? err.message : String(err);
      throw new ExecutionError(
        `Failed to initialize DuckDB engine: ${msg}`,
        err,
      );
    }
  }

  private ensureConnected(): DuckDBConnection {
    if (!this.connection) {
      throw new ExecutionError("DuckDB connection is not active");
    }
    return this.connection;
  }

  async loadFixture(
    name: string,
    sourcePath: string,
    format: string,
  ): Promise<InputMetadata> {
    const conn = this.ensureConnected();

    if (this.isLockedDown) {
      throw new SecurityError(
        "Cannot load fixtures after engine security lockdown has been applied",
      );
    }

    const fingerprint = await computeFileHash(sourcePath);
    const staged = await this.staging.stageFile(sourcePath, name);
    // DuckDB requires forward slashes on Windows
    const normalizedStagedPath = staged.stagedPath.replace(/\\/g, "/");

    try {
      let readFunction: string;
      switch (format.toLowerCase()) {
        case "csv":
          readFunction = `read_csv_auto('${normalizedStagedPath}', header=true)`;
          break;
        case "json":
          readFunction = `read_json_auto('${normalizedStagedPath}')`;
          break;
        case "parquet":
          readFunction = `read_parquet('${normalizedStagedPath}')`;
          break;
        default:
          throw new ExecutionError(`Unsupported input format: ${format}`);
      }

      await conn.run(`CREATE TABLE "${name}" AS SELECT * FROM ${readFunction}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ExecutionError(
        `Failed to load fixture "${name}" from ${sourcePath}: ${msg}`,
        err,
      );
    }

    const columns = await this.getTableColumns(name);

    const countRes = await conn.run(`SELECT COUNT(*) AS cnt FROM "${name}"`);
    const countRows = await countRes.getRows();
    const firstRow = countRows[0];
    const rawCount = firstRow && firstRow[0] !== undefined ? firstRow[0] : 0;
    const rowCount =
      typeof rawCount === "bigint" ? Number(rawCount) : Number(rawCount);

    return {
      name,
      source: sourcePath,
      fingerprint,
      rowCount,
      columns,
    };
  }

  async lockdown(): Promise<void> {
    const conn = this.ensureConnected();
    try {
      // 1. Disable external filesystem and network access
      await conn.run("SET enable_external_access = false");
      // 2. Lock configuration against alteration by user SQL
      await conn.run("SET lock_configuration = true");
      this.isLockedDown = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SecurityError(
        `Failed to apply engine security lockdown: ${msg}`,
        err,
      );
    }
  }

  async executeTransformation(
    name: string,
    sql: string,
    timeoutMs?: number,
  ): Promise<TransformationResult> {
    const conn = this.ensureConnected();
    const fingerprint = computeHash(sql);
    const effectiveTimeout =
      timeoutMs ?? this.options.defaultTimeoutMs ?? 30000;

    const startTime = performance.now();
    try {
      // Execute wrapped in timeout guard
      await this.runWithTimeout(
        conn.run(`CREATE TABLE "${name}" AS (${sql})`),
        effectiveTimeout,
        `Transformation "${name}" execution`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission Error") || msg.includes("locked")) {
        throw new SecurityError(
          `Security policy violation in transformation "${name}": ${msg}`,
          err,
        );
      }
      if (err instanceof ExecutionError) {
        throw err;
      }
      if (msg.includes("INTERRUPT") || msg.includes("Interrupted")) {
        throw new ExecutionError(
          `Transformation "${name}" execution was interrupted by timeout`,
          err,
        );
      }
      throw new ExecutionError(
        `SQL error in transformation "${name}": ${msg}`,
        err,
      );
    }
    const durationMs = Math.round(performance.now() - startTime);

    const columns = await this.getTableColumns(name);
    const countRes = await conn.run(`SELECT COUNT(*) AS cnt FROM "${name}"`);
    const countRows = await countRes.getRows();
    const firstRow = countRows[0];
    const rawCount = firstRow && firstRow[0] !== undefined ? firstRow[0] : 0;
    const outputRowCount =
      typeof rawCount === "bigint" ? Number(rawCount) : Number(rawCount);

    return {
      name,
      fingerprint,
      durationMs,
      outputRowCount,
      columns,
    };
  }

  async runQuery(sql: string, timeoutMs?: number): Promise<QueryResult> {
    const conn = this.ensureConnected();
    const effectiveTimeout =
      timeoutMs ?? this.options.defaultTimeoutMs ?? 30000;

    try {
      const res = await this.runWithTimeout(
        conn.run(sql),
        effectiveTimeout,
        "Assertion query execution",
      );
      const columnNames = res.columnNames();
      const rawRows = await res.getRows();
      return {
        columnNames,
        rowCount: rawRows.length,
        rows: rawRows.map((r) =>
          r.map((val) => (typeof val === "bigint" ? Number(val) : val)),
        ),
      };
    } catch (err) {
      if (err instanceof ExecutionError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission Error") || msg.includes("locked")) {
        throw new SecurityError(
          `Security policy violation during query: ${msg}`,
          err,
        );
      }
      if (msg.includes("INTERRUPT") || msg.includes("Interrupted")) {
        throw new ExecutionError(
          `Assertion query execution was interrupted by timeout`,
          err,
        );
      }
      throw new ExecutionError(`Query failed: ${msg}`, err);
    }
  }

  async getTableColumns(tableName: string): Promise<ColumnMetadata[]> {
    const conn = this.ensureConnected();
    try {
      const res = await conn.run(`PRAGMA table_info("${tableName}")`);
      const rows = await res.getRows();
      return rows.map((row) => ({
        name: String(row[1]),
        type: String(row[2]),
        nullable: !Boolean(row[3]), // notnull is index 3
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ExecutionError(
        `Failed to inspect table schema for "${tableName}": ${msg}`,
        err,
      );
    }
  }

  async destroy(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.closeSync();
      } catch {
        // Ignore close errors during teardown
      } finally {
        this.connection = null;
      }
    }
    this.instance = null;
    await this.staging.cleanup();
  }

  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationDescription: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    let didTimeout = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        didTimeout = true;
        try {
          // Native DuckDB query cancellation: signals C++ engine to abort execution
          this.connection?.interrupt();
        } catch {
          // Ignore interrupt error if connection already closing
        }
        reject(
          new ExecutionError(
            `${operationDescription} exceeded configured timeout of ${timeoutMs}ms (native execution interrupted)`,
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (err) {
      if (didTimeout) {
        // Guarantee native DuckDB thread settles interrupt before connection can be closed
        await promise.catch(() => {});
        throw new ExecutionError(
          `${operationDescription} exceeded configured timeout of ${timeoutMs}ms (native execution interrupted)`,
          err,
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("INTERRUPT") || msg.includes("Interrupted")) {
        throw new ExecutionError(
          `${operationDescription} exceeded configured timeout of ${timeoutMs}ms (native execution interrupted)`,
          err,
        );
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
