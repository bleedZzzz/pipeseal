import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VerifyInputSchema, handleVerify } from "./tools/verify.js";
import { TestSqlInputSchema, handleTestSql } from "./tools/test-sql.js";
import {
  InspectSchemaInputSchema,
  handleInspectSchema,
} from "./tools/inspect-schema.js";
import {
  DiffOutputInputSchema,
  handleDiffOutput,
} from "./tools/diff-output.js";

export interface CreateServerOptions {
  name?: string;
  version?: string;
}

/**
 * Creates and configures the PipeSeal MCP server with all four verification tools registered.
 */
export function createPipeSealMcpServer(
  options: CreateServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: options.name ?? "pipeseal-mcp",
    version: options.version ?? "0.2.0",
  });

  // Tool 1: pipeseal_verify
  server.tool(
    "pipeseal_verify",
    "Run full PipeSeal deterministic verification against an existing pipeline configuration YAML file. Returns structured check results, report metadata, and POSIX exit code semantics.",
    VerifyInputSchema,
    async (args) => {
      return handleVerify(args);
    },
  );

  // Tool 2: pipeseal_test_sql
  server.tool(
    "pipeseal_test_sql",
    "Evaluate a proposed SQL transformation against declared fixture inputs in an isolated, locked-down DuckDB in-memory database with native timeout interruption before committing pipeline changes.",
    TestSqlInputSchema,
    async (args) => {
      return handleTestSql(args);
    },
  );

  // Tool 3: pipeseal_inspect_schema
  server.tool(
    "pipeseal_inspect_schema",
    "Inspect the normalized column schema (names, normalized DuckDB types, nullability) and row count for declared fixture datasets or pipeline configuration tables.",
    InspectSchemaInputSchema,
    async (args) => {
      return handleInspectSchema(args);
    },
  );

  // Tool 4: pipeseal_diff_output
  server.tool(
    "pipeseal_diff_output",
    "Inspect why an output_match golden-record assertion failed. Returns detailed multiset difference counts (missing/extra rows) or ordered positional mismatch diagnostics with sanitized samples.",
    DiffOutputInputSchema,
    async (args) => {
      return handleDiffOutput(args);
    },
  );

  return server;
}
