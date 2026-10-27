# PipeSeal — Antigravity Agent Guidelines

> **Project:** PipeSeal (`@pipeseal/core`, `pipeseal`)  
> **Status:** Phase 1 Complete (Research & Planning). Awaiting approval before Phase 2 implementation.  
> **Documentation:** All authoritative specifications reside in [`docs/`](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs).

---

## 1. Core Mission & Philosophy
- **Verification, Not Transformation:** PipeSeal verifies SQL transformations and data pipeline assets in controlled local environments (DuckDB). It does not replace transformation runners (dbt, SQLMesh) or orchestrators (Dagster, Prefect).
- **Deterministic Truth:** Evidence produced must reflect actual run results. Never hardcode, mock passing assertions, or assume a fix works without running checks against actual data.
- **Minimalism & Speed:** TypeScript-native, fast startup, zero Python requirement for the MVP.

---

## 2. Technical Stack & Standards
- **Runtime:** Node.js (v20+ LTS recommended), pure ESM (`"type": "module"`).
- **Language:** TypeScript 5.x with strict type checking enabled (`strict: true`, `noImplicitAny: true`).
- **Core Engine:** DuckDB in-memory database (`@duckdb/node-api` / DuckDB Node "Neo").
- **Testing Framework:** Vitest. Every check type must have automated positive and negative test cases.
- **CLI Framework:** Commander.js. Must support `--json` output format and standard POSIX exit codes (0 = pass, 1 = failure, 2 = execution/config error).
- **Formatting & Linting:** Prettier and ESLint.

---

## 3. Security & Safety Rules
- **Safe Execution Defaults:** Read-only connections where supported; execute transformations strictly in ephemeral in-memory databases (`:memory:`).
- **Destructive SQL Guards:** Reject or isolate arbitrary `ATTACH`, file write (`COPY TO`), and filesystem escape attempts.
- **Secret Redaction:** Never leak environment variables, database passwords, or connection strings in error outputs or JSON evidence reports.
- **Controlled Timeouts:** Every execution step and check must be bound by a configurable timeout (default 30s) to prevent resource exhaustion.

---

## 4. Key Reference Documents
- [PRD](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/PRD.md) — Scope, requirements, acceptance criteria, and explicit non-goals.
- [Architecture](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/ARCHITECTURE.md) — Package layout, lifecycle, core interfaces, and pipeline stages.
- [Threat Model](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/THREAT-MODEL.md) — Trust boundaries, attack vectors, and mitigations.
- [Test Strategy](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/TEST-STRATEGY.md) — Test pyramid, fixtures, and failure injection testing.
- [Roadmap](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/ROADMAP.md) — Milestone planning (v0.1.0 MVP through future versions).
- [Architecture Decision Records](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/decisions) — ADR-001 through ADR-005.
