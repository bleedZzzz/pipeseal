import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPipeSealMcpServer } from "../../packages/mcp/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const mcpBinaryPath = path.resolve(projectRoot, "packages/mcp/dist/index.js");

function getResponseText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text: string }> })
    ?.content;
  return content?.[0]?.text ?? "";
}

describe("PipeSeal MCP — Protocol & Transport", () => {
  describe("In-Memory Protocol Transport", () => {
    it("initializes client-server connection and discovers all 4 verification tools", async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const server = createPipeSealMcpServer();
      const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} },
      );

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const toolsResult = await client.listTools();
      expect(toolsResult.tools).toBeDefined();
      expect(toolsResult.tools.length).toBe(4);

      const toolNames = toolsResult.tools.map((t) => t.name).sort();
      expect(toolNames).toEqual([
        "pipeseal_diff_output",
        "pipeseal_inspect_schema",
        "pipeseal_test_sql",
        "pipeseal_verify",
      ]);

      // Verify each tool has a meaningful description and schema
      for (const tool of toolsResult.tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }

      await client.close();
      await server.close();
    });

    it("handles invalid tool inputs with a schema validation error", async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const server = createPipeSealMcpServer();
      const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} },
      );

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      // pipeseal_verify requires configPath; passing empty arguments should trigger validation failure
      const result = await client.callTool({
        name: "pipeseal_verify",
        arguments: {} as unknown as Record<string, unknown>,
      });

      expect(result.isError).toBe(true);
      expect(getResponseText(result)).toMatch(/configPath|Required/i);

      await client.close();
      await server.close();
    });
  });

  describe("Subprocess Stdio Transport & Clean stdout", () => {
    let client: Client | null = null;
    let transport: StdioClientTransport | null = null;

    afterAll(async () => {
      if (client) {
        await client.close().catch(() => {});
      }
    });

    it("starts MCP server as an external child process over stdio without stdout pollution", async () => {
      transport = new StdioClientTransport({
        command: "node",
        args: [mcpBinaryPath],
        cwd: projectRoot,
        stderr: "pipe",
      });

      client = new Client(
        { name: "stdio-test-client", version: "1.0.0" },
        { capabilities: {} },
      );

      // If the server wrote non-protocol messages to stdout, this initialization would fail with a JSON-RPC parse error
      await client.connect(transport);

      const listResult = await client.listTools();
      expect(listResult.tools.length).toBe(4);

      // Execute a real passing tool call over stdio to guarantee bi-directional protocol integrity
      const passingResult = await client.callTool({
        name: "pipeseal_verify",
        arguments: {
          configPath: "examples/basic-csv/pipeseal.verify.yml",
          projectRoot,
        },
      });

      expect(passingResult.isError).toBe(false);
      const passingText = getResponseText(passingResult);
      expect(passingText).toContain("PipeSeal verification PASSED");
      const passingParsed = JSON.parse(passingText.split("\n\n")[1] ?? "{}");
      expect(passingParsed.data.status).toBe("PASS");
      expect(passingParsed.data.exitCode).toBe(0);

      // Execute a real failing tool call over stdio to guarantee failure reporting without protocol crash
      const failingResult = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: "SELECT id, name FROM raw_customers",
          inputs: [
            {
              name: "raw_customers",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          checks: [
            {
              type: "row_count",
              name: "expect_hundreds_of_rows",
              min: 500,
            },
          ],
          projectRoot,
        },
      });

      expect(failingResult.isError).toBe(false);
      const failingText = getResponseText(failingResult);
      expect(failingText).toContain("SQL test execution completed with check FAILURE");
      const failingParsed = JSON.parse(failingText.split("\n\n")[1] ?? "{}");
      expect(failingParsed.data.status).toBe("FAIL");
      expect(failingParsed.data.exitCode).toBe(1);
      expect(failingParsed.data.summary.failed).toBe(1);

      await client.close();
      client = null;
    });

    it("shuts down cleanly and idempotently when client closes transport", async () => {
      const shutdownTransport = new StdioClientTransport({
        command: "node",
        args: [mcpBinaryPath],
        cwd: projectRoot,
        stderr: "pipe",
      });

      const shutdownClient = new Client(
        { name: "shutdown-test-client", version: "1.0.0" },
        { capabilities: {} },
      );

      await shutdownClient.connect(shutdownTransport);
      expect(shutdownClient.getServerVersion()).toBeDefined();

      // Trigger client transport close which sends EOF to server
      await shutdownClient.close();

      // Verify that repeating close on the client is idempotent and does not throw
      await expect(shutdownClient.close()).resolves.not.toThrow();
    });
  });
});
