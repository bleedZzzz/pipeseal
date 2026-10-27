# ADR-002: Language and Runtime

> **Status:** Proposed
> **Date:** 2026-10-28

## Context

Every major data quality and pipeline tool is written in Python. PipeSeal needs to decide on a primary language and runtime. The decision affects distribution, ecosystem integration, developer experience, and maintenance burden.

## Decision

**TypeScript only for MVP (v0.1).** Optional Python workers may be added in v0.3.

## Alternatives Considered

| Option              | Pros                                                               | Cons                                                                | Verdict          |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------- |
| **TypeScript only** | npm distribution, MCP-native, unique positioning, one build system | No access to Python data libraries                                  | **Selected**     |
| TypeScript + Python | Best of both worlds                                                | Two build systems, two test suites, complex packaging               | Deferred to v0.3 |
| TypeScript + Rust   | Native performance                                                 | DuckDB already provides native SQL perf; Rust adds build complexity | Rejected         |
| TypeScript + Go     | Binary distribution                                                | `npx` solves distribution; Go adds a toolchain                      | Rejected         |
| Python only         | Largest data ecosystem                                             | No differentiation from GX/Soda/Elementary                          | Rejected         |

## Rationale

1. **npm distribution is frictionless** — `npm install -g pipeseal` or `npx pipeseal` works everywhere Node.js runs
2. **MCP SDK is TypeScript-first** — native MCP support without bridging
3. **Differentiation** — being the first TypeScript-native data verification tool is a meaningful positioning advantage
4. **DuckDB handles performance** — SQL execution is in native code via DuckDB's C++ engine; TypeScript handles orchestration via the official `@duckdb/node-api` (DuckDB Node "Neo") client
5. **One language, one dependency tree** — simpler maintenance for a solo developer
6. **Windows support** — Node.js is first-class on Windows; Python packaging on Windows is notoriously difficult

## Consequences

- Cannot directly use Python data libraries (pandas, sqlglot, etc.)
- Python-based checks require a subprocess protocol (v0.3 scope)
- Some data engineers may prefer a Python API (offer TypeScript SDK first; Python wrapper is future scope)
- Build and test tooling is JavaScript-ecosystem (pnpm, Vitest, tsup)

## Risks

- **Users reject TypeScript** — data engineers may strongly prefer Python. Mitigation: PipeSeal is a CLI tool; users interact via YAML config, not code.
- **DuckDB Node.js bindings have issues** — potential stability or platform gaps. Mitigation: Use official `@duckdb/node-api` with modern Promise/TypeScript support; legacy `duckdb` package is deprecated for v1.5+.
- **MCP SDK changes** — breaking changes in MCP TypeScript SDK. Mitigation: MCP is versioned; adapter layer isolates core from MCP changes.

## Evidence That Could Change This Decision

- DuckDB Node.js bindings prove unstable on a major platform → evaluate WASM or subprocess
- User research shows TypeScript SDK is unwanted; all users want Python → add Python SDK earlier
- MCP moves to a different language as primary → reconsider language for MCP integration
