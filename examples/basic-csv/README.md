# PipeSeal Example — Basic CSV Verification

This example demonstrates PipeSeal verifying a SQL transformation against a synthetic CSV fixture in an in-memory DuckDB environment.

## Running the Demonstration

From the repository root:

### 1. Human-Readable Terminal Verification (Passing Run)
```bash
node packages/cli/dist/index.js verify examples/basic-csv/pipeseal.verify.yml
```
**Expected outcome:** Exits with code `0`, displays passing status badges for all 4 checks (`schema`, `not_null`, `unique`, `custom_sql`).

---

### 2. Machine-Readable JSON Evidence Output
```bash
node packages/cli/dist/index.js verify examples/basic-csv/pipeseal.verify.yml --json
```
**Expected outcome:** Emits a versioned JSON report (`schema_version: "1.0.0"`) with input file SHA-256 fingerprints, transformation fingerprints, check outcomes, and explicit limitations.

---

### 3. Reproducing an Injected Failure
You can deliberately introduce a failure to verify that PipeSeal truthfully catches violations.
Run against one of the negative test fixtures:

```bash
node packages/cli/dist/index.js verify test/fixtures/failing_null_config.yml
```
**Expected outcome:** Exits with code `1`, displaying the exact column containing nulls and sample failure rows.
