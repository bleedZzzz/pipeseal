import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPipeSealMcpServer } from "../../packages/mcp/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

describe("PipeSeal MCP — Security & Guardrail Regressions", () => {
  let client: Client;
  let server: ReturnType<typeof createPipeSealMcpServer>;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    server = createPipeSealMcpServer();
    client = new Client(
      { name: "security-test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

function getResponseText(res: unknown): string {
  const content = (res as { content?: Array<{ type: string; text: string }> })
    ?.content;
  return content?.[0]?.text ?? "";
}

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  describe("Path Traversal & Filesystem Boundary", () => {
    it("rejects absolute paths resolving outside trusted project root", async () => {
      const forbiddenPath =
        process.platform === "win32"
          ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
          : "/etc/passwd";

      const res = await client.callTool({
        name: "pipeseal_verify",
        arguments: {
          configPath: forbiddenPath,
          projectRoot,
        },
      });

      expect(res.isError).toBe(true);
      const text = getResponseText(res);
      expect(text).toContain("PATH_SECURITY_ERROR");
      expect(text).toContain("resolves outside trusted project root");
    });

    it("rejects relative path traversal escaping project root", async () => {
      const res = await client.callTool({
        name: "pipeseal_verify",
        arguments: {
          configPath: "../../outside_secret.yml",
          projectRoot,
        },
      });

      expect(res.isError).toBe(true);
      const text = getResponseText(res);
      expect(text).toContain("PATH_SECURITY_ERROR");
      expect(text).toContain("resolves outside trusted project root");
    });

    it("rejects path traversal in pipeseal_test_sql fixture inputs", async () => {
      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: "SELECT * FROM secret",
          inputs: [
            {
              name: "secret",
              source: "../../../etc/shadow",
              format: "csv",
            },
          ],
          projectRoot,
        },
      });

      expect(res.isError).toBe(true);
      const text = getResponseText(res);
      expect(text).toContain("PATH_SECURITY_ERROR");
    });

    it("rejects paths containing forbidden null bytes", async () => {
      const res = await client.callTool({
        name: "pipeseal_verify",
        arguments: {
          configPath: "examples/basic-csv/\0pipeseal.verify.yml",
          projectRoot,
        },
      });

      expect(res.isError).toBe(true);
      const text = getResponseText(res);
      expect(text).toContain("PATH_SECURITY_ERROR");
      expect(text).toContain("null byte");
    });
  });

  describe("DuckDB Engine Lockdown & In-Process Security", () => {
    it("rejects SQL attempting to read arbitrary host files via read_csv", async () => {
      const forbiddenFile =
        process.platform === "win32"
          ? "C:/Windows/System32/drivers/etc/hosts"
          : "/etc/passwd";

      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: `SELECT * FROM read_csv_auto('${forbiddenFile}')`,
          inputs: [
            {
              name: "dummy",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          projectRoot,
        },
      });

      expect(res.isError).toBe(true);
      const text = getResponseText(res);
      expect(text).toContain("SECURITY_ERROR");
      expect(text).toMatch(/permission error|disabled by configuration|locked/i);
    });

    it("rejects SQL attempting to restore blocked external access via SET", async () => {
      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: "SET enable_external_access = true; SELECT 1",
          inputs: [
            {
              name: "dummy",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          projectRoot,
        },
      });

      expect(res.isError).toBe(true);
      const text = getResponseText(res);
      expect(text).toContain("SECURITY_ERROR");
      expect(text).toMatch(/prohibited|destructive|cannot be changed|locked/i);
    });

    it("rejects SQL attempting to write files to disk via COPY TO", async () => {
      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: "COPY (SELECT 1) TO 'escaped_file.txt'",
          inputs: [
            {
              name: "dummy",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          projectRoot,
        },
      });

      expect(res.isError).toBe(true);
      const text = getResponseText(res);
      expect(text).toContain("SECURITY_ERROR");
      expect(text).toMatch(/prohibited|destructive|permission error|disabled by configuration|locked/i);
    });
  });

  describe("Timeout Enforcement & Native Cancellation", () => {
    it("cancels runaway query when configured timeout is exceeded and returns TIMEOUT_ERROR", async () => {
      // Execute a heavy recursive cartesian query with a 150ms timeout
      const runawaySql =
        "WITH RECURSIVE t AS (SELECT 1 as n UNION ALL SELECT n + 1 FROM t WHERE n < 10000000) SELECT count(*) FROM t, t as t2";

      const startTime = performance.now();
      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: runawaySql,
          inputs: [
            {
              name: "dummy",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          timeoutMs: 150,
          projectRoot,
        },
      });
      const elapsed = performance.now() - startTime;

      expect(res.isError).toBe(true);
      const text = getResponseText(res);
      expect(text).toContain("TIMEOUT_ERROR");
      expect(text).toContain("native execution interrupted");
      // Must have stopped within reasonable bound of timeout (e.g. < 2500ms) rather than running forever
      expect(elapsed).toBeLessThan(2500);
    });
  });

  describe("Host Information & Path Redaction", () => {
    it("redacts absolute local paths from verify tool report output", async () => {
      const res = await client.callTool({
        name: "pipeseal_verify",
        arguments: {
          configPath: "examples/basic-csv/pipeseal.verify.yml",
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");

      // Verify input sources in report are relative safe paths, not absolute paths
      for (const inp of parsed.data.inputs) {
        expect(path.isAbsolute(inp.source)).toBe(false);
        expect(inp.source).not.toContain("C:\\");
        expect(inp.source).not.toContain("Users");
      }
    });
  });

  describe("Privacy-Safe Response Controls & Redaction", () => {
    it("defaults pipeseal_test_sql to omitting raw sample row values for privacy", async () => {
      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: "SELECT id, name, email FROM raw_customers",
          inputs: [
            {
              name: "raw_customers",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");

      // Default must omit sample rows
      expect(parsed.data.sampleRowsOmitted).toBe(true);
      expect(parsed.data.sampleRows).toEqual([]);
      expect(parsed.data.privacyNotice).toBeDefined();
      expect(text).toContain("Raw row samples omitted for privacy");
    });

    it("returns bounded sample rows in pipeseal_test_sql when include_sample_values is explicitly true", async () => {
      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: "SELECT id, name, email FROM raw_customers",
          inputs: [
            {
              name: "raw_customers",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          include_sample_values: true,
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");

      expect(parsed.data.sampleRowsOmitted).toBe(false);
      expect(parsed.data.sampleRows.length).toBeGreaterThan(0);
      expect(parsed.data.sampleRows[0]).toHaveProperty("name");
      expect(parsed.data.sampleRows[0]).toHaveProperty("email");
    });

    it("defaults pipeseal_diff_output to omitting raw discrepancy row values", async () => {
      const res = await client.callTool({
        name: "pipeseal_diff_output",
        arguments: {
          expectedFixture: "examples/basic-csv/fixtures/expected_customers.csv",
          actualSql:
            "SELECT id, 'secret_leaked_value@test.com' AS email, name, created_at FROM raw_customers",
          inputs: [
            {
              name: "raw_customers",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          ordered: false,
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");

      expect(parsed.data.passed).toBe(false);
      expect(parsed.data.sampleValuesOmitted).toBe(true);
      // Raw stringified row JSON should NOT be present in default output
      expect(text).not.toContain("secret_leaked_value@test.com");
      expect(parsed.data.sampleFailures[0]).toContain("omitted for data privacy");
    });

    it("includes raw discrepancy row values in pipeseal_diff_output when include_sample_values is true", async () => {
      const res = await client.callTool({
        name: "pipeseal_diff_output",
        arguments: {
          expectedFixture: "examples/basic-csv/fixtures/expected_customers.csv",
          actualSql:
            "SELECT id, 'inspectable_sample_email@test.com' AS email, name, created_at FROM raw_customers",
          inputs: [
            {
              name: "raw_customers",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          ordered: false,
          include_sample_values: true,
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");

      expect(parsed.data.passed).toBe(false);
      expect(parsed.data.sampleValuesOmitted).toBe(false);
      expect(parsed.data.sampleFailures.join(" ")).toContain("inspectable_sample_email@test.com");
    });
  });
});
