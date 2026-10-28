import { z } from "zod";
import {
  DuckDBEngine,
  loadConfigFile,
  ConfigError,
  ExecutionError,
  SecurityError,
  type ColumnMetadata,
} from "@pipeseal/core";
import { PathGuard, PathSecurityError } from "../security/path-guard.js";
import {
  formatSuccessResponse,
  formatErrorResponse,
  type McpCallToolResult,
} from "./types.js";
import { PRIVACY_LIMITATION_NOTICE } from "../security/privacy.js";

export const InspectSchemaInputSchema = {
  fixturePath: z
    .string()
    .optional()
    .describe(
      "Path to a standalone fixture file (CSV, JSON, Parquet) relative to project root",
    ),
  fixtureFormat: z
    .enum(["csv", "json", "parquet"])
    .optional()
    .default("csv")
    .describe("Format of the fixture file (default: csv)"),
  configPath: z
    .string()
    .optional()
    .describe(
      "Path to a PipeSeal verification YAML config to inspect all declared input and transformation schemas",
    ),
  tableName: z
    .string()
    .optional()
    .describe("Specific table name to inspect when configPath is provided"),
  projectRoot: z
    .string()
    .optional()
    .describe("Optional trusted project root directory"),
};

export async function handleInspectSchema(args: {
  fixturePath?: string;
  fixtureFormat?: "csv" | "json" | "parquet";
  configPath?: string;
  tableName?: string;
  projectRoot?: string;
}): Promise<McpCallToolResult> {
  if (!args.fixturePath && !args.configPath) {
    return formatErrorResponse(
      "INVALID_INPUT",
      "Either 'fixturePath' or 'configPath' must be provided to inspect schema.",
    );
  }

  let pathGuard: PathGuard;
  try {
    pathGuard = new PathGuard({ trustedRoot: args.projectRoot });
  } catch (err) {
    return formatErrorResponse(
      "PATH_SECURITY_ERROR",
      `Invalid project root: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Case 1: Inspect a standalone fixture file directly
  if (args.fixturePath) {
    let resolvedFixturePath: string;
    try {
      resolvedFixturePath = pathGuard.resolveAndValidate(args.fixturePath);
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return formatErrorResponse("PATH_SECURITY_ERROR", err.message, {
          requestedPath: err.requestedPath,
        });
      }
      return formatErrorResponse(
        "PATH_SECURITY_ERROR",
        `Failed to validate fixture path: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const engine = new DuckDBEngine();
    try {
      await engine.initialize();
      const meta = await engine.loadFixture(
        args.tableName || "fixture_table",
        resolvedFixturePath,
        args.fixtureFormat ?? "csv",
      );

      return formatSuccessResponse(
        `Successfully inspected schema for '${pathGuard.toRelativeSafePath(resolvedFixturePath)}' (${meta.columns.length} columns, ${meta.rowCount} rows).`,
        {
          target: "fixture",
          tableName: meta.name,
          source: pathGuard.toRelativeSafePath(meta.source),
          rowCount: meta.rowCount,
          columns: meta.columns,
          fingerprint: meta.fingerprint,
          privacyNotice: PRIVACY_LIMITATION_NOTICE,
        },
      );
    } catch (err) {
      if (err instanceof SecurityError) {
        return formatErrorResponse("SECURITY_ERROR", err.message);
      }
      if (err instanceof ExecutionError) {
        return formatErrorResponse("EXECUTION_ERROR", err.message);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return formatErrorResponse(
        "EXECUTION_ERROR",
        `Failed to inspect fixture schema: ${msg}`,
      );
    } finally {
      await engine.destroy();
    }
  }

  // Case 2: Inspect schemas defined in a pipeline config
  if (args.configPath) {
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

    const engine = new DuckDBEngine();
    try {
      const loaded = await loadConfigFile(resolvedConfigPath);
      await engine.initialize();

      interface TableSchemaInfo {
        name: string;
        type: "input" | "transformation";
        source?: string;
        rowCount: number;
        columns: ColumnMetadata[];
      }

      const tables: TableSchemaInfo[] = [];

      // 1. Inspect inputs
      for (const inp of loaded.config.inputs) {
        const meta = await engine.loadFixture(inp.name, inp.source, inp.format);
        if (
          !args.tableName ||
          inp.name.toLowerCase() === args.tableName.toLowerCase()
        ) {
          tables.push({
            name: inp.name,
            type: "input",
            source: pathGuard.toRelativeSafePath(inp.source),
            rowCount: meta.rowCount,
            columns: meta.columns,
          });
        }
      }

      // 2. Lock down before transformations
      await engine.lockdown();

      // 3. Inspect transformations
      for (const trans of loaded.config.transformations) {
        const transResult = await engine.executeTransformation(
          trans.name,
          trans.sql,
        );
        if (
          !args.tableName ||
          trans.name.toLowerCase() === args.tableName.toLowerCase()
        ) {
          tables.push({
            name: trans.name,
            type: "transformation",
            rowCount: transResult.outputRowCount,
            columns: transResult.columns,
          });
        }
      }

      if (args.tableName && tables.length === 0) {
        return formatErrorResponse(
          "INVALID_INPUT",
          `Table '${args.tableName}' not found in configuration '${pathGuard.toRelativeSafePath(resolvedConfigPath)}'.`,
        );
      }

      return formatSuccessResponse(
        `Inspected schemas for ${tables.length} table(s) in '${pathGuard.toRelativeSafePath(resolvedConfigPath)}'.`,
        {
          target: "pipeline_config",
          configPath: pathGuard.toRelativeSafePath(resolvedConfigPath),
          tables,
          privacyNotice: PRIVACY_LIMITATION_NOTICE,
        },
      );
    } catch (err) {
      if (err instanceof ConfigError) {
        return formatErrorResponse("CONFIG_ERROR", err.message);
      }
      if (err instanceof SecurityError) {
        return formatErrorResponse("SECURITY_ERROR", err.message);
      }
      if (err instanceof ExecutionError) {
        return formatErrorResponse("EXECUTION_ERROR", err.message);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return formatErrorResponse(
        "EXECUTION_ERROR",
        `Failed to inspect pipeline schemas: ${msg}`,
      );
    } finally {
      await engine.destroy();
    }
  }

  return formatErrorResponse(
    "INVALID_INPUT",
    "Invalid schema inspection request",
  );
}
