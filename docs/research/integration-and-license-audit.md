# PipeSeal — Integration and License Audit

> **Research date:** 2026-10-28
> **Disclaimer:** This is a preliminary audit for planning purposes, not legal advice.

---

## 1. PipeSeal's Own License

**Proposed:** Apache License 2.0

**Rationale:**

- Permissive, widely trusted in data engineering (used by dbt, SQLMesh, Dagster, GX Core, OpenLineage, DataHub)
- Allows commercial use, modification, distribution, patent grant
- Compatible with MIT dependencies (DuckDB)
- Does not restrict managed-service offerings (unlike ELv2)
- Standard for Linux Foundation projects

**Verified from source:** [Apache License 2.0 text](https://www.apache.org/licenses/LICENSE-2.0) — confirmed present in workspace as `LICENSE` file.

**Obligations:**

- Include license and copyright notice in distributions
- State changes if distributing modified versions
- Cannot use trademarks without separate permission
- No warranty implied

---

## 2. Dependency License Audit

### Direct Dependencies (MVP)

| Dependency       | License    | Compatible with Apache 2.0? | Risk Level | Notes                           |
| ---------------- | ---------- | --------------------------- | ---------- | ------------------------------- |
| DuckDB (Node.js) | MIT        | ✅ Yes                      | Low        | Permissive. Include MIT notice. |
| Node.js          | MIT        | ✅ Yes                      | Low        | Runtime, not bundled            |
| TypeScript       | Apache 2.0 | ✅ Yes                      | Low        | Dev dependency only             |

### Potential Future Dependencies

| Dependency         | License | Compatible? | Risk | Notes                       |
| ------------------ | ------- | ----------- | ---- | --------------------------- |
| SQLGlot (Python)   | MIT     | ✅ Yes      | Low  | If Python workers parse SQL |
| duckdb-wasm        | MIT     | ✅ Yes      | Low  | Browser/WASM execution      |
| zod (validation)   | MIT     | ✅ Yes      | Low  | Schema validation           |
| commander.js       | MIT     | ✅ Yes      | Low  | CLI framework               |
| chalk / picocolors | MIT/ISC | ✅ Yes      | Low  | Terminal colors             |

### Dependencies to AVOID

| Dependency              | License           | Issue                                           |
| ----------------------- | ----------------- | ----------------------------------------------- |
| Soda Core               | ELv2              | Cannot bundle or provide as managed service     |
| Airbyte protocol        | ELv2              | Cannot embed core protocol in competing service |
| OpenMetadata connectors | Collate Community | Restrictions on managed service use             |
| Any AGPL library        | AGPL-3.0          | Would require PipeSeal to become AGPL           |
| Any SSPL library        | SSPL              | Incompatible with Apache 2.0                    |

---

## 3. Integration License Compatibility

### Safe Integrations (No License Risk)

| Integration Target | Their License  | Integration Method               | PipeSeal Obligation     |
| ------------------ | -------------- | -------------------------------- | ----------------------- |
| DuckDB             | MIT            | npm package, direct embedding    | Include MIT notice      |
| dbt Core (OSS)     | Apache 2.0     | CLI invocation, artifact reading | No code copying needed  |
| SQLMesh            | Apache 2.0     | CLI invocation, state inspection | No code copying needed  |
| Dagster            | Apache 2.0     | REST API, CLI                    | No code copying needed  |
| GX Core            | Apache 2.0     | Python subprocess, REST API      | No code copying needed  |
| OpenLineage        | Apache 2.0     | Emit events via HTTP/SDK         | Follow OpenLineage spec |
| DataHub            | Apache 2.0     | REST API for metadata push       | No code copying needed  |
| Prefect            | Permissive OSS | REST API                         | No code copying needed  |

### Integrations Requiring Caution

| Integration Target | Their License        | Risk                                              | Mitigation                                    |
| ------------------ | -------------------- | ------------------------------------------------- | --------------------------------------------- |
| Soda Core          | ELv2                 | Cannot bundle; CLI invocation OK for internal use | Invoke as external process only; do not embed |
| Airbyte            | ELv2                 | Cannot embed protocol; API integration OK         | Use REST API; do not copy protocol code       |
| OpenMetadata       | Apache 2.0 + Collate | Connector code restricted                         | Use REST API only; avoid connector SDK        |
| Altimate Code      | MIT                  | No risk                                           | MCP or CLI integration fine                   |

---

## 4. Name and Namespace Audit

### npm

| Name             | Status                          | Verified                                  |
| ---------------- | ------------------------------- | ----------------------------------------- |
| `pipeseal`       | **Available** (404 on registry) | ✅ `npm view pipeseal` returned 404       |
| `@pipeseal/core` | **Available** (404 on registry) | ✅ `npm view @pipeseal/core` returned 404 |

**Note:** npm scoped packages (`@pipeseal/*`) require creating an npm organization. The organization name `pipeseal` should be claimed before publishing.

### GitHub

| Resource                   | Status                | Notes                                    |
| -------------------------- | --------------------- | ---------------------------------------- |
| `github.com/*/pipeseal`    | User-specific         | Available under any personal/org account |
| Repository name `pipeseal` | ✅ Available for user | No global claim possible                 |

### Domain

| Domain         | Status                                       |
| -------------- | -------------------------------------------- |
| `pipeseal.dev` | Not checked (would require registrar lookup) |
| `pipeseal.io`  | Not checked                                  |
| `pipeseal.com` | Not checked                                  |

**Recommendation:** Check domain availability before public launch. Not blocking for development.

### Trademark

No trademark registration was found for "PipeSeal" in preliminary web searches. This is not a legal guarantee. A proper trademark search should be conducted before commercial use of the name.

---

## 5. Attribution Obligations Summary

If PipeSeal ships with DuckDB as a bundled dependency:

- Include DuckDB's MIT license text in distribution
- Maintain copyright notice

If PipeSeal integrates with Apache 2.0 projects via adapters:

- No code copying needed (adapter calls external APIs/CLIs)
- If any Apache 2.0 code is copied/modified, include NOTICE file and license

**Bottom line:** PipeSeal's proposed stack (Apache 2.0 license, MIT/Apache 2.0 dependencies, external integrations via APIs) has **no identified license conflicts** for the MVP scope.
