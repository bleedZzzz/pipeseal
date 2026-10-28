# @pipeseal/mcp

> Model Context Protocol (MCP) server for PipeSeal deterministic data-pipeline verification.

`@pipeseal/mcp` provides a native [Model Context Protocol](https://modelcontextprotocol.io/) server communicating over standard I/O (`stdio`). It exposes PipeSeal's deterministic DuckDB verification runtime directly to AI coding agents (such as Google Antigravity, Claude Code, Cursor, and Windsurf).

---

## Features & Architectural Guarantees

- **Interface to Core Engine:** Translates MCP protocol requests into typed execution calls against `@pipeseal/core`.
- **Pure Stdio Transport:** Reserves `stdout` strictly for JSON-RPC 2.0 frames; all logs and diagnostics write exclusively to `stderr`.
- **Privacy-Safe by Default:** Diagnostic outputs omit raw dataset row values (`include_sample_values: false`) to prevent context window leakage of sensitive customer records.
- **Idempotent Clean Shutdown:** Safe termination handlers guard against recursive event loop deadlocks or stack overflows on client EOF or disconnection.
- **Path Containment (`PathGuard`):** Enforces a trusted project boundary, blocking path traversal (`../`), null bytes (`\0`), and escaping symlinks.
- **Static Destructive Query Guards:** Rejects `ATTACH`, `COPY`, `SET`, `INSTALL`, and `LOAD` operations before reaching the database engine.

---

## Installation & Running

### Option 1: On-Demand via NPX (Recommended for Agents)

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

### Option 2: Installed as a Project Dependency

```bash
npm install -D @pipeseal/mcp
```

```json
{
  "mcpServers": {
    "pipeseal": {
      "command": "node",
      "args": [
        "./node_modules/@pipeseal/mcp/dist/index.js",
        "--project-root",
        "."
      ]
    }
  }
}
```

---

## Project Root Configuration Precedence

The server determines the trusted project root directory in the following order:

1. Tool invocation parameter: `args.projectRoot`
2. CLI flag: `--project-root <path>` or `-r <path>`
3. Environment variable: `PIPESEAL_PROJECT_ROOT`
4. Directory marker scan: checks `process.cwd()` and its parents for `pipeseal.verify.yml` or `.git`
5. Monorepo workspace marker scan: checks for `pnpm-workspace.yaml`
6. Fallback: `process.cwd()`

If the target path resolves outside the trusted root, `PathGuard` rejects the request with a structured `PATH_SECURITY_ERROR`.

---

## Exposed MCP Tools

The server registers four tools:

### 1. `pipeseal_verify`

Runs full deterministic pipeline verification against an existing YAML configuration file.

- **Parameters:**
  - `configPath` _(string, required)_: Path to YAML config file.
  - `include_sample_values` _(boolean, optional, default: `false`)_: Whether to return sample failure values.
  - `projectRoot` _(string, optional)_: Trusted project root path.
- **Semantics:** Returns `status: "PASS"` (exitCode `0`) or `status: "FAIL"` (exitCode `1`) with check diagnostics.

### 2. `pipeseal_test_sql`

Safely evaluates candidate SQL transformations against declared synthetic fixtures in an ephemeral DuckDB in-memory instance.

- **Parameters:**
  - `sql` _(string, required)_: SQL transformation query.
  - `transformationName` _(string, optional)_: Destination table name.
  - `inputs` _(array of objects, required)_: Synthetic fixture sources (`name`, `source`, `format`).
  - `checks` _(array of checks, optional)_: Assertions to evaluate on the output (`schema`, `not_null`, `unique`, etc.).
  - `include_sample_values` _(boolean, optional, default: `false`)_: Whether to return raw sample output rows.
  - `timeoutMs` _(number, optional, default: `30000`, max: `60000`)_: Execution timeout.

### 3. `pipeseal_inspect_schema`

Inspects normalized column schemas (names, types, nullability) and row counts without exposing raw dataset records.

- **Parameters:**
  - `fixturePath` _(string, optional)_: Path to a CSV, JSON, or Parquet fixture file.
  - `configPath` _(string, optional)_: Path to pipeline YAML configuration.
  - `tableName` _(string, optional)_: Specific table to inspect.

### 4. `pipeseal_diff_output`

Diagnoses failing `output_match` assertions, identifying multiset differences (missing vs extra rows) or positional ordered mismatches.

- **Parameters:**
  - `configPath` _(string, optional)_: Path to YAML configuration.
  - `checkName` _(string, optional)_: Specific check name.
  - `expectedFixture` _(string, optional)_: Golden record fixture path.
  - `actualSql` _(string, optional)_: Transformation generating actual output.
  - `ordered` _(boolean, optional, default: `false`)_: Positional comparison toggle.

---

## Agent Setup Guide

### Google Antigravity Configuration

In `.agents/mcp_config.json`:

```json
{
  "mcpServers": {
    "pipeseal": {
      "command": "node",
      "args": [
        "<ABSOLUTE_PATH_TO_PIPE_SEAL>/packages/mcp/dist/index.js",
        "--project-root",
        "<ABSOLUTE_PATH_TO_PIPE_SEAL>"
      ]
    }
  }
}
```

_(Monorepo contributors can run `pnpm run setup:mcp` to automatically generate this file with local paths)._

### Claude Desktop / Cursor / Cline

In `claude_desktop_config.json` or your agent client configuration:

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

---

## Security Boundary & Guardrails

- **Containment:** All read operations are strictly contained within `projectRoot`. Directory traversal and null-byte injection are blocked.
- **Engine Lockdown:** Ephemeral DuckDB database operates with `enable_external_access = false` and `lock_configuration = true`.
- **Destructive SQL Filters:** Prohibits `ATTACH`, `COPY`, `SET`, `INSTALL`, and `LOAD`.
- **Cancellation:** Actively cancels long-running queries via native `duckdb_interrupt(connection)`.
- **Privacy Notice:** Automated heuristic redaction cannot guarantee detection of all sensitive domain-specific values. Raw values are omitted by default.

---

## License

Apache-2.0. See [LICENSE](./LICENSE) for details.
