import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPipeSealMcpServer } from "../../packages/mcp/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

describe("PipeSeal MCP — Functional Verification Tools", () => {
  let client: Client;
  let server: ReturnType<typeof createPipeSealMcpServer>;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    server = createPipeSealMcpServer();
    client = new Client(
      { name: "functional-test-client", version: "1.0.0" },
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

  describe("Tool 1: pipeseal_verify", () => {
    it("successfully verifies valid pipeline and returns passing report with exitCode 0", async () => {
      const res = await client.callTool({
        name: "pipeseal_verify",
        arguments: {
          configPath: "examples/basic-csv/pipeseal.verify.yml",
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      expect(text).toContain("PipeSeal verification PASSED");
      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");

      expect(parsed.success).toBe(true);
      expect(parsed.data.status).toBe("PASS");
      expect(parsed.data.exitCode).toBe(0);
      expect(parsed.data.summary.total_checks).toBe(6);
      expect(parsed.data.summary.passed).toBe(6);
      expect(parsed.data.summary.failed).toBe(0);
      expect(parsed.data.checks.length).toBe(6);
    });

    it("truthfully reports failed assertion in failing config without raising a protocol error", async () => {
      // Create a temporary failing config with a null violation in test/fixtures/
      const tempConfigFile = path.join(projectRoot, "test/fixtures/mcp_fail.verify.yml");

      await fs.writeFile(
        tempConfigFile,
        `
version: "1"
name: "mcp-fail-pipeline"
inputs:
  - name: customers
    source: ../../examples/basic-csv/fixtures/customers.csv
    format: csv
transformations:
  - name: broken_transformation
    sql: "SELECT id, NULL as email FROM customers"
checks:
  - type: not_null
    name: "email_not_null"
    target: broken_transformation
    columns: [email]
`,
      );

      try {
        const res = await client.callTool({
          name: "pipeseal_verify",
          arguments: {
            configPath: "test/fixtures/mcp_fail.verify.yml",
            projectRoot,
          },
        });

        // The tool executed properly, so isError is false at protocol level
        expect(res.isError).toBe(false);
        const text = getResponseText(res);
        expect(text).toContain("PipeSeal verification FAILED");

        const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");
        expect(parsed.data.status).toBe("FAIL");
        expect(parsed.data.exitCode).toBe(1);
        expect(parsed.data.summary.failed).toBe(1);

        const failingCheck = parsed.data.checks.find(
          (c: { status: string }) => c.status === "fail",
        );
        expect(failingCheck).toBeDefined();
        expect(failingCheck.diagnostics).toMatch(/column "email" contained.*null/i);
      } finally {
        await fs.rm(tempConfigFile, { force: true });
      }
    });
  });

  describe("Tool 2: pipeseal_test_sql", () => {
    it("evaluates a valid SQL query against declared fixture and returns output row count and duration", async () => {
      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: "SELECT id, UPPER(name) AS upper_name, created_at FROM raw_customers WHERE id >= 104",
          transformationName: "filtered_customers",
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
      expect(text).toContain("SQL test execution PASSED");

      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");
      expect(parsed.success).toBe(true);
      expect(parsed.data.status).toBe("PASS");
      expect(parsed.data.exitCode).toBe(0);
      expect(parsed.data.transformation.name).toBe("filtered_customers");
      expect(parsed.data.transformation.outputRowCount).toBe(2);
      expect(parsed.data.transformation.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("executes assertions on proposed SQL and returns truthful check failure", async () => {
      const res = await client.callTool({
        name: "pipeseal_test_sql",
        arguments: {
          sql: "SELECT id, name FROM raw_customers",
          transformationName: "failing_sql",
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
              name: "expect_at_least_100_rows",
              min: 100,
            },
          ],
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      expect(text).toContain("SQL test execution completed with check FAILURE");

      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");
      expect(parsed.data.status).toBe("FAIL");
      expect(parsed.data.exitCode).toBe(1);
      expect(parsed.data.summary.failed).toBe(1);
    });
  });

  describe("Tool 3: pipeseal_inspect_schema", () => {
    it("inspects schema and row count of a standalone fixture file", async () => {
      const res = await client.callTool({
        name: "pipeseal_inspect_schema",
        arguments: {
          fixturePath: "examples/basic-csv/fixtures/customers.csv",
          fixtureFormat: "csv",
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      expect(text).toContain("Successfully inspected schema");

      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");
      expect(parsed.success).toBe(true);
      expect(parsed.data.target).toBe("fixture");
      expect(parsed.data.rowCount).toBe(5);

      const colNames = parsed.data.columns.map((c: { name: string }) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("email");
      expect(colNames).toContain("name");
      expect(colNames).toContain("created_at");
    });

    it("inspects all table schemas in a pipeline configuration", async () => {
      const res = await client.callTool({
        name: "pipeseal_inspect_schema",
        arguments: {
          configPath: "examples/basic-csv/pipeseal.verify.yml",
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");

      expect(parsed.success).toBe(true);
      expect(parsed.data.tables.length).toBeGreaterThanOrEqual(2);

      const tableNames = parsed.data.tables.map((t: { name: string }) => t.name);
      expect(tableNames).toContain("raw_customers");
      expect(tableNames).toContain("clean_customers");
    });
  });

  describe("Tool 4: pipeseal_diff_output", () => {
    it("confirms MATCH when actual output equals expected fixture", async () => {
      const res = await client.callTool({
        name: "pipeseal_diff_output",
        arguments: {
          configPath: "examples/basic-csv/pipeseal.verify.yml",
          checkName: "golden_record_match",
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      expect(text).toContain("Output comparison MATCH");

      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");
      expect(parsed.success).toBe(true);
      expect(parsed.data.passed).toBe(true);
      expect(parsed.data.status).toBe("pass");
    });

    it("detects and reports missing and extra rows with multiset semantics", async () => {
      const res = await client.callTool({
        name: "pipeseal_diff_output",
        arguments: {
          expectedFixture: "examples/basic-csv/fixtures/expected_customers.csv",
          actualSql:
            "SELECT id, 'different_email@example.com' AS email, name, created_at FROM raw_customers",
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
      expect(text).toContain("Output comparison MISMATCH");

      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");
      expect(parsed.data.passed).toBe(false);
      expect(parsed.data.status).toBe("fail");
      expect(parsed.data.details.missingCount).toBeGreaterThan(0);
      expect(parsed.data.details.extraCount).toBeGreaterThan(0);
      expect(parsed.data.sampleFailures.length).toBeGreaterThan(0);
    });

    it("detects ordered positional mismatch when ordered: true", async () => {
      const res = await client.callTool({
        name: "pipeseal_diff_output",
        arguments: {
          expectedFixture: "examples/basic-csv/fixtures/expected_customers.csv",
          // Actual SQL alters row values so sorted order differs
          actualSql:
            "SELECT (CASE WHEN id = 101 THEN 999 ELSE id END) AS id, LOWER(TRIM(email)) AS email, COALESCE(name, 'Anonymous') AS name, created_at FROM raw_customers WHERE id IS NOT NULL",
          inputs: [
            {
              name: "raw_customers",
              source: "examples/basic-csv/fixtures/customers.csv",
              format: "csv",
            },
          ],
          ordered: true,
          orderBy: ["id ASC"],
          projectRoot,
        },
      });

      expect(res.isError).toBe(false);
      const text = getResponseText(res);
      expect(text).toContain("Output comparison MISMATCH");

      const parsed = JSON.parse(text.split("\n\n")[1] ?? "{}");
      expect(parsed.data.passed).toBe(false);
      expect(parsed.data.details.ordered).toBe(true);
      expect(parsed.data.details.mismatchRowIndex).toBeDefined();
    });
  });
});
