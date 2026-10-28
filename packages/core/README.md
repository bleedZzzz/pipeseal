# @pipeseal/core

> TypeScript-native, deterministic data-pipeline verification runtime built on DuckDB.

`@pipeseal/core` is the core execution engine and software development kit (SDK) of **PipeSeal**. It provides deterministic verification of data transformations and data pipelines in controlled, ephemeral in-memory DuckDB environments (`:memory:`).

---

## Features

- **In-Memory DuckDB Engine:** Powered by `@duckdb/node-api` (DuckDB Node "Neo") for fast startup (<1.5s total process latency) with zero Python requirement.
- **Deterministic Verification Checks:**
  - `schema`: Strict column type normalization and nullability matching.
  - `not_null`: Zero-null assertions with violation detection.
  - `unique`: Uniqueness checks detecting duplicate record groups.
  - `custom_sql`: Expressive SQL predicates asserting `zero_rows` or `has_rows`.
  - `row_count`: Lower and upper bound record constraints (`min`, `max`).
  - `output_match`: Golden record regression comparison using relational multiset `EXCEPT ALL` or positional ordered matching.
- **Machine-Readable Reports:** Structured JSON verification reports containing SHA-256 asset fingerprints, check timings, violation details, and standard exit codes.
- **Engine Lockdown:** Enforces `enable_external_access = false` and `lock_configuration = true`.
- **Native Cancellation:** Actively interrupts runaway queries on timeout expiration via native `duckdb_interrupt`.

---

## Installation

```bash
npm install @pipeseal/core
# or
pnpm add @pipeseal/core
```

### Supported Runtimes

- **Node.js:** v20.x, v22.x, or v24.x LTS.
- **Module System:** Pure ECMAScript Modules (`"type": "module"`).

---

## Quickstart & Usage

### 1. Define a Verification Specification (`pipeseal.verify.yml`)

```yaml
version: "1"
name: "customer_analytics"

inputs:
  - name: "raw_customers"
    source: "fixtures/customers.csv"
    format: "csv"

transformations:
  - name: "cleaned_customers"
    sql: |
      SELECT 
        CAST(id AS BIGINT) AS id,
        TRIM(name) AS name,
        LOWER(TRIM(email)) AS email
      FROM raw_customers

checks:
  - name: "customer_id_not_null"
    type: "not_null"
    targetTable: "cleaned_customers"
    columns: ["id"]

  - name: "customer_id_unique"
    type: "unique"
    targetTable: "cleaned_customers"
    columns: ["id"]

  - name: "customer_row_count"
    type: "row_count"
    targetTable: "cleaned_customers"
    min: 1
    max: 1000000
```

### 2. Programmatic Verification in TypeScript

```typescript
import { verifyPipeline, loadConfigFile } from "@pipeseal/core";

// Option A: Verify from an existing YAML config file
const report = await verifyPipeline("pipeseal.verify.yml");

console.log(`Status: ${report.summary.status}`); // "PASS" | "FAIL"
console.log(`Exit Code: ${report.exit_code}`); // 0 | 1 | 2
console.log(`Total Checks: ${report.summary.total_checks}`);
console.log(`Passed: ${report.summary.passed}`);
console.log(`Failed: ${report.summary.failed}`);

if (report.summary.status === "FAIL") {
  for (const check of report.checks) {
    if (check.status === "fail") {
      console.error(`Check '${check.name}' failed:`, check.details);
    }
  }
}
```

---

## Verification Result Structure

`verifyPipeline()` returns a `VerificationReport` object:

```typescript
interface VerificationReport {
  schema_version: "1.0.0";
  run_id: string;
  timestamp: string;
  duration_ms: number;
  config: {
    name: string;
    fingerprint: string;
  };
  inputs: Array<{
    name: string;
    source: string;
    fingerprint: string;
    row_count: number;
  }>;
  transformations: Array<{
    name: string;
    fingerprint: string;
    duration_ms: number;
    output_row_count: number;
  }>;
  checks: CheckResult[];
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    status: "PASS" | "FAIL";
  };
  limitations: string[];
  exit_code: 0 | 1 | 2;
}
```

---

## Security & Isolation Guardrails

1. **In-Process DuckDB Lockdown:** Ephemeral `:memory:` databases are configured with `enable_external_access = false` and `lock_configuration = true`.
2. **Native Timeout Enforcement:** Running DuckDB queries are bound by configurable timeouts (default: 30s) and actively cancelled via native C++ `duckdb_interrupt(connection)`.
3. **Secret Redaction:** Path sanitizers and heuristic token scrubbers prevent leaking host filesystem paths or tokens in diagnostics.
4. **Boundary Limitation:** In-process DuckDB lockdown is not an operating system sandbox. Untrusted foreign native binaries or arbitrary native extensions must be run inside OS-level container isolation.

---

## License

Apache-2.0. See [LICENSE](./LICENSE) for details.
