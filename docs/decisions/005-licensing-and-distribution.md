# ADR-005: Licensing and Distribution

> **Status:** Proposed
> **Date:** 2026-10-28

## Context

PipeSeal needs a license that encourages adoption, permits commercial use, and is compatible with its dependencies. The name and npm namespace must be available.

## Decision

- **License:** Apache License 2.0
- **Repository:** `pipeseal` (on user's GitHub account/org)
- **npm scope:** `@pipeseal/*`
- **npm convenience package:** `pipeseal`

## License Rationale

| Criterion                        | Apache 2.0 | MIT    | ELv2                  |
| -------------------------------- | ---------- | ------ | --------------------- |
| Commercial use                   | ✅         | ✅     | ⚠️ No managed service |
| Patent grant                     | ✅         | ❌     | ❌                    |
| Industry adoption in data eng    | High       | Medium | Controversial         |
| Compatible with MIT deps         | ✅         | N/A    | ✅                    |
| Allows managed service offerings | ✅         | ✅     | ❌                    |

Apache 2.0 was chosen over MIT because:

1. Explicit patent grant protects contributors and users
2. Industry standard in data engineering (dbt, SQLMesh, Dagster, GX Core, OpenLineage, DataHub all use Apache 2.0)
3. More protective of contributor rights than MIT

Apache 2.0 was chosen over ELv2 because:

1. PipeSeal has no commercial entity to protect from managed service competition
2. Permissive licensing encourages adoption for an early-stage project
3. Apache 2.0 is universally trusted; ELv2 causes enterprise legal hesitation

## Name Availability

| Resource                | Status                    | Verified                    |
| ----------------------- | ------------------------- | --------------------------- |
| `pipeseal` on npm       | ✅ Available              | npm view returned 404       |
| `@pipeseal/core` on npm | ✅ Available              | npm view returned 404       |
| `pipeseal` GitHub repo  | ✅ Available (user scope) | Per-user namespace          |
| Trademark               | ⚠️ No conflict found      | Preliminary web search only |

## Dependency Compatibility

All MVP dependencies (DuckDB: MIT, Node.js: MIT) are compatible with Apache 2.0.
See `docs/research/integration-and-license-audit.md` for full audit.

## Consequences

- Apache 2.0 requires NOTICE file maintenance when distributing
- Contributors must agree to Apache 2.0 contribution terms
- The npm organization `pipeseal` should be claimed before first publish
- Domain availability (pipeseal.dev, etc.) should be checked before public launch

## Risks

- **Name collision** — another project claims "pipeseal" before publication. Mitigation: claim npm org early.
- **Apache 2.0 is too permissive** — a large company forks and competes. Mitigation: acceptable risk for early-stage project; community building is more important.

## Evidence That Could Change This Decision

- A major dependency switches to an Apache 2.0-incompatible license → evaluate alternatives
- Trademark conflict discovered → rename before first public release
- Commercial entity formed → re-evaluate ELv2 or BSL for specific components
