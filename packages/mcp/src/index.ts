import { fileURLToPath } from "node:url";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPipeSealMcpServer } from "./server.js";

export { createPipeSealMcpServer } from "./server.js";
export { handleVerify, VerifyInputSchema } from "./tools/verify.js";
export { handleTestSql, TestSqlInputSchema } from "./tools/test-sql.js";
export {
  handleInspectSchema,
  InspectSchemaInputSchema,
} from "./tools/inspect-schema.js";
export {
  handleDiffOutput,
  DiffOutputInputSchema,
} from "./tools/diff-output.js";
export { PathGuard, PathSecurityError } from "./security/path-guard.js";
export {
  type McpErrorCategory,
  type McpCallToolResult,
  type McpToolPayload,
} from "./tools/types.js";

function parseProjectRootArg(): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--project-root" || arg === "-r") {
      const nextArg = args[i + 1];
      if (nextArg) {
        return nextArg;
      }
    }
    if (arg.startsWith("--project-root=")) {
      return arg.slice("--project-root=".length);
    }
  }
  return undefined;
}

async function runStdioServer(): Promise<void> {
  const cliRoot = parseProjectRootArg();
  if (cliRoot && !process.env.PIPESEAL_PROJECT_ROOT) {
    process.env.PIPESEAL_PROJECT_ROOT = path.resolve(cliRoot);
  }

  // Stdio Transport: stdin is JSON-RPC input, stdout is JSON-RPC output.
  // All diagnostics, logs, or debugging MUST strictly go to stderr.
  const transport = new StdioServerTransport();
  const server = createPipeSealMcpServer({
    name: "pipeseal-mcp",
    version: "0.2.1",
  });

  let isClosing = false;
  const cleanup = async () => {
    if (isClosing) return;
    isClosing = true;
    try {
      await server.close();
    } catch (err) {
      console.error(
        `[pipeseal-mcp] Error closing server: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  transport.onerror = (err) => {
    console.error(`[pipeseal-mcp] Transport error: ${err.message}`);
  };

  transport.onclose = () => {
    if (isClosing) return;
    isClosing = true;
    process.exit(0);
  };

  process.stdin.on("close", () => {
    if (isClosing) return;
    cleanup().finally(() => {
      process.exit(0);
    });
  });

  try {
    await server.connect(transport);
    console.error("[pipeseal-mcp] Server running on stdio transport");
  } catch (err) {
    console.error(
      `[pipeseal-mcp] Failed to start MCP server: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const invokedFile = path.resolve(process.argv[1]);
    return (
      currentFile.toLowerCase() === invokedFile.toLowerCase() ||
      invokedFile.toLowerCase().endsWith("pipeseal-mcp")
    );
  } catch {
    return false;
  }
}

// When executed directly as a script / binary, start the stdio server
if (isDirectExecution()) {
  runStdioServer();
}
