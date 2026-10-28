# ADR-006: Model Context Protocol (MCP) Agent Integration

> **Status:** Accepted  
> **Date:** 2026-10-28

## Context

PipeSeal v0.1.0 established a deterministic local SQL verification runtime with a CLI, SDK, in-memory DuckDB engine, and machine-readable JSON evidence. In data engineering workflows, AI coding agents (such as Google Antigravity, Claude Code, Cursor, and Windsurf) frequently generate and refactor SQL transformations, dbt models, and schema definitions. Without execution feedback, agents hallucinate query correctness or modify production pipelines blindly.

To empower coding agents to safely test, verify, and diagnose SQL transformations during development, PipeSeal requires a standard agent interface via the Model Context Protocol (MCP).

## Decision

**Implement `@pipeseal/mcp` as a dedicated monorepo package (`packages/mcp/`) that exposes PipeSeal's core verification engine to AI coding agents via the Model Context Protocol (MCP) using the stdio transport.**

The MCP server acts strictly as an adapter to the existing `@pipeseal/core` verification engine. It introduces **no duplicated verification algorithms, assertion implementations, or SQL engines**.

### 1. Architectural Principles

1. **Adapter, Not Re-implementation:** All SQL execution, schema normalization, and assertion logic route through `@pipeseal/core` (`verifyPipeline`, `DuckDBEngine`, `output_match` multiset/ordered comparison).
2. **Dedicated Workspace Package:** Keep `@pipeseal/mcp` isolated in `packages/mcp/` with independent dependencies so CLI/SDK consumers do not install MCP protocol libraries.
3. **Local Stdio Transport:** Standard I/O communication (`StdioServerTransport`) designed for local coding agents running alongside the developer's workspace.
4. **Clean Protocol Stream:** Protocol messages use `stdout` exclusively. All application diagnostics, startup messages, and error traces are directed to `stderr`.
5. **Path Sandboxing:** Enforce a trusted project root. All configuration, fixture, and SQL file paths must be canonicalized and validated within the trusted directory tree before filesystem operations.

### 2. Dependency Selection: `@modelcontextprotocol/sdk@1.32.2`

We evaluated SDK versions for stability, compatibility, and ecosystem standards:

- **`@modelcontextprotocol/server@2.4.0` family (v2.x):** Split into modular packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `@modelcontextprotocol/core`). Enforces a strict dependency on `zod: ^4.2.0`. Migrating `@pipeseal/mcp` to v2 would require a full monorepo migration to Zod 4, which introduces breaking changes for schema inference and type definitions across `@pipeseal/core` and `pipeseal`.
- **`@modelcontextprotocol/sdk@1.32.2` (Selected):** The latest, most hardened v1 maintenance release. Pure ESM, fully compatible with Node.js 22/24/26 LTS and TypeScript 5.x. Supports protocol revisions `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25` (it does not implement later 2026 specifications such as 2026-07-28, which require the v2 SDK line). Seamlessly integrates with PipeSeal's existing Zod 3 dependency tree without peer dependency conflicts or runtime risks.
- **Migration Path:** When PipeSeal performs a major release (v1.0.0), coordinate the Zod 4 core migration and upgrade to the `@modelcontextprotocol/server@^2` package family.

### 3. Data Privacy and Safe Responses

To safeguard customer datasets and sensitive information from context leakage:

- All tools default to returning schemas, aggregate counts, and structural metadata without raw row values (`include_sample_values: false`).
- An explicit `include_sample_values: true` flag must be provided to inspect bounded sample rows (max 20–100 rows).
- Path and secret redaction cleans absolute filesystem paths and known authorization tokens.
- **Privacy Limitation Boundary:** We explicitly document that heuristic automated redaction cannot guarantee the discovery or masking of all domain-specific sensitive values or Personally Identifiable Information (PII). By default, raw row values are completely omitted.

### 3. Tool Specifications

Four purpose-built tools are exposed:

| Tool Name                 | Core Method Reused               | Purpose                                                                                              |
| :------------------------ | :------------------------------- | :--------------------------------------------------------------------------------------------------- |
| `pipeseal_verify`         | `verifyPipeline`                 | Run end-to-end verification against a configuration file and return structured evidence.             |
| `pipeseal_test_sql`       | `DuckDBEngine`                   | Execute candidate SQL against declared synthetic fixtures with native timeout and security controls. |
| `pipeseal_inspect_schema` | `DuckDBEngine`                   | Inspect normalized column schemas and row counts without dumping full datasets.                      |
| `pipeseal_diff_output`    | `output_match` comparison engine | Produce structured diffs (missing, extra, count mismatches) for failing output assertions.           |

## Alternatives Considered

| Option                                                 | Verdict           | Rationale                                                                              |
| :----------------------------------------------------- | :---------------- | :------------------------------------------------------------------------------------- |
| **Thin MCP adapter over `@pipeseal/core`**             | **Selected**      | Single source of truth; zero code drift between CLI and agent tools.                   |
| Duplicate execution logic in MCP server                | Rejected          | Violates architectural principle; high risk of inconsistent behavior.                  |
| Bundle MCP server directly inside CLI (`pipeseal mcp`) | Rejected for v0.2 | Couples MCP dependencies to CLI package; separate package provides cleaner modularity. |
| Hosted HTTP / SSE MCP server                           | Rejected for v0.2 | Unnecessary attack surface; local stdio matches agent developer workflow.              |
| Allow arbitrary absolute host paths                    | Rejected          | Security violation; agents could read sensitive host files or credentials.             |

## Security & Defense Layers

1. **Path Containment (`PathGuard`):** Canonicalizes all requested paths via `fs.realpathSync`. Rejects path traversal (`..`), symlinks resolving outside the project root, null bytes (`\0`), and undeclared roots.
2. **Engine Lockdown:** `pipeseal_test_sql` and `pipeseal_verify` enforce DuckDB engine security: `SET enable_external_access = false;` and `SET lock_configuration = true;`, blocking arbitrary filesystem reads/writes (`read_csv`, `COPY TO`, `ATTACH`).
3. **Static SQL Guard:** Proactively rejects dangerous statements (`ATTACH`, `DETACH`, `COPY`, `INSTALL`, `LOAD`, `SET`, `PRAGMA`) before query dispatch.
4. **Native Query Cancellation:** Timeouts enforce native DuckDB cancellation (`connection.interrupt()`) with safe promise unwinding.
5. **Output Bounding:** Diagnostic samples, schema lists, and error messages are capped (default 20 sample rows) to prevent prompt bloat and context exhaustion.
6. **Data & Secret Redaction:** Absolute host paths are converted to relative paths; environment variables and database credentials are excluded from tool responses.

## Consequences

- AI agents can autonomously test SQL transformations locally in ~15ms and verify compliance before committing changes.
- Successful protocol execution (`isError: false`) is cleanly separated from failed data verification (`status: "failed"`).
- Agents receive structured diagnostic diffs rather than massive raw data dumps.
- DuckDB remains in-process; native code crash isolation is not provided by MCP and remains a known boundary documented in the Threat Model.

## Risks & Mitigations

- **Prompt Injection via Fixtures:** Malicious data in fixtures could attempt prompt injection against the agent. Mitigation: Results return structured JSON properties rather than raw text concatenations.
- **Agent Confusion on Verification Failure:** Agents might interpret a failed pipeline check as an MCP protocol crash. Mitigation: Clean error categorizations (`VERIFICATION_FAILED` vs `CONFIG_ERROR` vs `PROTOCOL_ERROR`).
- **Resource Exhaustion from Expensive SQL:** Agent-generated Cartesian products or infinite recursion could hang the host. Mitigation: Strict bounded query execution timeout with native DuckDB interruption.
