# PipeSeal — Test Strategy

> **Version:** 0.1.0-draft
> **Date:** 2026-10-28

---

## 1. Testing Principles

1. **Every check type has its own test.** If PipeSeal ships a schema check, there is a test proving it detects schema violations.
2. **Failure paths are tested.** Every check has at least one test for pass and one for fail.
3. **No mocked execution.** Tests use real DuckDB instances, not mocked query results.
4. **Reports are tested.** The JSON report schema is validated in tests.
5. **The CLI is tested end-to-end.** At least one test runs the actual CLI binary.

---

## 2. Test Framework

- **Runner:** Vitest (fast, TypeScript-native, ESM support)
- **Assertions:** Vitest built-in `expect`
- **Fixtures:** Synthetic CSV/JSON files in `test/fixtures/`
- **Coverage target:** 90% line coverage for `@pipeseal/core`, 80% for CLI

---

## 3. Test Categories

### 3.1 Unit Tests (packages/core)

| Test Target        | What It Verifies                                                                     |
| ------------------ | ------------------------------------------------------------------------------------ |
| Config loader      | Valid YAML parses correctly; invalid YAML throws with clear message                  |
| Config validation  | Zod schema rejects missing fields, wrong types, unknown keys                         |
| Schema check       | Detects correct schema; detects missing column; detects wrong type                   |
| Null check         | Passes on clean data; fails on null values; reports count                            |
| Uniqueness check   | Passes on unique data; fails on duplicates; reports count                            |
| Row count check    | Passes within bounds; fails outside bounds                                           |
| Custom SQL check   | Passes when query returns zero rows; fails when rows exist                           |
| Output comparison  | Passes on matching data; fails on mismatched data; reports differences               |
| Report generator   | Produces valid JSON; includes all required fields; fingerprints are SHA-256          |
| Config fingerprint | Same config produces same fingerprint; changed config produces different fingerprint |

### 3.2 Integration Tests (packages/duckdb)

| Test Target           | What It Verifies                                      |
| --------------------- | ----------------------------------------------------- |
| DuckDB adapter        | Loads CSV, JSON, Parquet files into DuckDB            |
| SQL execution         | Runs SELECT queries; handles errors gracefully        |
| Timeout               | Queries exceeding timeout are cancelled               |
| Memory limit          | Large queries respect memory limits                   |
| Isolation             | Sequential runs do not share state                    |
| Extension blocking    | httpfs and other network extensions are not available |
| File path restriction | Paths outside allowed scope are rejected              |

### 3.3 End-to-End Tests (packages/cli)

| Test Target       | What It Verifies                                                 |
| ----------------- | ---------------------------------------------------------------- |
| `pipeseal verify` | Runs full verification with synthetic data; produces JSON report |
| Exit code 0       | All checks pass → exit 0                                         |
| Exit code 1       | Check failure → exit 1, report includes failures                 |
| Exit code 2       | Config error → exit 2, error on stderr                           |
| `pipeseal init`   | Scaffolds a valid config file                                    |
| JSON output       | stdout is parseable JSON                                         |
| Human output      | stderr contains human-readable summary                           |

### 3.4 Demonstration Test

A single end-to-end test that runs the MVP demonstration:

1. Load synthetic `raw_customers.csv` (100 rows, some with nulls and invalid emails)
2. Execute SQL transformation that cleans the data
3. Run schema, null, uniqueness, row count, and custom SQL checks
4. Assert that the email format check **fails** (deliberately introduced bad data)
5. Assert that the verification report accurately shows 5 passed, 1 failed
6. Assert that the report JSON matches the schema

This test is the acceptance test for the MVP.

---

## 4. Fixture Strategy

All test fixtures are synthetic, deterministic, and committed to the repository.

| Fixture                    | Purpose            | Contents                       |
| -------------------------- | ------------------ | ------------------------------ |
| `valid_customers.csv`      | Happy path testing | 10 clean rows                  |
| `customers_with_nulls.csv` | Null check testing | Rows with null id and name     |
| `customers_with_dupes.csv` | Uniqueness testing | Duplicate id values            |
| `customers_bad_schema.csv` | Schema testing     | Wrong column names/types       |
| `customers_bad_emails.csv` | Custom SQL testing | Invalid email formats          |
| `expected_output.csv`      | Output comparison  | Expected transformation result |
| `valid_config.yml`         | Config loading     | Valid PipeSeal configuration   |
| `invalid_config.yml`       | Config validation  | Missing required fields        |

---

## 5. Implemented CI Pipeline

The automated CI workflow is committed at [`.github/workflows/ci.yml`](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/.github/workflows/ci.yml) and executes on all pushes and pull requests:

- **Matrix:** Operating systems: `ubuntu-latest`, `windows-latest`, `macos-latest`; Node versions: `20.x`, `22.x` (6 matrix combinations).
- **Steps:**
  1. Checkout repository with submodules if any.
  2. Setup pnpm (`pnpm/action-setup@v4`) and Node.js (`actions/setup-node@v4` with pnpm cache).
  3. Install dependencies strictly using committed lockfile (`pnpm install --frozen-lockfile`).
  4. Verify `@duckdb/node-api` native binary load on target platform.
  5. Check formatting (`pnpm run format:check`) and TypeScript types (`pnpm run typecheck`).
  6. Build all workspace packages (`pnpm run build`).
  7. Run complete Vitest suite (all 35 tests).
  8. Run CLI smoke tests verifying exit code 0 on valid pipeline and exit code 0 on `--json` flag producing valid JSON on stdout.

---

## 6. Performance Benchmark Methodology

PipeSeal measures cold execution latency rather than warm cached loops:

- **Sample Size:** $N = 20$ repeated sequential runs.
- **Environment:** Clean Node.js v22.14.0 process invocations on Windows 11 (AMD64).
- **Workload:** Full end-to-end execution of `test/fixtures/valid_config.yml` loading synthetic CSV customer data, executing SQL transformation, running all 6 check types (`schema`, `not_null`, `unique`, `row_count`, `output_match`, and `custom_sql`), sanitizing diagnostics, and emitting versioned JSON.
- **Measured Metrics:**
  - **Cold CLI Process Latency:** Wall-clock time of `node packages/cli/dist/index.js verify <config> --json`.
    - Mean: **525.7 ms** (standard deviation: 26.2 ms)
    - Median: **531.1 ms**
    - Range: 476.2 ms (min) to 587.1 ms (max)
  - **Internal Engine Verification Duration:** In-memory DuckDB init, ingestion, SQL execution, check evaluation, and JSON report generation.
    - Mean: **113.3 ms**
    - Median: **111.0 ms**
    - Range: 104.0 ms (min) to 134.0 ms (max)

---

## 7. What Is NOT in Scope for v0.1.0

- Remote data warehouse adapters (Snowflake, BigQuery, Databricks).
- MCP protocol server implementation.
- Multi-language Python worker sandbox.
- Multi-tenant adversary isolation (in-process DuckDB does not defend against arbitrary hostile native C++ exploits).
