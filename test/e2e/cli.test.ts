import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const cliPath = resolve(__dirname, '../../packages/cli/dist/index.js');

describe('pipeseal CLI End-to-End', () => {
  it('exits with code 0 on valid pipeline verification', async () => {
    const configPath = resolve(__dirname, '../fixtures/valid_config.yml');
    const { stdout, stderr } = await execFileAsync('node', [cliPath, 'verify', configPath]);

    expect(stderr).toBe('');
    expect(stdout).toContain('PipeSeal Pipeline Verification');
    expect(stdout).toContain('PASS');
    expect(stdout).toContain('6/6 checks passed');
  });

  it('outputs valid JSON report with --json flag and exits with code 0', async () => {
    const configPath = resolve(__dirname, '../fixtures/valid_config.yml');
    const { stdout } = await execFileAsync('node', [cliPath, 'verify', configPath, '--json']);

    const report = JSON.parse(stdout);
    expect(report.schema_version).toBe('1.0.0');
    expect(report.config.name).toBe('valid-customer-verification');
    expect(report.summary.status).toBe('PASS');
    expect(report.exit_code).toBe(0);
    expect(report.checks.length).toBe(6);
  });

  it('exits with code 1 when verification checks fail (null violation)', async () => {
    const configPath = resolve(__dirname, '../fixtures/failing_null_config.yml');

    try {
      await execFileAsync('node', [cliPath, 'verify', configPath]);
      expect.unreachable('CLI should have exited with code 1');
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stdout).toContain('FAIL');
      expect(err.stdout).toContain('assert_no_null_ids');
    }
  });

  it('exits with code 1 when schema checks fail', async () => {
    const configPath = resolve(__dirname, '../fixtures/failing_schema_config.yml');

    try {
      await execFileAsync('node', [cliPath, 'verify', configPath]);
      expect.unreachable('CLI should have exited with code 1');
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stdout).toContain('FAIL');
      expect(err.stdout).toContain('Missing columns: tax_identifier');
    }
  });

  it('exits with code 2 on configuration error (invalid syntax / missing fields)', async () => {
    const configPath = resolve(__dirname, '../fixtures/invalid_syntax_config.yml');

    try {
      await execFileAsync('node', [cliPath, 'verify', configPath]);
      expect.unreachable('CLI should have exited with code 2');
    } catch (err: any) {
      expect(err.code).toBe(2);
      expect(err.stderr).toContain('[CONFIG_ERROR]');
    }
  });

  it('exits with code 2 when SQL attempts filesystem escape', async () => {
    const configPath = resolve(__dirname, '../fixtures/failing_security_escape_config.yml');

    try {
      await execFileAsync('node', [cliPath, 'verify', configPath]);
      expect.unreachable('CLI should have exited with code 2');
    } catch (err: any) {
      expect(err.code).toBe(2);
      expect(err.stderr).toContain('Security policy violation');
    }
  });

  it('meets performance target budget (< 1500ms total process latency)', async () => {
    const configPath = resolve(__dirname, '../fixtures/valid_config.yml');
    const start = performance.now();
    const { stdout } = await execFileAsync('node', [cliPath, 'verify', configPath, '--json']);
    const elapsedMs = performance.now() - start;

    const report = JSON.parse(stdout);
    expect(report.exit_code).toBe(0);
    // Cold CLI invocation (Node VM startup + DuckDB native load + execution + JSON parse)
    expect(elapsedMs).toBeLessThan(1500);
  });
});
