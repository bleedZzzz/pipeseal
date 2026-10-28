import { Command } from "commander";
import pc from "picocolors";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyPipeline, PipeSealError } from "@pipeseal/core";
import { formatHumanReport } from "./formatter.js";

export const program = new Command();

program
  .name("pipeseal")
  .description(
    "TypeScript-native, deterministic data-pipeline verification runtime",
  )
  .version("0.2.0");

program
  .command("verify")
  .description(
    "Execute verification run against declared configuration and fixtures",
  )
  .argument(
    "<config>",
    "Path to PipeSeal configuration file (.yml, .yaml, or .json)",
  )
  .option(
    "-j, --json",
    "Output machine-readable JSON verification report to stdout",
    false,
  )
  .option(
    "-t, --timeout <ms>",
    "Override query execution timeout in milliseconds",
  )
  .action(
    async (
      configPath: string,
      options: { json: boolean; timeout?: string },
    ) => {
      try {
        const timeoutMs = options.timeout
          ? parseInt(options.timeout, 10)
          : undefined;
        const report = await verifyPipeline(configPath, {
          engineOptions: {
            defaultTimeoutMs: timeoutMs,
          },
        });

        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        } else {
          process.stdout.write(formatHumanReport(report));
        }

        process.exit(report.exit_code);
      } catch (err) {
        if (options.json) {
          const errorJson = {
            schema_version: "1.0.0",
            status: "ERROR",
            exit_code: 2,
            error: {
              message: err instanceof Error ? err.message : String(err),
              category:
                err instanceof PipeSealError ? err.category : "RUNTIME_ERROR",
            },
          };
          process.stdout.write(JSON.stringify(errorJson, null, 2) + "\n");
        } else {
          const prefix =
            err instanceof PipeSealError ? `[${err.category}] ` : "";
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `\n${pc.bold(pc.red("Error:"))} ${prefix}${msg}\n\n`,
          );
        }
        process.exit(2);
      }
    },
  );

program
  .command("init")
  .description("Scaffold a starter PipeSeal configuration and sample fixture")
  .option("-d, --dir <path>", "Directory to initialize in", ".")
  .action(async (options: { dir: string }) => {
    try {
      const targetDir = resolve(process.cwd(), options.dir);
      const fixturesDir = resolve(targetDir, "fixtures");
      await mkdir(fixturesDir, { recursive: true });

      const sampleConfig = `version: "1"
name: "customer-pipeline-verification"

inputs:
  - name: raw_customers
    source: ./fixtures/customers.csv
    format: csv

transformations:
  - name: clean_customers
    sql: |
      SELECT
        id,
        LOWER(TRIM(email)) AS email,
        COALESCE(name, 'Anonymous') AS name,
        created_at
      FROM raw_customers
      WHERE id IS NOT NULL

checks:
  - type: schema
    name: "verify_clean_schema"
    expect:
      columns:
        - name: id
          type: INTEGER
          nullable: false
        - name: email
          type: VARCHAR
        - name: name
          type: VARCHAR
          nullable: false
        - name: created_at
          type: TIMESTAMP

  - type: not_null
    name: "id_and_name_required"
    columns: [id, name]

  - type: unique
    name: "unique_customer_id"
    columns: [id]

  - type: custom_sql
    name: "valid_email_syntax"
    sql: |
      SELECT * FROM clean_customers
      WHERE email NOT LIKE '%@%'
    expect: zero_rows
`;

      const sampleCsv = `id,name,email,created_at
101,Alice Smith,alice@example.com,2026-01-15 08:30:00
102,Bob Jones,bob@example.com,2026-02-01 11:20:00
103,,carol@example.com,2026-02-14 15:45:00
104,David Wilson,david@domain.org,2026-03-01 09:10:00
`;

      await writeFile(
        resolve(targetDir, "pipeseal.verify.yml"),
        sampleConfig,
        "utf8",
      );
      await writeFile(resolve(fixturesDir, "customers.csv"), sampleCsv, "utf8");

      process.stdout.write(
        `\n${pc.green("✔")} Initialized PipeSeal configuration in ${pc.cyan(targetDir)}\n` +
          `  Created: ${pc.bold("pipeseal.verify.yml")}\n` +
          `  Created: ${pc.bold("fixtures/customers.csv")}\n\n` +
          `To run verification:\n` +
          `  ${pc.cyan("pipeseal verify pipeseal.verify.yml")}\n\n`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\n${pc.red("Failed to initialize:")} ${msg}\n`);
      process.exit(2);
    }
  });

program.parse(process.argv);
