# PipeSeal — Project Memory & Institutional Knowledge

> **Project:** PipeSeal (`@pipeseal/core`, `pipeseal`)  
> **Last Updated:** 2026-10-28  
> **Current Version:** v0.1.0 Released (GitHub Tag [`v0.1.0`](https://github.com/bleedZzzz/pipeseal/releases/tag/v0.1.0))  
> **Next Milestone:** v0.2.0 (MCP Agent Integration)  
> **Primary Documentation:** [`docs/`](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs)

---

## 1. Project Mission & Identity

### What PipeSeal Is
PipeSeal is a lightweight, TypeScript-native verification engine for data pipelines and SQL transformations. It executes transformations in controlled, isolated DuckDB in-memory environments against synthetic fixtures, evaluates deterministic assertions, and produces machine-readable evidence reports for CI/CD pipelines and AI coding agents.

### What PipeSeal Is NOT (Key Differentiators & Non-Goals)
- **Not an Orchestrator:** Does not schedule, trigger, or coordinate DAG workflows (unlike Dagster, Airflow, Prefect).
- **Not a Transformation Framework:** Does not author production pipelines or compile Jinja models (unlike dbt, SQLMesh).
- **Not a SQL Linter/Analyzer:** Does not perform static text/AST analysis without data (unlike SQLFluff or Altimate Code).
- **Not Production Data Observability:** Does not monitor live data warehouses in production (unlike Elementary, Monte Carlo).
- **Core Thesis:** AI coding agents and developers can author and modify data transformations, but PipeSeal independently and deterministically verifies whether those transformations satisfy explicit contracts and produce expected results before deployment.

---

## 2. Release & Baseline State (v0.1.0)

| Attribute | State | Notes |
|---|---|---|
| **Git Tag** | [`v0.1.0`](https://github.com/bleedZzzz/pipeseal/releases/tag/v0.1.0) | Pushed to `origin` |
| **Release Commit** | [`ccfcdef`](https://github.com/bleedZzzz/pipeseal/commit/ccfcdef874788c940f0eba355ce1b52a7818f96d) | Clean working tree on `main` |
| **GitHub Release** | Published | Includes release notes, smoke test logs, and limitations |
| **Local Test Suite** | 39 / 39 Passing | Vitest (`unit`, `integration`, `security`) |
| **Remote CI (GitHub Actions)** | 7 / 7 Jobs Passing | [Run 40590755601](https://github.com/bleedZzzz/pipeseal/actions/runs/40590755601) across Linux, macOS, and Windows |
| **Supported Node.js** | 22 LTS, 24 LTS, 26 | Node.js 20 is end-of-life and excluded from active matrix |
| **Tarball Smoke Test** | Verified | Packed `.tgz` installed and run in standalone project outside workspace |
| **NPM Registry Status** | Scope unclaimed / Unpublished | Requires maintainer auth (`npm login`) with `@pipeseal` scope |

---

## 3. Repository Architecture & Layout

PipeSeal is organized as a pnpm workspace monorepo:

```text
pipeseal/
├── .agents/
│   └── rules/                  # Project-specific coding and security rules
├── .github/
│   └── workflows/ci.yml        # Multi-platform (Linux/macOS/Win) Node 22/24/26 matrix
├── docs/                       # Authoritative specs (PRD, Architecture, Threat Model, Roadmap, ADRs)
├── examples/                   # Reproducible demonstration fixtures (basic-csv)
├── packages/
│   ├── core/                   # @pipeseal/core (Verification Engine & SDK)
│   │   ├── src/
│   │   │   ├── checks/         # schema, not_null, unique, custom_sql, row_count, output_match
│   │   │   ├── engine/         # DuckDB execution runtime, isolation, native interrupt
│   │   │   ├── parser/         # YAML config parser & Zod validation
│   │   │   ├── report/         # Versioned JSON evidence report builder
│   │   │   └── types/          # Strict TypeScript contract definitions
│   │   └── dist/               # Built ESM bundle + type declarations
│   └── cli/                    # pipeseal (CLI Tool)
│       ├── src/
│       │   ├── commands/       # verify.ts, init.ts
│       │   └── formatters/     # Terminal output renderer (picocolors)
│       └── dist/               # Built CLI executable (bin: pipeseal)
├── test/                       # Global integration & end-to-end tests
├── AGENTS.md                   # Agent guidelines and mission standards
├── MEMORY.md                   # This project memory file
├── pnpm-workspace.yaml         # Monorepo package declaration
└── vitest.config.ts            # Test runner configuration
```

---

## 4. Institutional Knowledge & Technical Decisions

### 1. DuckDB Node API Selection (ADR-002)
- **Decision:** PipeSeal uses `@duckdb/node-api` (v2.0.0-r.1 / DuckDB Node "Neo"), **NOT** the legacy callback-based `duckdb` package.
- **Rationale:** The legacy package is deprecated, poorly typed, and lacks modern async/await and native cancellation primitives. `@duckdb/node-api` provides direct C++ bindings with promise-native execution.

### 2. Execution Timeout & Native Cancellation
- **Gotcha:** Standard `Promise.race()` merely resolves the JavaScript promise early; it does **not** stop native C++ threads in DuckDB from continuing to consume CPU and memory.
- **Solution:** PipeSeal binds execution using native `DuckDBConnection.prototype.interrupt()`, which directly calls `duckdb_interrupt(connection)` in the underlying engine. On timeout expiration, running queries are actively aborted and release system resources.

### 3. Engine Isolation & Threat Model Boundaries (ADR-003)
- **Safety Lockdown:** DuckDB connections run strictly on `:memory:` with:
  ```sql
  SET enable_external_access = false;
  SET lock_configuration = true;
  ```
- **Boundary Reality:** In-process DuckDB configuration guards against unauthorized SQL file/network operations, but it is **not** an operating-system sandbox. Untrusted third-party pipeline code requires external process/container isolation.
- **Secret Redaction:** Connection strings, passwords, and environment variables are strictly redacted from diagnostic logs and JSON evidence reports.

### 4. Output Comparison Semantics (`output_match`)
- **Default (Order-Independent Multiset / Bag Equality):** Evaluated via SQL `EXCEPT ALL`. Row order does not matter, but duplicates must match exactly (e.g. 2 copies of row A in actual requires 2 copies in expected).
- **Ordered Comparison (`ordered: true`):** Compares rows position-by-position, pinpointing the first mismatched row index and column discrepancy.
- **NULL Handling:** Relational equality (`NULL === NULL`).
- **Schema Pre-Validation:** Validates column names and compatible types before comparing row data.

### 5. Monorepo CI & Build Ordering Gotchas
- **Build Before Typecheck:** `packages/cli` imports types from `@pipeseal/core/dist`. Running `tsc --noEmit` before `pnpm run build` causes type errors on fresh checkouts. CI is configured to run build before typecheck.
- **Windows CRLF vs Prettier:** Windows runners checkout CRLF by default. PipeSeal enforces `.prettierrc` (`"endOfLine": "auto"`) and `.gitattributes` (`* text=auto eol=lf`) to prevent formatting check failures across operating systems.

---

## 5. Verification Checks Summary (v0.1.0)

| Check Name | Target | Key Logic / Options |
|---|---|---|
| `schema` | Table structure | Normalizes types (e.g. `BIGINT` vs `INT8`), verifies column presence and nullability. |
| `not_null` | Column nulls | Evaluates `COUNT(*) WHERE col IS NULL`; collects failing row counts and samples. |
| `unique` | Key uniqueness | Evaluates `GROUP BY cols HAVING COUNT(*) > 1`; supports single or composite keys. |
| `custom_sql` | Arbitrary SQL | Runs user-defined SQL predicate expecting either `zero_rows` or `has_rows`. |
| `row_count` | Table cardinality | Inclusive bounds: `min` (optional), `max` (optional). |
| `output_match` | Golden record | Compares output against CSV fixture using multiset bag equality or positional order. |

---

## 6. Next Milestone: v0.2.0 (MCP Agent Integration)

### Core Objective
Allow AI coding agents (such as Antigravity) to autonomously verify data pipelines through standard Model Context Protocol (MCP) tools.

### Key Principles
1. **Interface, Not Rewrite:** MCP is a communication layer on top of `@pipeseal/core`. It reuses the exact same execution engine, security rules, and assertion logic.
2. **Planned MCP Tools:**
   - `pipeseal_verify`: Execute full pipeline verification against a `pipeseal.verify.yml` and return structured JSON reports.
   - `pipeseal_test_sql`: Run an ad-hoc SQL transformation against declared input fixtures in an ephemeral sandbox and return immediate pass/fail diagnostics.
   - `pipeseal_inspect_schema`: Inspect resolved column schemas and inferred DuckDB types.
   - `pipeseal_diff_output`: Return structured diffs (missing/extra rows) when output comparison fails.
3. **Agent Verification Loop:**
   ```text
   Agent Authors/Edits SQL
     └──> Calls pipeseal_verify / pipeseal_test_sql via MCP
           └──> PipeSeal runs in-memory DuckDB verification
                 ├──> [PASS] Agent commits verified code with cryptographic evidence
                 └──> [FAIL] Agent receives structured diagnostics & self-corrects SQL
   ```

---

## 7. Key References & Documentation Links

- [PRD (Product Requirements)](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/PRD.md)
- [System Architecture](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/ARCHITECTURE.md)
- [Threat Model](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/THREAT-MODEL.md)
- [Test Strategy](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/TEST-STRATEGY.md)
- [Product Roadmap](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/ROADMAP.md)
- [ADR Index](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/decisions)
- [Agent Guidelines (AGENTS.md)](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/AGENTS.md)
- [CI Workflow](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/.github/workflows/ci.yml)
