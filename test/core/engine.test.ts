import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { DuckDBEngine } from '../../packages/core/src/engine/duckdb.js';

describe('DuckDBEngine Lifecycle & Security', () => {
  let engine: DuckDBEngine | null = null;

  afterEach(async () => {
    if (engine) {
      await engine.destroy();
      engine = null;
    }
  });

  it('initializes, loads CSV fixture, and queries table', async () => {
    engine = new DuckDBEngine();
    await engine.initialize();

    const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
    const inputMeta = await engine.loadFixture('customers', fixturePath, 'csv');

    expect(inputMeta.name).toBe('customers');
    expect(inputMeta.rowCount).toBe(5);
    expect(inputMeta.columns.map((c) => c.name)).toEqual(['id', 'name', 'email', 'created_at']);
    expect(inputMeta.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const queryRes = await engine.runQuery('SELECT COUNT(*) AS total FROM customers');
    expect(queryRes.rows[0]?.[0]).toBe(5);
  });

  it('applies security lockdown and blocks external filesystem access', async () => {
    engine = new DuckDBEngine();
    await engine.initialize();

    const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
    await engine.loadFixture('customers', fixturePath, 'csv');

    // Apply security lockdown
    await engine.lockdown();

    // Query on loaded in-memory table should succeed
    const validRes = await engine.runQuery('SELECT id, name FROM customers LIMIT 2');
    expect(validRes.rowCount).toBe(2);

    // Any attempt to read outside files via DuckDB functions must be rejected
    await expect(
      engine.runQuery("SELECT * FROM read_csv_auto('package.json')"),
    ).rejects.toThrow(/disabled by configuration|Security policy/);
  });

  it('prevents user SQL from changing locked configuration', async () => {
    engine = new DuckDBEngine();
    await engine.initialize();

    const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
    await engine.loadFixture('customers', fixturePath, 'csv');
    await engine.lockdown();

    // Attempt to re-enable external access
    await expect(
      engine.runQuery('SET enable_external_access = true'),
    ).rejects.toThrow(/configuration has been locked|Security policy/);
  });

  it('cleans up temporary staging files on destroy', async () => {
    engine = new DuckDBEngine();
    await engine.initialize();

    const fixturePath = resolve(__dirname, '../fixtures/valid_customers.csv');
    await engine.loadFixture('customers', fixturePath, 'csv');

    // Inspect private staging directory for verification
    const stagingDir = (engine as any).staging.directory;
    const statsBefore = await stat(stagingDir);
    expect(statsBefore.isDirectory()).toBe(true);

    // Teardown
    await engine.destroy();

    // Directory should no longer exist
    await expect(stat(stagingDir)).rejects.toThrow();
  });

  it('cancels running native query when timeout expires via connection.interrupt()', async () => {
    engine = new DuckDBEngine({ defaultTimeoutMs: 100 });
    await engine.initialize();

    // Heavy recursive cartesian query that would run for seconds
    const longRunningSql =
      'WITH RECURSIVE t AS (SELECT 1 as n UNION ALL SELECT n + 1 FROM t WHERE n < 10000000) SELECT count(*) FROM t, t as t2';

    const startTime = performance.now();
    await expect(engine.runQuery(longRunningSql, 100)).rejects.toThrow(
      /exceeded configured timeout|native execution interrupted/,
    );

    const elapsed = performance.now() - startTime;
    // Native execution must be cancelled near 100ms, well below completion time
    expect(elapsed).toBeLessThan(1500);

    // Engine connection remains functional after interrupt
    const healthCheck = await engine.runQuery('SELECT 100 AS status');
    expect(healthCheck.rows[0]?.[0]).toBe(100);
  });
});
