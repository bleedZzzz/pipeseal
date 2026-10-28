<div align="center">

# 🦭 PipeSeal

**Deterministic SQL transformation verification runtime for data pipelines & AI agents.**  
*Ephemeral in-memory sandbox · Cryptographic evidence reports · Zero Python overhead.*

<br/>

[![npm: pipeseal](https://img.shields.io/npm/v/pipeseal.svg?color=2563EB&label=pipeseal%20(cli)&logo=npm)](https://www.npmjs.com/package/pipeseal)
[![npm: @pipeseal/core](https://img.shields.io/npm/v/@pipeseal/core.svg?color=059669&label=@pipeseal/core&logo=npm)](https://www.npmjs.com/package/@pipeseal/core)
[![npm: @pipeseal/mcp](https://img.shields.io/npm/v/@pipeseal/mcp.svg?color=7C3AED&label=@pipeseal/mcp&logo=npm)](https://www.npmjs.com/package/@pipeseal/mcp)
[![CI Status](https://github.com/bleedZzzz/pipeseal/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bleedZzzz/pipeseal/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE)
[![Engine: DuckDB](https://img.shields.io/badge/engine-DuckDB%20Neo-yellow.svg)](https://duckdb.org/)
[![Node: >=20.0.0](https://img.shields.io/badge/node-%3E%3D20.0.0-black.svg?logo=node.js)](https://nodejs.org/)

<br/>

</div>

```text
 ┌──────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────────────┐
 │  Synthetic Fixtures  │      │  Target SQL Model       │      │  Deterministic Checks           │
 │  • customers.csv     │ ───▶ │  SELECT id, email, ...  │ ───▶ │  ✔ Schema Contract & Nullability│
 │  • orders.parquet    │      │  FROM raw_customers;    │      │  ✔ Primary & Composite Key Uniq │
 └──────────────────────┘      └─────────────────────────┘      │  ✔ Relational Bag Output Match  │
                                            │                   │  ✔ Custom SQL Assertion Bounds  │
                                            ▼                   └─────────────────────────────────┘
                               ┌─────────────────────────┐                       │
                               │  DuckDB Ephemeral Box   │                       ▼
                               │  enable_ext_access=off  │            ┌─────────────────────┐
                               │  in-memory (:memory:)   │            │ SHA-256 JSON Report │
                               └─────────────────────────┘            │ Gated CI & Agent MR │
                                                                      └─────────────────────┘
```

---

## ⚡ What is PipeSeal?

PipeSeal is an open-source verification engine built specifically for modern data stacks. Unlike orchestration runners (Airflow, Dagster) or transformation frameworks (dbt, SQLMesh) that couple model execution with data warehousing, PipeSeal is a **deterministic truth gate**:

- **Ephemeral Execution Sandbox:** Spins up an isolated in-memory DuckDB instance (`@duckdb/node-api`) per run to execute target SQL transformations against declared synthetic fixtures.
- **Deterministic Assertions:** Evaluates schema contracts, nullability, composite uniqueness, row count bounds, custom SQL predicates, and relational multiset bag equality with zero ambiguity.
- **Cryptographic Machine Evidence:** Produces versioned, SHA-256 fingerprinted JSON reports (`schema_version: "1.0.0"`) that CI pipelines and AI coding agents can consume to gate merges.
- **Strict Engine Security:** Hardens execution by locking database-level filesystem and external network access (`enable_external_access = false`, `lock_configuration = true`).

---

## 🚀 Quickstart

### 1. Run via CLI (Zero Installation)

Verify any transformation pipeline immediately using `npx`:

```bash
# Verify pipeline with formatted human terminal output
npx pipeseal verify pipeseal.verify.yml

# Output machine-readable JSON evidence to stdout for CI gating
npx pipeseal verify pipeseal.verify.yml --json
```

```text
✔ [1/6] schema: verify_clean_schema ......................... PASS (2ms)
✔ [2/6] not_null: id_and_name_required ...................... PASS (1ms)
✔ [3/6] unique: unique_customer_id .......................... PASS (2ms)
✔ [4/6] custom_sql: valid_email_syntax ...................... PASS (3ms)
✔ [5/6] row_count: row_count_guard .......................... PASS (1ms)
✔ [6/6] output_match: golden_record_match ................... PASS (5ms)
─────────────────────────────────────────────────────────────────────────
Status: PASS · 6 checks passed, 0 failed in 18ms
Fingerprint: SHA-256: 4f8b2d...91e0 · Schema: 1.0.0
```

#### CLI Exit Codes
- `0`: All verification checks passed (`status: PASS`).
- `1`: One or more verification checks failed (`status: FAIL`).
- `2`: Configuration error, invalid YAML, or security escape attempt (`status: ERROR`).

---

### 2. Configure for AI Coding Agents (MCP)

PipeSeal exposes a native **Model Context Protocol (MCP)** server (`@pipeseal/mcp`) running over `stdio`. AI coding agents (Google Antigravity, Claude Code, Cursor, Windsurf) can interactively verify SQL models, inspect catalogs, and diagnose diffs in their active loop.

Add PipeSeal to your agent's MCP configuration (`mcp_config.json`):

```json
{
  "mcpServers": {
    "pipeseal": {
      "command": "npx",
      "args": ["-y", "@pipeseal/mcp", "--project-root", "."]
    }
  }
}
```

#### Available Agent Tools

| Tool | Purpose | Core Engine Capability |
| :--- | :--- | :--- |
| `pipeseal_verify` | Execute full pipeline verification against `pipeseal.verify.yml` and return structured evidence. | Ephemeral execution & full report generation |
| `pipeseal_test_sql` | Safely test candidate SQL transformations against synthetic fixture tables. | Sandboxed DuckDB query execution |
| `pipeseal_inspect_schema` | Inspect column names and normalized SQL data types without leaking raw data. | Catalog inspection (`information_schema`) |
| `pipeseal_diff_output` | Diagnose failing `output_match` checks (missing rows, extra rows, position diffs). | Multiset relational diff engine |

*Privacy note: MCP tools omit raw row values by default (`include_sample_values: false`) to safeguard sensitive customer data.*

---

### 3. Programmatic TypeScript SDK

Integrate pipeline verification directly into test runners (Vitest, Jest) or custom node services:

```bash
npm install @pipeseal/core
```

```typescript
import { verifyPipeline } from "@pipeseal/core";

const report = await verifyPipeline({
  configPath: "pipeseal.verify.yml",
  projectRoot: process.cwd()
});

if (report.summary.status !== "PASS") {
  console.error("Pipeline verification failed:", report.summary.failed_checks);
  process.exit(1);
}

console.log(`Verified in ${report.summary.duration_ms}ms · Fingerprint: ${report.summary.fingerprint}`);
```

---

## 📋 Declarative Configuration (`pipeseal.verify.yml`)

```yaml
version: "1"
name: "customer-pipeline-verification"

# 1. Declare synthetic input fixtures
inputs:
  - name: raw_customers
    source: ./fixtures/customers.csv
    format: csv

# 2. Declare SQL transformations to verify
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

# 3. Declare deterministic verification checks
checks:
  - type: schema
    name: "verify_clean_schema"
    expect:
      columns:
        - name: id
          type: BIGINT
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

  - type: row_count
    name: "row_count_guard"
    min: 1
    max: 100

  - type: output_match
    name: "golden_record_match"
    expected: ./fixtures/expected_customers.csv
    ordered: false  # Relational multiset bag equality via SQL EXCEPT ALL
```

---

## 🔍 Verification Check Catalog

| Check Type | Description | Key Options |
|---|---|---|
| `schema` | Validates column existence, normalized type equivalence (e.g. `BIGINT` vs `INT8`), and nullability constraints. | `expect.columns`: `[{ name, type, nullable? }]` |
| `not_null` | Asserts designated columns have zero nulls; collects failure count and sanitized diagnostic samples. | `columns`: `[col1, col2, ...]` |
| `unique` | Asserts primary or composite key columns contain no duplicate groupings. | `columns`: `[col1, col2, ...]` |
| `custom_sql` | Evaluates arbitrary SQL predicates against in-memory transformation tables. | `sql`, `expect`: `'zero_rows' \| 'has_rows'` |
| `row_count` | Enforces inclusive lower and/or upper bounds on transformation row counts. | `min?`: integer, `max?`: integer |
| `output_match` | Compares actual transformation output against an expected CSV fixture. | `expected`: path, `ordered?`: boolean, `compare?`: string[] |

### Output Comparison Semantics (`output_match`)
- **Order-Independent Bag Equality (Default, `ordered: false`):** Evaluates relational multiset equality using SQL `EXCEPT ALL`. Rows can appear in any order, but duplicates must match exactly.
- **Ordered Comparison (`ordered: true`):** Position-by-position comparison detecting the exact row index of any discrepancy.
- **NULL Relational Equality:** NULL values evaluate with relational equality (`NULL === NULL`).
- **Sanitized Diagnostics:** Mismatches report exact missing and extra row counts without leaking credentials or uncontrolled payloads.

---

## 🛡️ Security & Sandbox Architecture

1. **In-Memory Isolation:** DuckDB instances run strictly in `:memory:` with zero persistent disk footprint.
2. **Configuration Lockdown:** Database-level security locks down foreign filesystem traversal and network socket access (`enable_external_access = false`, `lock_configuration = true`).
3. **Destructive SQL Guards:** Reject or isolate arbitrary `ATTACH`, file writes (`COPY TO`), and filesystem escape attempts.
4. **Secret Redaction:** Environment variables, database connection strings, and credential patterns are scrubbed from CLI outputs and JSON evidence.
5. **Configurable Timeouts:** Every execution step is bound by a configurable timeout (default 30s) to prevent resource exhaustion.

---

## 📚 Documentation Index

- 📄 [Architecture Specification](docs/ARCHITECTURE.md) — Package layout, lifecycle interfaces, and DuckDB runner design.
- 🤖 [Model Context Protocol (MCP) Guide](docs/MCP.md) — Protocol schema, agent client configuration, and security options.
- 🔒 [Threat Model & Security Boundary](docs/THREAT-MODEL.md) — Trust boundaries, attack vectors, and mitigations.
- 🧪 [Test Strategy & Fixtures](docs/TEST-STRATEGY.md) — Test pyramid, automated suites, and failure injection testing.
- 🗺️ [Product Roadmap](docs/ROADMAP.md) — Milestone roadmap (v0.1.0 MVP through v1.0.0 Enterprise).
- 📜 [Architecture Decision Records (ADRs)](docs/decisions) — ADR-001 through ADR-005.
- 🤝 [Contributing Guidelines](docs/CONTRIBUTING.md) — Monorepo setup, development commands, and pull request workflow.

---

## 📄 License

PipeSeal is licensed under the [Apache License 2.0](LICENSE).
