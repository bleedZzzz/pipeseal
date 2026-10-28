# PipeSeal — Architecture

> **Version:** 0.1.0-draft
> **Date:** 2026-10-28

---

## 1. Language Decision: TypeScript Only (MVP)

### Rationale

- **npm-native distribution:** `npm install -g pipeseal` or `npx pipeseal`
- **MCP ecosystem alignment:** MCP SDK is TypeScript-first
- **No existing TypeScript data verification tool:** entire competitor landscape is Python
- **DuckDB has official modern TypeScript bindings** (`@duckdb/node-api` / DuckDB Node "Neo", replacing the deprecated legacy `duckdb` package)
- **Single-language simplicity:** one test suite, one build system, one dependency tree
- **Windows/macOS/Linux:** Node.js runs everywhere without compilation

### Alternatives Rejected

| Alternative         | Why Rejected                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| TypeScript + Python | Adds complexity. Python workers are a v0.3 consideration, not MVP.              |
| TypeScript + Rust   | Premature optimization. DuckDB already handles SQL performance in native code.  |
| TypeScript + Go     | Binary distribution is nice but `npx` solves this. Go adds a build toolchain.   |
| Python only         | Would blend into the existing all-Python landscape. No npm/MCP differentiation. |

---

## 2. Package Structure

```
@pipeseal/core         — Verification engine, checks, report generation
@pipeseal/cli          — CLI wrapper around core
@pipeseal/mcp          — Model Context Protocol (MCP) server for AI coding agents
pipeseal               — Meta-package that installs cli (convenience)
```

### Monorepo Layout

```
pipeseal/
├── packages/
│   ├── core/              — @pipeseal/core
│   │   ├── src/
│   │   │   ├── config/    — Configuration loading and validation
│   │   │   ├── checks/    — Check implementations
│   │   │   ├── report/    — Report generation
│   │   │   ├── engine/    — Execution engine interface (DuckDBEngine)
│   │   │   └── index.ts   — Public API
│   │   ├── test/
│   │   └── package.json
│   ├── cli/               — @pipeseal/cli (pipeseal)
│   │   ├── src/
│   │   │   ├── commands/  — CLI commands (verify, init)
│   │   │   └── index.ts   — Entry point
│   │   ├── test/
│   │   └── package.json
│   └── mcp/               — @pipeseal/mcp
│       ├── src/
│       │   ├── security/  — PathGuard (trusted root validation)
│       │   ├── tools/     — MCP tool implementations & schemas
│       │   ├── server.ts  — McpServer factory
│       │   └── index.ts   — Stdio executable entry point
│       └── package.json
├── examples/
│   └── basic-csv/         — Demonstration pipeline
├── test/
│   ├── mcp/               — MCP protocol, functional, and security tests
│   └── fixtures/          — Synthetic test fixtures
├── docs/
├── AGENTS.md
├── LICENSE
├── package.json           — Workspace root
└── tsconfig.json
```

---

## 3. Component Architecture

```
┌──────────────────────────────────────────────────────┐
│                     CLI (@pipeseal/cli)               │
│  pipeseal verify config.yml                          │
│  pipeseal init                                       │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│                  Core (@pipeseal/core)                │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ Config      │  │ Verifier    │  │ Report       │ │
│  │ Loader      │──│ Engine      │──│ Generator    │ │
│  │             │  │             │  │              │ │
│  └─────────────┘  └──────┬──────┘  └──────────────┘ │
│                          │                           │
│           ┌──────────────┼──────────────┐            │
│           ▼              ▼              ▼            │
│  ┌──────────────┐ ┌───────────┐ ┌──────────────┐    │
│  │ Schema Check │ │ Null Check│ │ Custom SQL   │    │
│  │ Unique Check │ │ Row Count │ │ Output Match │    │
│  └──────────────┘ └───────────┘ └──────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │     Execution Adapter Interface              │    │
│  │     execute(sql: string): Promise<Result>    │    │
│  │     loadSource(name, path, format): void     │    │
│  └──────────────────┬───────────────────────────┘    │
└─────────────────────┼────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│              DuckDB Adapter (@pipeseal/duckdb)       │
│  - Fresh in-memory DuckDB per run                   │
│  - Reads CSV/JSON/Parquet files                     │
│  - Query execution with timeout                     │
│  - Clean teardown                                   │
└──────────────────────────────────────────────────────┘
```

---

## 4. Execution Lifecycle

```
1. LOAD CONFIG
   ├── Parse YAML/JSON configuration
   ├── Validate with zod schema
   └── Compute config fingerprint (SHA-256)

2. INITIALIZE ENGINE
   ├── Create fresh DuckDB instance (in-memory via @duckdb/node-api)
   ├── Set resource limits (memory, threads, timeout)
   ├── Apply API security lockdown (enable_external_access = false, lock_configuration = true)
   └── Register abort controller

3. LOAD INPUTS & EXPECTED FIXTURES
   ├── For each input: read file, compute fingerprint (SHA-256), stage into memory
   ├── For each output_match check: stage expected CSV fixture into isolated table in memory
   ├── Apply API security lockdown (enable_external_access = false, lock_configuration = true)
   └── Record input metadata (rows, schema)

4. EXECUTE TRANSFORMATIONS
   ├── For each transformation:
   │   ├── Execute SQL against loaded inputs within ephemeral DuckDB instance
   │   ├── Record duration, output row count
   │   └── Compute transformation SQL fingerprint
   └── Handle errors: record diagnostic, continue or abort

5. RUN CHECKS
   ├── For each check:
   │   ├── Execute check logic against transformation outputs
   │   ├── Record pass/fail, details, diagnostics
   │   └── Collect sample failures (sanitized, limited)
   └── All checks run even if some fail (no short-circuit)

6. GENERATE REPORT
   ├── Assemble all metadata into versioned JSON
   ├── Compute summary (pass/fail/total)
   ├── Sanitize: no raw data, no secrets
   └── Write to stdout (JSON) or file

7. CLEANUP
   ├── Close DuckDB instance
   ├── Release memory
   └── Exit with code: 0 (pass), 1 (check failure), 2 (runtime error)
```

---

## 5. Public API Boundaries

### @pipeseal/core

```typescript
// Configuration
interface PipeSealConfig {
  version: string;
  name: string;
  inputs: InputConfig[];
  transformations: TransformationConfig[];
  checks: CheckConfig[];
}

// Main API
function createVerifier(options?: VerifierOptions): Verifier;

interface Verifier {
  run(config: PipeSealConfig): Promise<VerificationReport>;
  destroy(): Promise<void>;
}

// Results
interface VerificationReport {
  schema_version: string;
  run_id: string;
  timestamp: string;
  duration_ms: number;
  config: ConfigMetadata;
  inputs: InputMetadata[];
  transformations: TransformationResult[];
  checks: CheckResult[];
  summary: Summary;
  exit_code: 0 | 1 | 2;
}
```

### Execution Adapter Interface

```typescript
interface ExecutionAdapter {
  initialize(): Promise<void>;
  loadSource(
    name: string,
    path: string,
    format: string,
  ): Promise<SourceMetadata>;
  execute(sql: string, options?: ExecuteOptions): Promise<QueryResult>;
  destroy(): Promise<void>;
}

interface ExecuteOptions {
  timeout_ms?: number;
  signal?: AbortSignal;
}
```

---

## 6. Error Model

| Error Category          | Exit Code | Behavior                                      |
| ----------------------- | --------- | --------------------------------------------- |
| All checks pass         | 0         | Report with status PASS                       |
| One or more checks fail | 1         | Report with status FAIL, all checks still run |
| Config parse error      | 2         | Error message to stderr, no report            |
| Input file not found    | 2         | Error message to stderr, no report            |
| SQL execution error     | 2         | Error in report diagnostics, run aborts       |
| Timeout exceeded        | 2         | Error in report, partial results if available |
| DuckDB crash            | 2         | Error message to stderr, no report            |

---

## 7. Configuration and Permissions

- **No network access by default.** DuckDB reads local files only.
- **No write access to user files.** Output goes to stdout or a specified report file.
- **No credential storage.** MVP uses local files only; no warehouse connections.
- **No ambient authority.** The verifier receives explicit config; it does not scan the filesystem.

---

## 8. Future Architecture Extensions

### v0.2: MCP Agent Integration (@pipeseal/mcp)

```
┌─────────────────────────────────────────────────────────────────┐
│              AI Coding Agents (Antigravity, Claude, Cursor)     │
└───────────────────────────────┬─────────────────────────────────┘
                                │ JSON-RPC 2.0 over stdio
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               PipeSeal MCP Server (@pipeseal/mcp)               │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ PathGuard Security Layer (Root containment, symlink guard) │  │
│  └────────────────────────────┬──────────────────────────────┘  │
│                               │                                 │
│  ┌────────────────────────────┴──────────────────────────────┐  │
│  │ Registered MCP Tools:                                     │  │
│  │  • pipeseal_verify        ──► verifyPipeline()            │  │
│  │  • pipeseal_test_sql      ──► DuckDBEngine (isolated)     │  │
│  │  • pipeseal_inspect_schema──► DuckDBEngine (schema inspect)│  │
│  │  • pipeseal_diff_output   ──► output_match (diff engine)  │  │
│  └────────────────────────────┬──────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────┘
                                │ In-process TypeScript API
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PipeSeal Core (@pipeseal/core)                  │
│                                                                 │
│  - Ephemeral in-memory DuckDB runtime                           │
│  - Engine API lockdown (enable_external_access = false)         │
│  - Native query interruption & timeouts                         │
│  - Standardized JSON evidence reports                           │
└─────────────────────────────────────────────────────────────────┘
```

The MCP package exposes 4 tools that adapt `@pipeseal/core` without duplicating verification logic or assertion algorithms:

1. `pipeseal_verify`: End-to-end pipeline verification against project configuration files.
2. `pipeseal_test_sql`: Controlled trial transformation of SQL against synthetic fixture tables with static destructive query guards and timeouts.
3. `pipeseal_inspect_schema`: Extraction of normalized table schemas and row counts without returning full datasets.
4. `pipeseal_diff_output`: Detailed discrepancy breakdown (missing rows, extra rows, schema differences) for failing output assertions.

### v0.3: Python Workers

```
@pipeseal/core ──► spawn Python subprocess ──► execute Python-based checks
                   (stdin/stdout JSON protocol)
```

### v0.4: Warehouse Adapters

```
@pipeseal/core ──► @pipeseal/postgres  (node-postgres)
               ──► @pipeseal/snowflake (snowflake-sdk)
               ──► @pipeseal/bigquery  (googleapis)
```

Each adapter implements the `ExecutionAdapter` interface. The core has no knowledge of specific databases.

---

## 9. Build and Distribution

| Aspect                 | Choice                     |
| ---------------------- | -------------------------- |
| **Package manager**    | npm (pnpm for development) |
| **Build tool**         | tsup (esbuild-based, fast) |
| **Test framework**     | Vitest                     |
| **Monorepo**           | pnpm workspaces            |
| **CI**                 | GitHub Actions             |
| **Node version**       | ≥ 20.0.0 (LTS)             |
| **TypeScript version** | ≥ 5.0                      |
