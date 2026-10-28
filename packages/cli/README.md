# pipeseal

> TypeScript-native, deterministic data-pipeline verification CLI runtime.

`pipeseal` is the official command-line interface for the **PipeSeal** verification engine. It enables data engineers and CI/CD pipelines to verify data transformations against declared synthetic fixtures and assertions deterministically in an ephemeral DuckDB runtime.

---

## Installation

```bash
# Global installation
npm install -g pipeseal

# Or invoke directly via npx without installation
npx pipeseal --help
```

---

## Commands & Usage

### 1. `pipeseal verify [config-path]`

Runs full deterministic verification of the declared pipeline specification.

```bash
# Verify using the default configuration (pipeseal.verify.yml)
pipeseal verify

# Verify a specific configuration file
pipeseal verify path/to/my-pipeline.verify.yml

# Emit machine-readable JSON report for CI/CD ingestion
pipeseal verify --json

# Set a custom execution timeout in milliseconds (default: 30000)
pipeseal verify --timeout 15000
```

### Options

| Option               | Description                                                           |
| :------------------- | :-------------------------------------------------------------------- |
| `-j, --json`         | Output machine-readable JSON evidence report instead of terminal text |
| `-t, --timeout <ms>` | Execution timeout in milliseconds (default: `30000`, max: `60000`)    |
| `-V, --version`      | Output the version number                                             |
| `-h, --help`         | Display help for command                                              |

---

## Standard POSIX Exit Codes

`pipeseal` implements standard POSIX exit codes suitable for CI/CD gates:

| Exit Code | Meaning                                                                                                               | Action in CI               |
| :-------: | :-------------------------------------------------------------------------------------------------------------------- | :------------------------- |
|  **`0`**  | **PASS:** All inputs loaded, transformations executed, and assertions satisfied.                                      | Pipeline proceeds          |
|  **`1`**  | **FAIL:** Pipeline executed, but one or more assertions failed (e.g., null violation, row count out of range).        | Pipeline fails truthfully  |
|  **`2`**  | **ERROR:** Execution or configuration error (invalid YAML schema, syntax error, path security violation, or timeout). | Configuration/runner error |

---

## Configuration Example (`pipeseal.verify.yml`)

```yaml
version: "1"
name: "order_processing"

inputs:
  - name: "raw_orders"
    source: "fixtures/orders.csv"
    format: "csv"

transformations:
  - name: "cleaned_orders"
    sql: |
      SELECT 
        CAST(order_id AS BIGINT) AS order_id,
        CAST(customer_id AS BIGINT) AS customer_id,
        CAST(amount AS DECIMAL(10,2)) AS amount
      FROM raw_orders
      WHERE amount > 0

checks:
  - name: "not_null_order_id"
    type: "not_null"
    targetTable: "cleaned_orders"
    columns: ["order_id"]

  - name: "unique_order_id"
    type: "unique"
    targetTable: "cleaned_orders"
    columns: ["order_id"]

  - name: "orders_row_count"
    type: "row_count"
    targetTable: "cleaned_orders"
    min: 1
    max: 100000
```

### Passing Output Example

```text
[PASS] Pipeline 'order_processing' verified successfully in 64ms.
  ✓ not_null_order_id: pass (0 null violations)
  ✓ unique_order_id: pass (0 duplicate groups)
  ✓ orders_row_count: pass (150 rows within [1, 100000])
Evidence report: 3/3 checks passed.
```

### Failing Output Example (Exit Code 1)

```text
[FAIL] Pipeline 'order_processing' verification failed (1/3 failed in 58ms):
  ✓ not_null_order_id: pass
  ✗ unique_order_id: fail
      Found 2 duplicate groups for columns [order_id]
  ✓ orders_row_count: pass
```

---

## License

Apache-2.0. See [LICENSE](./LICENSE) for details.
