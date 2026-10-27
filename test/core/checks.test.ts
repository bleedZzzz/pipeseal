import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { DuckDBEngine } from '../../packages/core/src/engine/duckdb.js';
import { runSchemaCheck } from '../../packages/core/src/checks/schema.js';
import { runNotNullCheck } from '../../packages/core/src/checks/not_null.js';
import { runUniqueCheck } from '../../packages/core/src/checks/unique.js';
import { runCustomSqlCheck } from '../../packages/core/src/checks/custom_sql.js';
import { runRowCountCheck } from '../../packages/core/src/checks/row_count.js';
import { runOutputMatchCheck } from '../../packages/core/src/checks/output_match.js';

describe('Verification Checks Engine', () => {
  let engine: DuckDBEngine;

  beforeEach(async () => {
    engine = new DuckDBEngine();
    await engine.initialize();
  });

  afterEach(async () => {
    await engine.destroy();
  });

  describe('Schema Validation', () => {
    it('passes when schema matches declared expectations', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runSchemaCheck(
        {
          type: 'schema',
          expect: {
            columns: [
              { name: 'id', type: 'BIGINT', nullable: false },
              { name: 'name', type: 'VARCHAR', nullable: false },
              { name: 'email', type: 'VARCHAR' },
            ],
          },
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('pass');
      expect(result.diagnostics).toBeUndefined();
    });

    it('fails when an expected column is missing', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runSchemaCheck(
        {
          type: 'schema',
          expect: {
            columns: [
              { name: 'id', type: 'BIGINT' },
              { name: 'phone_number', type: 'VARCHAR' },
            ],
          },
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('Missing columns: phone_number');
    });

    it('fails when column types are incompatible', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runSchemaCheck(
        {
          type: 'schema',
          expect: {
            columns: [{ name: 'id', type: 'BOOLEAN' }],
          },
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('Type mismatches');
    });
  });

  describe('Not-Null Assertion', () => {
    it('passes when no null values exist in checked columns', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runNotNullCheck(
        {
          type: 'not_null',
          columns: ['id', 'email'],
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('pass');
    });

    it('fails and extracts sample diagnostics when nulls are found', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/customers_with_nulls.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runNotNullCheck(
        {
          type: 'not_null',
          columns: ['id', 'email', 'name'],
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('Column "id" contained 1 NULL');
      expect(result.diagnostics).toContain('Column "email" contained 1 NULL');
      expect(result.diagnostics).toContain('Column "name" contained 1 NULL');
      expect(result.sampleFailures).toBeDefined();
      expect(result.sampleFailures!.length).toBeGreaterThan(0);
    });
  });

  describe('Uniqueness Assertion', () => {
    it('passes on unique data', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runUniqueCheck(
        {
          type: 'unique',
          columns: ['id'],
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('pass');
    });

    it('fails when duplicates exist and reports count and sample keys', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/customers_with_dupes.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runUniqueCheck(
        {
          type: 'unique',
          columns: ['id'],
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('duplicate group');
      expect(result.sampleFailures).toBeDefined();
      expect(result.sampleFailures![0]).toContain('Duplicate keys [id] = [1]');
    });
  });

  describe('Custom SQL Assertion', () => {
    it('passes when query returns zero rows for expect: zero_rows', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runCustomSqlCheck(
        {
          type: 'custom_sql',
          name: 'all_emails_have_at',
          sql: "SELECT * FROM customers WHERE email NOT LIKE '%@%'",
          expect: 'zero_rows',
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('pass');
    });

    it('fails when query returns rows for expect: zero_rows', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runCustomSqlCheck(
        {
          type: 'custom_sql',
          name: 'find_specific_name',
          sql: "SELECT * FROM customers WHERE name = 'Alice Smith'",
          expect: 'zero_rows',
        },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('expected 0 failing rows, but returned 1 row(s)');
      expect(result.sampleFailures?.length).toBe(1);
    });
  });

  describe('Row Count Assertion', () => {
    it('passes on exact boundary matching', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runRowCountCheck(
        { type: 'row_count', min: 5, max: 5 },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('pass');
      expect(result.details.actualCount).toBe(5);
    });

    it('passes when row count is within min and max', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runRowCountCheck(
        { type: 'row_count', min: 1, max: 10 },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('pass');
    });

    it('passes when only min or only max is specified and satisfied', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const resMin = await runRowCountCheck(
        { type: 'row_count', min: 3 },
        { engine, defaultTargetTable: 'customers' },
      );
      expect(resMin.status).toBe('pass');

      const resMax = await runRowCountCheck(
        { type: 'row_count', max: 8 },
        { engine, defaultTargetTable: 'customers' },
      );
      expect(resMax.status).toBe('pass');
    });

    it('fails when count is below min', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runRowCountCheck(
        { type: 'row_count', min: 10 },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('is less than minimum required 10');
    });

    it('fails when count is above max', async () => {
      const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers', fixturePath, 'csv');
      await engine.lockdown();

      const result = await runRowCountCheck(
        { type: 'row_count', max: 3 },
        { engine, defaultTargetTable: 'customers' },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('is greater than maximum allowed 3');
    });
  });

  describe('Output Match Assertion', () => {
    it('passes on exact matching expected CSV in default order-independent mode', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      const expectedPath = resolve(__dirname, '../fixtures/expected_customers.csv');

      await engine.loadFixture('actual_t', actualPath, 'csv');
      await engine.loadFixture('expected_t', expectedPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[expectedPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: expectedPath,
          ordered: false,
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('pass');
      expect(result.details.missingCount).toBe(0);
      expect(result.details.extraCount).toBe(0);
    });

    it('passes on permuted rows when ordered: false (order-independent)', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      const permutedPath = resolve(__dirname, '../fixtures/expected_customers_permuted.csv');

      await engine.loadFixture('actual_t', actualPath, 'csv');
      await engine.loadFixture('expected_t', permutedPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[permutedPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: permutedPath,
          ordered: false,
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('pass');
    });

    it('rejects ordered comparison without explicit order_by columns', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      const permutedPath = resolve(__dirname, '../fixtures/expected_customers_permuted.csv');

      await engine.loadFixture('actual_t', actualPath, 'csv');
      await engine.loadFixture('expected_t', permutedPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[permutedPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: permutedPath,
          ordered: true,
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain(
        "Deterministic ordered comparison requires explicit 'order_by' columns with tie-breakers",
      );
    });

    it('passes ordered comparison with explicit order_by and tie-breakers on matching data', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      const expectedPath = resolve(__dirname, '../fixtures/expected_customers.csv');

      await engine.loadFixture('actual_t', actualPath, 'csv');
      await engine.loadFixture('expected_t', expectedPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[expectedPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: expectedPath,
          ordered: true,
          order_by: ['id'],
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('pass');
      expect(result.details.ordered).toBe(true);
      expect(result.details.matchedRows).toBe(5);
    });

    it('fails and extracts samples on value mismatch', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      const mismatchPath = resolve(__dirname, '../fixtures/expected_customers_mismatched_val.csv');

      await engine.loadFixture('actual_t', actualPath, 'csv');
      await engine.loadFixture('expected_t', mismatchPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[mismatchPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: mismatchPath,
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('Output comparison mismatch');
      expect(result.sampleFailures?.some((s) => s.includes('alice.wrong@example.com'))).toBe(true);
    });

    it('fails when expected fixture has extra rows (missing in actual)', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      const extraPath = resolve(__dirname, '../fixtures/expected_customers_extra_row.csv');

      await engine.loadFixture('actual_t', actualPath, 'csv');
      await engine.loadFixture('expected_t', extraPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[extraPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: extraPath,
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('1 missing row(s)');
      expect(result.sampleFailures?.some((s) => s.includes('Frank Miller'))).toBe(true);
    });

    it('detects duplicate row count mismatches (bag semantics)', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      const dupesPath = resolve(__dirname, '../fixtures/expected_customers_with_dupes.csv');

      await engine.loadFixture('actual_t', actualPath, 'csv');
      await engine.loadFixture('expected_t', dupesPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[dupesPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: dupesPath,
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('fail');
      expect(result.details.missingCount).toBe(1);
    });

    it('detects schema mismatch before row comparison', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      const schemaMismatchPath = resolve(__dirname, '../fixtures/expected_customers_schema_mismatch.csv');

      await engine.loadFixture('actual_t', actualPath, 'csv');
      await engine.loadFixture('expected_t', schemaMismatchPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[schemaMismatchPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: schemaMismatchPath,
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('fail');
      expect(result.diagnostics).toContain('Schema mismatch before row comparison');
    });

    it('correctly compares rows containing NULL values without false mismatches', async () => {
      const nullPath = resolve(__dirname, '../fixtures/expected_customers_with_null.csv');

      await engine.loadFixture('actual_t', nullPath, 'csv');
      await engine.loadFixture('expected_t', nullPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[nullPath, 'expected_t']]);
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: nullPath,
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('pass');
    });

    it('breaks ties deterministically when duplicate sort keys exist in order_by', async () => {
      const dupesPath = resolve(__dirname, '../fixtures/customers_with_dupes.csv');

      await engine.loadFixture('actual_t', dupesPath, 'csv');
      await engine.loadFixture('expected_t', dupesPath, 'csv');
      await engine.lockdown();

      const expectedTables = new Map([[dupesPath, 'expected_t']]);
      // All rows have same order_by key or duplicates; tie-breaker on remaining columns resolves exact positions
      const result = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: dupesPath,
          ordered: true,
          order_by: ['name'],
        },
        { engine, defaultTargetTable: 'actual_t', expectedTables },
      );

      expect(result.status).toBe('pass');
      expect(result.details.ordered).toBe(true);
    });

    it('regression: aggregation queries produce stable verification via multiset comparison and explicit order_by', async () => {
      const actualPath = resolve(__dirname, '../fixtures/valid_customers.csv');
      await engine.loadFixture('customers_raw', actualPath, 'csv');
      // Create aggregated table where DuckDB row emission order is not guaranteed by physical storage
      await engine.executeTransformation(
        'customers_agg',
        'SELECT name, count(*) as cnt FROM customers_raw GROUP BY name',
      );
      await engine.executeTransformation(
        'expected_agg',
        'SELECT name, count(*) as cnt FROM customers_raw GROUP BY name',
      );
      await engine.lockdown();

      const expectedTables = new Map([['expected_agg_path', 'expected_agg']]);

      // 1. Multiset comparison passes regardless of group emission order
      const resUnordered = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: 'expected_agg_path',
          target: 'customers_agg',
        },
        { engine, defaultTargetTable: 'customers_agg', expectedTables },
      );
      expect(resUnordered.status).toBe('pass');

      // 2. Explicit order_by enforces deterministic ordered comparison on aggregation results
      const resOrdered = await runOutputMatchCheck(
        {
          type: 'output_match',
          expected: 'expected_agg_path',
          target: 'customers_agg',
          ordered: true,
          order_by: ['name ASC'],
        },
        { engine, defaultTargetTable: 'customers_agg', expectedTables },
      );
      expect(resOrdered.status).toBe('pass');
      expect(resOrdered.details.ordered).toBe(true);
    });
  });
});
