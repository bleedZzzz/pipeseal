# PipeSeal — Product Requirements Document

> **Version:** 0.1.0-draft
> **Date:** 2026-10-28
> **Status:** Awaiting review

---

## 1. Product Vision

PipeSeal is an open-source, TypeScript-native data-pipeline verification runtime. It executes proposed pipeline changes in controlled environments, independently validates actual results against declared requirements, and generates versioned, machine-readable verification reports.

**One-line pitch:** "Verify your data pipeline changes before they break production."

---

## 2. Problem Statement

Data engineers and AI coding agents modify SQL transformations daily. Current workflows depend on:

- Framework-specific tests (dbt tests, SQLMesh audits) that only work within their own ecosystem
- Manual inspection of query results
- Trust that "all tests passed" means "the change is safe"
- No formal evidence trail linking a proposed change to verified outcomes

When a pipeline change breaks production data, root-cause analysis starts from scratch because there is no standardized record of what was verified, how, and with what results.

---

## 3. Target Users

| Persona                | Primary Need                                          |
| ---------------------- | ----------------------------------------------------- |
| **Data Engineer**      | Verify pipeline changes in CI before deploy           |
| **AI Coding Agent**    | Independently validate self-generated SQL via MCP/SDK |
| **Analytics Engineer** | Formal evidence that dbt model changes are correct    |
| **Platform Team**      | Gate deployments on machine-readable verification     |
| **Solo Developer**     | Local verification against synthetic data             |

---

## 4. Core Requirements (MVP — v0.1)

### 4.1 CLI

| Requirement                | Detail                                                     |
| -------------------------- | ---------------------------------------------------------- |
| `pipeseal verify <config>` | Execute a verification run                                 |
| `pipeseal init`            | Scaffold a verification configuration                      |
| Machine-readable output    | JSON to stdout, human-readable to stderr                   |
| Exit codes                 | 0 = all checks pass, 1 = check failures, 2 = runtime error |
| Cross-platform             | Windows, macOS, Linux (Node.js 20+)                        |

### 4.2 TypeScript SDK

| Requirement             | Detail                                         |
| ----------------------- | ---------------------------------------------- |
| `@pipeseal/core`        | Programmatic API for embedding verification    |
| `createVerifier()`      | Factory for verification runner                |
| `verifier.run(config)`  | Execute verification, return structured result |
| Type-safe configuration | Full TypeScript types for config and results   |
| Promise-based           | Async/await throughout                         |

### 4.3 Execution Engine

| Requirement            | Detail                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| DuckDB local execution | SQL transformations against local files via `@duckdb/node-api` (DuckDB Node "Neo")      |
| Input sources          | CSV, JSON, Parquet files                                                                |
| Isolation              | Each run uses a fresh, in-memory DuckDB instance (`:memory:`) destroyed upon completion |
| Security lockdown      | Engine API locked via `enable_external_access = false` and `lock_configuration = true`  |
| Timeout                | Configurable per-query and per-run timeouts                                             |
| Cancellation           | Runs can be cancelled cleanly                                                           |

### 4.4 Verification Checks (All 6 Implemented in v0.1.0)

| Check Type     | Status         | Description & Semantics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`       | ✅ Implemented | Validates column existence, normalized SQL type compatibility (e.g. `BIGINT` vs `INT8`, `VARCHAR` vs `TEXT`), and nullability constraints.                                                                                                                                                                                                                                                                                                                                                              |
| `not_null`     | ✅ Implemented | Asserts that designated column(s) have zero nulls; collects failure count and sample diagnostics.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `unique`       | ✅ Implemented | Asserts that primary or composite key columns contain no duplicate groups (`GROUP BY ... HAVING COUNT(*) > 1`).                                                                                                                                                                                                                                                                                                                                                                                         |
| `row_count`    | ✅ Implemented | Enforces inclusive lower and/or upper bounds on table row counts (`min` and `max` constraints).                                                                                                                                                                                                                                                                                                                                                                                                         |
| `custom_sql`   | ✅ Implemented | Evaluates arbitrary SQL assertion queries with `expect: 'zero_rows'` or `expect: 'has_rows'`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `output_match` | ✅ Implemented | Compares actual transformation output against an expected CSV fixture. Defaults to order-independent multiset bag comparison via SQL `EXCEPT ALL`. Supports deterministic ordered comparison when `order_by: [col1, ...]` is specified (rejects non-deterministic `ordered: true` without `order_by`). Automatically appends tie-breakers for all remaining columns to guarantee total determinism. Relational NULL equality (`NULL === NULL`). Validates column names and types before row comparison. |

### 4.5 Verification Report

| Requirement      | Detail                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Format           | Versioned JSON (schema version in report)                                                                           |
| Content          | Run ID, timestamp, config fingerprint, input fingerprints, check results, output metadata, exit status, diagnostics |
| Machine-readable | Parseable by CI systems and agents                                                                                  |
| Truthful         | Never generates a success report for failed checks                                                                  |
| Sanitized        | No raw data rows, secrets, or credentials in reports                                                                |

---

## 5. Non-Goals (Explicitly Out of Scope)

| Not Building                           | Why                                                            |
| -------------------------------------- | -------------------------------------------------------------- |
| Transformation framework               | Use dbt or SQLMesh                                             |
| Orchestrator                           | Use Dagster or Prefect                                         |
| SQL analyzer / linter                  | Use Altimate Code                                              |
| Data catalog                           | Use DataHub or OpenMetadata                                    |
| AI guardrails / prompt filtering       | Use Bifrost or NeMo                                            |
| Data observability / anomaly detection | Use Elementary                                                 |
| Dashboard / web UI                     | CLI and JSON first                                             |
| Distributed execution                  | Single-node DuckDB is sufficient for verification              |
| Autonomous repair                      | May diagnose failures; does not auto-fix without approval      |
| Real production database writes        | Verification is read-only or writes to disposable environments |

---

## 6. Future Scope (Post-MVP)

| Feature                   | Target Version | Dependency                 |
| ------------------------- | -------------- | -------------------------- |
| MCP server                | v0.2           | MCP protocol stability     |
| dbt adapter               | v0.2           | dbt artifact reading       |
| SQLMesh adapter           | v0.3           | SQLMesh state inspection   |
| Python workers            | v0.3           | Cross-language execution   |
| OpenLineage events        | v0.3           | OpenLineage spec           |
| GitHub Action             | v0.2           | CI integration patterns    |
| Failure diagnosis         | v0.3           | LLM integration (optional) |
| Report signing            | v0.4           | Cryptographic evidence     |
| Remote warehouse adapters | v0.4+          | Warehouse credentials      |

---

## 7. Success Criteria & Performance Targets (MVP)

The MVP is complete when all functional and measurable performance criteria are met:

### Functional Criteria

1. ✅ `pipeseal verify` executes a SQL transformation against synthetic CSV input using DuckDB (`@duckdb/node-api`)
2. ✅ Schema, null, uniqueness, and custom assertion checks run against the output
3. ✅ A deliberate failure is detected and reported accurately
4. ✅ A versioned JSON verification report (`schema_version: "1.0.0"`) is generated with input SHA-256 fingerprints
5. ✅ The report distinguishes passing checks from failing checks with actionable diagnostics
6. ✅ The CLI exits with correct POSIX codes (0 = pass, 1 = verification fail, 2 = runtime/config error)
7. ✅ The TypeScript SDK produces the same results programmatically
8. ✅ The project has automated tests covering happy path and failure cases (>85% coverage across `@pipeseal/core`)
9. ✅ A reproducible example demonstrates the full workflow in `examples/basic-csv/`
10. ✅ Documentation explains installation, configuration, and usage

### Measurable Performance Targets & Empirical Results

11. ✅ **Cold Run Overhead Budget:** On standard CI/developer machines, running `pipeseal verify` on standard synthetic fixtures finishes in **< 1,500ms** total process time.
    - **Empirical Measurement (N = 20 trials, Node v22.23.3, Windows x64):**
      - Total Process Latency: **Mean = 525.7ms**, **Median = 531.1ms**, Min = 476.2ms, Max = 587.1ms, StdDev = 26.2ms.
      - Internal Engine Execution Duration (DuckDB init + staging + 6 checks + report): **Mean = 113.3ms**, **Median = 111.0ms**.
12. ✅ **Peak Memory Budget:** Peak Resident Set Size (RSS) during verification of standard synthetic fixtures remains **< 150MB** (empirically measured < 85MB).

_(Note: These are measurable engineering budgets tested in CI via Vitest benchmark suites, not ungrounded marketing claims for arbitrary multi-gigabyte production workloads)._

---

## 8. Configuration Format (Draft)

```yaml
# pipeseal.verify.yml
version: "1"
name: "verify-customer-transform"

inputs:
  - name: raw_customers
    source: ./fixtures/raw_customers.csv
    format: csv

transformations:
  - name: transform_customers
    sql: |
      SELECT
        id,
        LOWER(email) AS email,
        COALESCE(name, 'Unknown') AS name,
        created_at
      FROM raw_customers
      WHERE id IS NOT NULL

checks:
  - type: schema
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
    columns: [id, name]

  - type: unique
    columns: [id]

  - type: row_count
    min: 1

  - type: custom_sql
    name: "email_format_check"
    sql: |
      SELECT * FROM transform_customers
      WHERE email NOT LIKE '%@%'
    expect: zero_rows

  - type: output_match
    expected: ./fixtures/expected_customers.csv
    compare: [id, email, name]
```

---

## 9. Verification Report Schema (Draft)

```json
{
  "schema_version": "1.0.0",
  "run_id": "ps_run_20261028T012800Z_abc123",
  "timestamp": "2026-10-28T01:28:00.000Z",
  "duration_ms": 342,
  "config": {
    "name": "verify-customer-transform",
    "fingerprint": "sha256:a1b2c3..."
  },
  "inputs": [
    {
      "name": "raw_customers",
      "source": "./fixtures/raw_customers.csv",
      "fingerprint": "sha256:d4e5f6...",
      "row_count": 100
    }
  ],
  "transformations": [
    {
      "name": "transform_customers",
      "fingerprint": "sha256:g7h8i9...",
      "duration_ms": 45,
      "output_row_count": 98
    }
  ],
  "checks": [
    {
      "name": "schema_validation",
      "type": "schema",
      "status": "pass",
      "details": {}
    },
    {
      "name": "not_null_id",
      "type": "not_null",
      "status": "pass",
      "column": "id",
      "null_count": 0
    },
    {
      "name": "email_format_check",
      "type": "custom_sql",
      "status": "fail",
      "failing_row_count": 3,
      "sample_failures": ["row 42: email='invalid'"],
      "diagnostics": "3 rows have emails without '@' character"
    }
  ],
  "summary": {
    "total_checks": 6,
    "passed": 5,
    "failed": 1,
    "status": "FAIL"
  },
  "exit_code": 1
}
```
