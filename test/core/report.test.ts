import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { verifyPipeline } from '../../packages/core/src/verifier.js';
import { sanitizeDiagnostics } from '../../packages/core/src/report/builder.js';

describe('Verification Report & Diagnostics Sanitization', () => {
  it('generates a schema-compliant verification report', async () => {
    const configPath = resolve(__dirname, '../fixtures/valid_config.yml');
    const report = await verifyPipeline(configPath);

    expect(report.schema_version).toBe('1.0.0');
    expect(report.run_id).toMatch(/^ps_run_/);
    expect(report.timestamp).toBeDefined();
    expect(report.duration_ms).toBeGreaterThanOrEqual(0);
    expect(report.config.name).toBe('valid-customer-verification');
    expect(report.config.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    expect(report.inputs.length).toBe(1);
    expect(report.inputs[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(report.inputs[0]?.row_count).toBe(5);

    expect(report.transformations.length).toBe(1);
    expect(report.transformations[0]?.name).toBe('clean_customers');
    expect(report.transformations[0]?.output_row_count).toBe(5);

    expect(report.checks.length).toBe(6);
    expect(report.summary.total_checks).toBe(6);
    expect(report.summary.passed).toBe(6);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.status).toBe('PASS');
    expect(report.exit_code).toBe(0);

    // Verify explicit limitations
    expect(report.limitations).toBeDefined();
    expect(report.limitations.length).toBeGreaterThan(0);
    expect(report.limitations.some((l) => l.includes('Unsigned report'))).toBe(true);
  });

  it('accurately sanitizes sensitive credentials and user paths from diagnostics', () => {
    const sensitive =
      'DB error: failed connecting with password=SuperSecretPassword123 and token=abc123secret at C:\\Users\\Administrator\\pipeseal';
    const sanitized = sanitizeDiagnostics(sensitive);

    expect(sanitized).not.toContain('SuperSecretPassword123');
    expect(sanitized).not.toContain('abc123secret');
    expect(sanitized).not.toContain('C:\\Users\\Administrator\\');
    expect(sanitized).toContain('password=***REDACTED***');
    expect(sanitized).toContain('token=***REDACTED***');
    expect(sanitized).toContain('<user-home>/');
  });
});
