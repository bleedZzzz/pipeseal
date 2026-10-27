# ADR-004: Verification and Evidence

> **Status:** Proposed
> **Date:** 2026-10-28

## Context

PipeSeal's primary differentiator is generating trustworthy, machine-readable verification evidence. The evidence format must be useful to CI systems, AI agents, and human reviewers while being honest about what it proves and what it does not.

## Decision

**PipeSeal produces a versioned JSON verification report with a defined schema.** The report includes run metadata, input/config fingerprints, check results, and explicit limitations.

## Report Design Principles

1. **Versioned schema** — `schema_version` field enables forward-compatible parsing
2. **Fingerprinted inputs** — SHA-256 hashes of config, SQL, and input files prove what was tested
3. **Every check recorded** — all checks run and all results are in the report, including failures
4. **No raw data** — reports contain metadata and diagnostics, not data rows (except limited samples)
5. **Explicit limitations** — every report states what it does NOT prove
6. **Machine-parseable** — valid JSON, parseable by any language

## What the Report Proves

| Claim                  | Evidence                    | Confidence              |
| ---------------------- | --------------------------- | ----------------------- |
| These checks were run  | Check list in report        | High                    |
| Against this data      | Input file fingerprints     | High                    |
| Using this SQL         | Transformation fingerprints | High                    |
| With these results     | Pass/fail per check         | High                    |
| In a fresh environment | Run metadata                | Medium (trust PipeSeal) |

## What the Report Does NOT Prove

| Non-Claim                            | Why                                                  |
| ------------------------------------ | ---------------------------------------------------- |
| The SQL is logically correct         | Checks only test declared assertions                 |
| The input data represents production | Synthetic data may differ from reality               |
| The assertions are complete          | User defines checks; missing checks are undetectable |
| The environment matches production   | DuckDB ≠ Snowflake/BigQuery/Postgres                 |
| The report is tamper-proof           | No cryptographic signing in MVP                      |

These limitations are documented in every report's `limitations` field.

## Alternatives Considered

| Option              | Verdict      | Reason                                          |
| ------------------- | ------------ | ----------------------------------------------- |
| **Versioned JSON**  | **Selected** | Universal, parseable, versionable               |
| JUnit XML           | Rejected     | Limited to pass/fail; no metadata               |
| HTML report         | Rejected     | Not machine-parseable                           |
| Protocol Buffers    | Rejected     | Requires codegen; JSON is simpler for MVP       |
| OpenTelemetry spans | Rejected     | Observability format, not verification evidence |

## Future Evolution

- **v0.2:** Add `agent_context` field for MCP session metadata
- **v0.3:** Add `lineage` field for OpenLineage event references
- **v0.4:** Add cryptographic signing (detached signature)

## Risks

- **Schema version proliferation** — too many versions make parsing hard. Mitigation: semver; breaking changes only on major version.
- **Report size** — large check suites produce large reports. Mitigation: sample failures, don't dump full data.
- **False confidence** — users treat passing report as proof of correctness. Mitigation: explicit limitations in every report; documentation.

## Evidence That Could Change This Decision

- An industry standard for data verification evidence emerges → adopt it instead of PipeSeal's format
- Users prefer JUnit XML for CI integration → support as secondary format
- Cryptographic evidence becomes table-stakes → accelerate signing to earlier version
