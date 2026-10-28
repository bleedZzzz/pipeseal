# PipeSeal — Model Context Protocol (MCP) Specification & Integration Guide

> **Milestone:** v0.2.0  
> **Package:** `@pipeseal/mcp` (`packages/mcp`)  
> **Status:** Implemented & Locally Verified  
> **Architecture Decision Record:** [ADR-006: MCP Integration for Coding Agents](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/decisions/006-mcp-agent-integration.md)

---

## 1. Overview & Architectural Role

PipeSeal's Model Context Protocol (MCP) server exposes the deterministic verification engine directly to AI coding agents (such as Google Antigravity, Claude Desktop, Cursor, and Cline).

### Fundamental Architectural Rule

**MCP is an interface to PipeSeal, not a second implementation.**  
`@pipeseal/mcp` does not implement its own SQL parser, assertion logic, or DuckDB runner. It translates standard MCP JSON-RPC protocol requests into typed calls against `@pipeseal/core`, enforces strict path and command security boundaries, and returns structured machine-readable evidence reports alongside concise human-readable summaries.

```text
┌────────────────────────────────────────────────────────┐
│               AI Coding Agent (Client)                 │
│         (Google Antigravity / Cursor / Claude)         │
└───────────────────────────┬────────────────────────────┘
                            │ JSON-RPC 2.0 (stdio)
┌───────────────────────────▼────────────────────────────┐
│                    @pipeseal/mcp                       │
│  - StdioServerTransport (stdout protocol-clean)        │
│  - PathGuard (Canonicalization & Traversal Blocker)    │
│  - Destructive SQL Filters (ATTACH/COPY/SET Prohibited)│
└───────────────────────────┬────────────────────────────┘
                            │ Typed Core Calls
┌───────────────────────────▼────────────────────────────┐
│                    @pipeseal/core                      │
│  - Ephemeral DuckDB Instance (:memory:)                │
│  - Engine Lockdown (enable_external_access = false)    │
│  - Native Timeout Interruption (duckdb_interrupt)      │
│  - Assertions (schema, not_null, unique, output_match) │
│  - Versioned JSON Evidence Report Generator            │
└────────────────────────────────────────────────────────┘
```

---

## 2. Exposed MCP Tools

The server registers four structured tools:

### Tool 1: `pipeseal_verify`

Runs full deterministic pipeline verification against an existing YAML configuration file.

- **Parameters:**
  - `configPath` _(string, required)_: Path to the PipeSeal verification YAML config file (relative to project root).
  - `include_sample_values` _(boolean, optional, default: `false`)_: Whether to include raw sample row values in failure diagnostics. Defaults to `false` to protect sensitive data.
  - `projectRoot` _(string, optional)_: Optional trusted project root directory. Defaults to working directory.
- **Protocol Contract:**
  - When all checks pass: returns `isError: false`, `status: "PASS"`, exitCode `0`.
  - When checks fail (e.g. data quality violations): returns `isError: false`, `status: "FAIL"`, exitCode `1`. Truthful verification failure is conveyed in the payload rather than as a protocol transport error.
  - When configuration or path security fails: returns `isError: true` with error category `CONFIG_ERROR` or `PATH_SECURITY_ERROR`.
  - Privacy guarantee: Raw failure sample values are omitted by default (`include_sample_values: false`).

---

### Tool 2: `pipeseal_test_sql`

Enables an agent to evaluate a proposed SQL transformation against declared synthetic fixture datasets in an isolated DuckDB in-memory database before committing changes.

- **Parameters:**
  - `sql` _(string, required)_: SQL transformation statement to execute.
  - `transformationName` _(string, optional, default: `"test_transformation"`)_: Target table name.
  - `inputs` _(array of objects, required)_:
    - `name` _(string)_: Table name in DuckDB.
    - `source` _(string)_: Relative path to fixture file (`.csv`, `.json`, `.parquet`).
    - `format` _(string, optional, default: `"csv"`)_: Format identifier.
  - `checks` _(array of check objects, optional)_: Optional PipeSeal assertions to evaluate (`schema`, `not_null`, `unique`, `row_count`, `custom_sql`, `output_match`).
  - `include_sample_values` _(boolean, optional, default: `false`)_: Whether to return raw sample output rows. Defaults to `false` for data privacy.
  - `timeoutMs` _(number, optional, default: `30000`, max: `60000`)_: Execution timeout in milliseconds.
  - `projectRoot` _(string, optional)_: Trusted root directory.
- **Safety & Privacy:**
  - Pre-execution regex filter rejects `ATTACH`, `COPY`, `SET`, `INSTALL`, and `LOAD`.
  - Engine lockdown (`enable_external_access = false`, `lock_configuration = true`) prevents any unallowed filesystem or network read.
  - Configurable execution timeout actively cancels running queries via native `connection.interrupt()`.
  - Returns aggregate counts and schemas by default; raw row values are returned only when `include_sample_values: true` is explicitly passed.

---

### Tool 3: `pipeseal_inspect_schema`

Allows agents to inspect the normalized column schema (`name`, normalized DuckDB `type`, `nullable`) and row count of declared fixture datasets or pipeline configuration tables without exposing raw sensitive records.

- **Parameters:**
  - `fixturePath` _(string, optional)_: Path to a standalone fixture file relative to project root.
  - `fixtureFormat` _(string, optional, default: `"csv"`)_: Format of fixture.
  - `configPath` _(string, optional)_: Path to pipeline YAML configuration.
  - `tableName` _(string, optional)_: Specific table name to inspect when `configPath` is provided.
  - `projectRoot` _(string, optional)_: Trusted project root directory.
- **Privacy Property:** Schema inspection never dumps dataset rows, returning only structural column contracts and row counts.

---

### Tool 4: `pipeseal_diff_output`

Pinpoints why an `output_match` assertion failed, returning structured multiset differences or ordered positional mismatches.

- **Parameters:**
  - `configPath` _(string, optional)_: Path to configuration declaring `output_match`.
  - `checkName` _(string, optional)_: Specific check name within config.
  - `expectedFixture` _(string, optional)_: Path to golden record CSV fixture.
  - `actualSql` _(string, optional)_: SQL transformation generating the actual output.
  - `inputs` _(array of fixtures, optional)_: Inputs required for `actualSql`.
  - `ordered` _(boolean, optional, default: `false`)_: Whether to compare with positional ordering.
  - `orderBy` _(array of strings, optional)_: Explicit ordering columns with tie-breakers.
  - `compareColumns` _(array of strings, optional)_: Subset of columns to compare.
  - `include_sample_values` _(boolean, optional, default: `false`)_: Whether to include raw discrepancy row sample values. Defaults to `false`.
  - `maxDiffSamples` _(number, optional, default: `20`, max: `100`)_: Maximum sample discrepancy rows when samples are enabled.
- **Semantics:**
  - Reuses core's relational multiset comparison (`EXCEPT ALL`) by default: reports `missingCount`, `extraCount`, and discrepancy diagnostics.
  - Reuses core's ordered comparison when `ordered: true`: pinpoints `mismatchRowIndex` and comparative expected/actual row positions.
  - Omits raw row contents by default (`include_sample_values: false`).

---

## 3. Structured Error Categories

All tool responses return structured machine-readable error categories:

| Category              | Description                                              | HTTP/Protocol Analog |
| --------------------- | -------------------------------------------------------- | -------------------- |
| `INVALID_INPUT`       | Missing required parameters or invalid check definitions | 400 Bad Request      |
| `PATH_SECURITY_ERROR` | Path traversal, null byte, or path escaping trusted root | 403 Forbidden        |
| `CONFIG_ERROR`        | Invalid YAML syntax or schema contract mismatch          | 422 Unprocessable    |
| `SECURITY_ERROR`      | Prohibited SQL (`ATTACH`, `COPY`, external read)         | 403 Security Policy  |
| `TIMEOUT_ERROR`       | Native execution interrupted due to timeout expiration   | 504 Gateway Timeout  |
| `EXECUTION_ERROR`     | DuckDB SQL syntax error or runtime query failure         | 500 Internal Error   |

---

## 4. Local Installation & Configuration

Because `@pipeseal/mcp` is part of the local monorepo workspace during development, it can be executed directly via Node.js without requiring publication to npm.

### Step 1: Build Workspace

```bash
# In repository root
pnpm install
pnpm run build
```

### Step 2: Configure AI Coding Agents

#### A. Google Antigravity Configuration

In your Antigravity project configuration (e.g. `.agents/mcp_config.json` or Antigravity MCP settings):

```json
{
  "mcpServers": {
    "pipeseal": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

#### B. Claude Desktop / Cursor / Cline Configuration

In `claude_desktop_config.json` or your client's MCP configuration file:

```json
{
  "mcpServers": {
    "pipeseal": {
      "command": "node",
      "args": [
        "c:/Users/USER/OneDrive/Desktop/pipeseal/packages/mcp/dist/index.js"
      ],
      "env": {}
    }
  }
}
```

---

## 5. Security Guardrails & Threat Model Boundaries

1. **Path Boundary:**
   - All input paths must resolve within `trustedRoot` (defaults to the current working directory).
   - Traversal (`..`), absolute host paths outside root, null bytes (`\0`), and symlink targets escaping root are rejected.
2. **In-Process DuckDB Lockdown:**
   - External access is disabled (`enable_external_access = false`).
   - Configuration is locked (`lock_configuration = true`).
   - Note: In-process lockdown is **not** an operating system sandbox. Untrusted third-party binaries or native exploits require container or VM isolation.
3. **Clean Protocol Transport:**
   - `stdout` is reserved exclusively for JSON-RPC MCP messages.
   - All server diagnostics and logging write strictly to `stderr`.
4. **Data Privacy & Sample Values:**
   - All MCP tools default to returning schemas, row counts, and structural metadata without raw row values (`include_sample_values: false`).
   - When raw sample rows are explicitly requested (`include_sample_values: true`), response rows are capped (max 20–100 rows) and sanitized.
   - Heuristic pattern redaction masks known secret tokens (JWTs, API keys, passwords) and absolute host paths.
   - **Privacy Boundary Limitation:** Automated heuristic pattern matching cannot guarantee detection of all sensitive domain-specific values or Personally Identifiable Information (PII). By default, raw values are omitted.
5. **SDK Version & Protocol Revision:**
   - Powered by `@modelcontextprotocol/sdk@1.32.2`, the hardened v1 maintenance line.
   - Implements MCP protocol revisions `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25`. It does not implement later 2026 protocol specifications (e.g. 2026-07-28), which require the v2 SDK family.
   - Native compatibility with `zod@^3.24.2` preserves stability across `@pipeseal/core` and `pipeseal`. Transition to SDK v2 is scheduled for v1.0.0 alongside the planned Zod 4 migration.
