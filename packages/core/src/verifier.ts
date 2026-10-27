import { loadConfigFile, type LoadedConfig } from "./config/loader.js";
import { type PipeSealConfig } from "./config/types.js";
import { DuckDBEngine, type DuckDBEngineOptions } from "./engine/duckdb.js";
import {
  type InputMetadata,
  type TransformationResult,
} from "./engine/types.js";
import { runChecks } from "./checks/runner.js";
import { buildVerificationReport } from "./report/builder.js";
import { type VerificationReport } from "./report/types.js";
import { computeHash } from "./config/fingerprint.js";

export interface VerifyOptions {
  engineOptions?: DuckDBEngineOptions;
}

export async function verifyPipeline(
  configOrPath: PipeSealConfig | string,
  options: VerifyOptions = {},
): Promise<VerificationReport> {
  const overallStart = performance.now();

  let config: PipeSealConfig;
  let configFingerprint: string;

  if (typeof configOrPath === "string") {
    const loaded: LoadedConfig = await loadConfigFile(configOrPath);
    config = loaded.config;
    configFingerprint = loaded.fingerprint;
  } else {
    config = configOrPath;
    configFingerprint = computeHash(JSON.stringify(config));
  }

  const engine = new DuckDBEngine(options.engineOptions);
  try {
    await engine.initialize();

    // 1. Load declared input fixtures
    const inputs: InputMetadata[] = [];
    for (const input of config.inputs) {
      const inputMeta = await engine.loadFixture(
        input.name,
        input.source,
        input.format,
      );
      inputs.push(inputMeta);
    }

    // 1b. Load declared expected output fixtures for output_match checks
    const expectedTables = new Map<string, string>();
    let expectedIndex = 0;
    for (const check of config.checks) {
      if (
        check.type === "output_match" &&
        !expectedTables.has(check.expected)
      ) {
        const expectedTableName = `_expected_${expectedIndex++}`;
        await engine.loadFixture(expectedTableName, check.expected, "csv");
        expectedTables.set(check.expected, expectedTableName);
      }
    }

    // 2. Lock down engine security (disables external reads/writes/ATTACH/config changes)
    await engine.lockdown();

    // 3. Execute transformations
    const transformations: TransformationResult[] = [];
    for (const trans of config.transformations) {
      const transResult = await engine.executeTransformation(
        trans.name,
        trans.sql,
      );
      transformations.push(transResult);
    }

    // 4. Run verification checks
    const defaultTargetTable = config.transformations[0]?.name ?? "";
    const checkResults = await runChecks(config.checks, {
      engine,
      defaultTargetTable,
      expectedTables,
    });

    const totalDurationMs = performance.now() - overallStart;

    // 5. Build report
    return buildVerificationReport({
      configName: config.name,
      configFingerprint,
      inputs,
      transformations,
      checks: checkResults,
      totalDurationMs,
    });
  } finally {
    // 6. Guarantee resource cleanup
    await engine.destroy();
  }
}
