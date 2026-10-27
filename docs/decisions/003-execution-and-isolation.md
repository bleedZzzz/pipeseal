# ADR-003: Execution and Isolation

> **Status:** Proposed
> **Date:** 2026-10-28

## Context

PipeSeal's core thesis requires executing SQL transformations in "controlled environments." The degree of isolation directly affects security, reproducibility, and feasibility.

## Decision

**MVP uses in-memory DuckDB instances. Each verification run creates a fresh DuckDB instance that is destroyed after the run completes.**

No Docker containers, VMs, WASM sandboxes, or separate processes for MVP.

## Alternatives Considered

| Option               | Isolation Level  | Complexity               | Verdict                            |
| -------------------- | ---------------- | ------------------------ | ---------------------------------- |
| **In-memory DuckDB** | Process-level    | Low                      | **Selected**                       |
| DuckDB in subprocess | Process boundary | Medium                   | Considered for v0.2                |
| Docker container     | Full OS-level    | High (Docker dependency) | Rejected for MVP                   |
| WASM sandbox         | Memory isolation | Medium                   | Rejected (DuckDB WASM limitations) |
| Firecracker/microVM  | Hardware-level   | Very high                | Rejected (overkill)                |

## Rationale

1. **In-memory DuckDB is ephemeral by design** — no persistent state between runs
2. **Zero infrastructure dependency** — no Docker, no container runtime
3. **Fast startup** — DuckDB initializes in milliseconds
4. **Sufficient for the threat model** — MVP only processes local files; no network or database connections
5. **Cross-platform** — works identically on Windows, macOS, Linux

## Security Properties & Defense Layers

### Layer 1: DuckDB Engine API Security (Enforceable In-Process)

- **Engine-level external access lockdown:** DuckDB supports `SET enable_external_access = false;` and `SET lock_configuration = true;`, which prevents arbitrary filesystem reads (`read_csv`, `read_parquet`), disables file exports (`COPY TO`), blocks database attachment (`ATTACH`), and prevents user SQL from unlocking settings.
- **Path allowlisting:** Allowed input paths can be scoped using `allowed_directories` prior to configuration locking.
- **Resource constraints:** Memory ceiling (`SET max_memory = '...';`) and thread pool (`SET threads = ...;`) configurable via DuckDB configuration.
- **Extension gating:** Disable external extension loading (`allow_community_extensions = false`, `allow_unsigned_extensions = false`).

### Layer 2: Limitations Requiring Process / OS-Level Isolation

- **Native crashes & segmentation faults:** Because DuckDB C++ runs in the same process space as Node.js in the MVP, a memory corruption or crash terminates the entire Node process.
- **Native thread freezing:** Unpreemptible native execution loops cannot be killed cleanly without terminating the host process.
- **Heap exposure:** Memory-unsafe operations or C++ level reads could theoretically access host process heap memory (e.g., `process.env`).
- **Conclusion:** DuckDB engine API options provide robust protection against SQL-level filesystem escapes, but **true isolation against malicious C++ exploits or denial-of-service requires process/container boundaries**, which is scheduled for multi-tenant / untrusted-code environments in v0.2+.

| Property                        | Provided in MVP? | Enforcement Mechanism                                                        |
| ------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| Fresh environment per run       | ✅ Yes           | Ephemeral in-memory database (`:memory:`) destroyed upon completion          |
| No state leakage between runs   | ✅ Yes           | Separate database lifecycle per verification run                             |
| Filesystem read/write isolation | ✅ Yes           | `SET enable_external_access = false;` + path allowlisting + config lock      |
| Extension / network blocking    | ✅ Yes           | Extensions disabled; `enable_external_access = false` blocks httpfs          |
| OS process isolation            | ❌ No            | In-process native bindings (`@duckdb/node-api`); subprocess deferred to v0.2 |
| Hard crash isolation            | ❌ No            | Native crash terminates Node.js process; requires subprocess worker          |

## Consequences

- DuckDB runs in-process via `@duckdb/node-api` for the MVP: fast, low overhead (<50ms startup), zero Docker dependency.
- For local verification and CI of trusted/semi-trusted repo SQL, DuckDB API lockdown (`enable_external_access = false`, `lock_configuration = true`) is sufficient.
- For hosting untrusted user code or multi-tenant agent execution, subprocess worker isolation must be implemented in v0.2.

## Risks

- **DuckDB vulnerability allows code execution** — a crafted SQL or data file exploits a DuckDB bug. Mitigation: update DuckDB promptly; document the trust boundary.
- **Users expect Docker-level isolation** — marketing must be honest about in-process execution. Mitigation: document clearly; consider subprocess isolation in v0.2.

## Evidence That Could Change This Decision

- Security audit reveals DuckDB in-process is insufficient for the use case → add subprocess or container isolation
- Users require multi-tenant execution → container isolation becomes necessary
- DuckDB WASM becomes production-ready for Node.js → evaluate WASM sandbox
