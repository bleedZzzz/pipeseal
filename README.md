# PipeSeal 🦭

> **TypeScript-native, fast, deterministic data-pipeline verification runtime.**  
> Execute SQL transformations in controlled environments, validate results, and generate reproducible, cryptographically fingerprinted, machine-readable verification reports for CI/CD and AI coding agents.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/LICENSE)

---

## What is PipeSeal?

PipeSeal is an open-source verification engine designed specifically for modern data pipelines. Unlike heavy orchestration engines or transformation frameworks that couple model definition with execution, PipeSeal focuses strictly on **pipeline verification**:

1. **Controlled Execution:** Spins up an isolated, ephemeral in-memory database (DuckDB via `@duckdb/node-api`) to execute target SQL transformations against declared synthetic fixtures.
2. **Deterministic Assertions:** Evaluates schema contracts, nullability, uniqueness, row count bounds, custom SQL predicates, and expected output comparisons with zero ambiguity.
3. **Machine-Readable Evidence:** Generates cryptographically fingerprinted, versioned JSON verification reports (`schema_version: "1.0.0"`) that CI systems and AI agents can consume to gate pull requests.
4. **Strict Engine Security:** Locks down external filesystem and network access via DuckDB configuration (`enable_external_access = false`, `lock_configuration = true`).

---

## Implemented Verification Checks (v0.1.0)

PipeSeal provides 6 deterministic check types:

| Check Type | Description | Key Options |
|---|---|---|
| `schema` | Validates column existence, normalized type compatibility (e.g. `BIGINT` vs `INT8`), and nullability constraints. | `expect.columns`: `[{ name, type, nullable? }]` |
| `not_null` | Asserts that designated column(s) have zero nulls; collects failure count and sample diagnostics. | `columns`: `[col1, col2, ...]` |
| `unique` | Asserts that primary or composite key columns contain no duplicate groups. | `columns`: `[col1, col2, ...]` |
| `custom_sql` | Evaluates arbitrary SQL assertion queries against in-memory tables. | `sql`, `expect`: `'zero_rows' \| 'has_rows'` |
| `row_count` | Enforces inclusive lower and/or upper bounds on table row counts. | `min?`: integer, `max?`: integer |
| `output_match` | Compares actual transformation output against an expected CSV fixture. | `expected`: path, `ordered?`: boolean, `compare?`: string[] |

### Output Comparison Semantics (`output_match`)
- **Order-Independent Bag Comparison (Default, `ordered: false`):** Evaluates relational multiset equality using SQL `EXCEPT ALL`. Rows can appear in any order, but duplicates must match exactly (e.g., if actual has 2 of row X, expected must have 2 of row X).
- **Ordered Comparison (`ordered: true`):** Compares rows position-by-position, detecting the exact index of any discrepancy.
- **NULL Handling:** NULL values are compared with relational equality (`NULL === NULL`).
- **Schema Pre-Validation:** Column names and data types are validated before comparing rows.
- **Sanitized Diagnostics:** Mismatches report counts of missing and extra rows with sanitized sample failure rows.

---

## Quickstart & CLI Usage

### Installation & Build
```bash
# Install workspace dependencies
pnpm install

# Build all packages
pnpm run build

# Run test suite
pnpm test
```

### Scaffold a New Verification Pipeline
```bash
node packages/cli/dist/index.js init
```
Creates `pipeseal.verify.yml` and sample fixtures.

### Execute Verification
```bash
# Human-readable terminal output
node packages/cli/dist/index.js verify pipeseal.verify.yml

# Machine-readable JSON evidence to stdout
node packages/cli/dist/index.js verify pipeseal.verify.yml --json
```

### CLI Exit Codes
- `0`: All verification checks passed (`status: PASS`).
- `1`: One or more verification checks failed (`status: FAIL`).
- `2`: Configuration parse error, missing file, or runtime security violation (`status: ERROR`).

---

## Example Configuration (`pipeseal.verify.yml`)

```yaml
version: "1"
name: "customer-pipeline-verification"

inputs:
  - name: raw_customers
    source: ./fixtures/customers.csv
    format: csv

transformations:
  - name: clean_customers
    sql: |
      SELECT
        id,
        LOWER(TRIM(email)) AS email,
        COALESCE(name, 'Anonymous') AS name,
        created_at
      FROM raw_customers
      WHERE id IS NOT NULL

checks:
  - type: schema
    name: "verify_clean_schema"
    expect:
      columns:
        - name: id
          type: BIGINT
          nullable: false
        - name: email
          type: VARCHAR
        - name: name
          type: VARCHAR
          nullable: false
        - name: created_at
          type: TIMESTAMP

  - type: not_null
    name: "id_and_name_required"
    columns: [id, name]

  - type: unique
    name: "unique_customer_id"
    columns: [id]

  - type: custom_sql
    name: "valid_email_syntax"
    sql: |
      SELECT * FROM clean_customers
      WHERE email NOT LIKE '%@%'
    expect: zero_rows

  - type: row_count
    name: "row_count_guard"
    min: 1
    max: 100

  - type: output_match
    name: "golden_record_match"
    expected: ./fixtures/expected_customers.csv
    # Default is order-independent multiset bag comparison via SQL EXCEPT ALL.
    # For deterministic ordered comparison, specify explicit ordering columns:
    # ordered: true
    # order_by: [id]
```

---

## Model Context Protocol (MCP) Integration (v0.2.0)

PipeSeal provides a native Model Context Protocol (MCP) server (`@pipeseal/mcp`) communicating over the `stdio` transport. This allows AI coding agents (such as Google Antigravity, Claude Code, Cursor, and Windsurf) to test candidate SQL transformations, inspect schemas, and diagnose pipeline discrepancies deterministically in their local development loop.

### Available MCP Tools

| Tool | Purpose | Core Engine Mapping |
| :--- | :--- | :--- |
| `pipeseal_verify` | Run full pipeline verification against `pipeseal.verify.yml` and return structured evidence. | Calls `verifyPipeline()` |
| `pipeseal_test_sql` | Safely test candidate SQL transformations against declared synthetic fixtures. | Ephemeral `DuckDBEngine` |
| `pipeseal_inspect_schema` | Inspect column names and normalized SQL types without exposing raw datasets. | DuckDB catalog inspection |
| `pipeseal_diff_output` | Diagnose failing `output_match` assertions (missing rows, extra rows, schema mismatches). | Core `output_match` diff engine |

### Agent Client Configuration

Add PipeSeal to your project's `.agents/mcp_config.json` or client configuration:

```json
{
  "mcpServers": {
    "pipeseal": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"]
    }
  }
}
```

*Privacy note: By default, PipeSeal MCP tools omit raw dataset row values (`include_sample_values: false`) to prevent context window leakage of sensitive customer records.*

For detailed protocol specifications, error codes, and security policies, see the [MCP Integration Guide](docs/MCP.md).

---

## Documentation Index

- [Product Requirements Document (PRD)](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/PRD.md)
- [System Architecture](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/ARCHITECTURE.md)
- [Model Context Protocol (MCP) Guide](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/MCP.md)
- [Threat Model & Security Boundary](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/THREAT-MODEL.md)
- [Test Strategy & Verification Fixtures](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/TEST-STRATEGY.md)
- [Product Roadmap](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/ROADMAP.md)
- [Architectural Decisions (ADRs)](file:///c:/Users/USER/OneDrive/Desktop/pipeseal/docs/decisions)

