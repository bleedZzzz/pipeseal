# ADR-001: Product Positioning

> **Status:** Proposed
> **Date:** 2026-10-28

## Context

PipeSeal's original vision was a broad "data-pipeline verification runtime." Research revealed a crowded landscape of transformation frameworks (dbt, SQLMesh), data quality tools (GX Core, Soda Core, Elementary), orchestrators (Dagster, Prefect), and AI data engineering harnesses (Altimate Code).

Five product directions were evaluated (see `docs/research/product-opportunity.md`).

## Decision

Position PipeSeal as a **tool-agnostic data-pipeline verification runtime that generates machine-readable verification evidence.**

PipeSeal is NOT a transformation framework, orchestrator, SQL analyzer, data catalog, or AI guardrail.

## Alternatives Considered

| Option                                 | Verdict       | Reason                                    |
| -------------------------------------- | ------------- | ----------------------------------------- |
| A. Generic AI data-engineering harness | Rejected      | Altimate Code already occupies this space |
| B. Pipeline verification runtime       | **Selected**  | Genuine gap identified                    |
| C. Agent-facing safety layer           | Rejected      | Too broad; safety tools exist             |
| D. CI verification tool                | Rejected      | Too narrow for independent project        |
| E. Verification evidence standard      | Merged into B | Strongest differentiator                  |

## Rationale

1. No existing tool chains controlled execution + validation + formal evidence
2. TypeScript-native position is unoccupied in the data quality space
3. Tool-agnostic design avoids competing with framework-specific testing
4. Verification evidence is a unique deliverable no competitor produces
5. Complementary to (not competing with) Altimate Code, dbt, SQLMesh

## Consequences

- PipeSeal must resist scope creep toward transformation or orchestration
- The verification report format becomes a first-class product concern
- Success depends on proving value beyond "just run dbt tests"
- Adoption may be slower than a tool tightly integrated with one framework

## Risks

- **SQLMesh evolves to cover this gap** — SQLMesh adds formal evidence generation and tool-agnostic verification. Mitigation: differentiate on TypeScript, MCP, and report format.
- **GX Core adds execution control** — GX adds controlled execution environments. Mitigation: GX is Python-only; PipeSeal targets the npm/MCP ecosystem.
- **The market is too small** — few teams need formal verification evidence. Mitigation: start with CI integration where the need is most acute.

## Evidence That Could Change This Decision

- Altimate Code adds execution verification and evidence generation → reconsider complementary vs. redundant
- SQLMesh or dbt adds a formal evidence standard → evaluate contributing upstream instead
- User research shows no demand for verification evidence → pivot to simpler CI integration tool
