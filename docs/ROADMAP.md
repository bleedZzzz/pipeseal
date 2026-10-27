# PipeSeal — Roadmap

> **Version:** 0.1.0 (Released)
> **Date:** 2026-10-28
> **Note:** Versions and timelines are aspirational. Scope may change based on user feedback and research findings.

---

## v0.1.0 — MVP: Proof of Thesis

**Goal:** Prove that PipeSeal can execute a SQL transformation, verify results, and generate a truthful report.

| Deliverable                                    | Status       |
| ---------------------------------------------- | ------------ |
| `@pipeseal/core` — verification engine         | ✅ Completed |
| `pipeseal` — CLI with `verify` and `init`      | ✅ Completed |
| DuckDB execution engine (`@duckdb/node-api`)   | ✅ Completed |
| Schema, null, uniqueness, row count checks     | ✅ Completed |
| Custom SQL assertion checks                    | ✅ Completed |
| Output comparison (`output_match` CSV)         | ✅ Completed |
| Versioned JSON verification report (`v1.0.0`)  | ✅ Completed |
| Standard exit codes (0/1/2)                    | ✅ Completed |
| Synthetic CSV/JSON fixtures                    | ✅ Completed |
| Automated tests (unit + integration + e2e)     | ✅ Completed |
| Reproducible demonstration (`basic-csv`)       | ✅ Completed |
| README, CONTRIBUTING, LICENSE                  | ✅ Completed |
| GitHub Actions CI (`ci.yml` Win + Mac + Linux) | ✅ Completed |

**Milestone exit criteria:** The demonstration test passes end-to-end on all three platforms.

---

## v0.2.0 — Agent Integration

**Goal:** Enable AI coding agents to verify their own SQL transformations.

| Deliverable                                              | Depends On          |
| -------------------------------------------------------- | ------------------- |
| MCP server (`pipeseal mcp serve`)                        | MCP TypeScript SDK  |
| MCP tools: `verify`, `check_schema`, `compare_output`    | @pipeseal/core      |
| GitHub Action for CI integration                         | @pipeseal/cli       |
| dbt adapter (read dbt artifacts, run against dbt models) | dbt manifest format |
| JSON/Parquet input support                               | @pipeseal/duckdb    |
| Report schema v1.1 (add MCP context)                     | @pipeseal/core      |

---

## v0.3.0 — Cross-Tool Verification

**Goal:** Verify pipelines built with multiple tools, not just raw SQL.

| Deliverable                                           | Depends On                 |
| ----------------------------------------------------- | -------------------------- |
| SQLMesh adapter (read SQLMesh state, verify outputs)  | SQLMesh API/CLI            |
| Python worker protocol (execute Python-based checks)  | Subprocess protocol design |
| OpenLineage event emission                            | OpenLineage spec           |
| Failure diagnosis (LLM-assisted, optional)            | LLM API integration        |
| Incremental verification (only re-run changed checks) | Config fingerprinting      |

---

## v0.4.0 — Enterprise and Evidence

**Goal:** Production-grade verification for team workflows.

| Deliverable                                               | Depends On              |
| --------------------------------------------------------- | ----------------------- |
| Remote warehouse adapters (Postgres, Snowflake, BigQuery) | Warehouse SDKs          |
| Report cryptographic signing                              | Signing key management  |
| Report verification (validate report authenticity)        | Signed report format    |
| Parallel check execution                                  | Worker pool design      |
| Configuration inheritance (base + override configs)       | Config schema extension |

---

## Non-Roadmap Items

These are explicitly excluded from the foreseeable roadmap:

| Item                                     | Reason                                            |
| ---------------------------------------- | ------------------------------------------------- |
| Web dashboard                            | CLI and JSON first; UI is a separate project      |
| Autonomous repair                        | Repair proposals require human/agent approval     |
| Distributed execution                    | Single-node DuckDB is sufficient for verification |
| Data observability / monitoring          | Different product category (see Elementary)       |
| SQL analysis / linting                   | Different product category (see Altimate Code)    |
| Data catalog integration as core feature | Integration adapters, not core functionality      |

---

## Decision Points

| Decision                    | When                | Criteria                                        |
| --------------------------- | ------------------- | ----------------------------------------------- |
| Add Python workers?         | After v0.2 feedback | Do users need Python-based checks?              |
| Add warehouse adapters?     | After v0.2 feedback | Do users need to verify against live databases? |
| Add MCP?                    | After v0.1 launch   | Is MCP stable and adopted?                      |
| Monorepo or separate repos? | Before v0.2         | If packages grow large, consider splitting      |
| Report signing?             | After v0.3          | Do users need tamper-evident reports?           |
