import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import yaml from "js-yaml";
import { PipeSealConfigSchema, type PipeSealConfig } from "./types.js";
import { computeHash } from "./fingerprint.js";
import { ConfigError } from "../errors.js";

export interface LoadedConfig {
  config: PipeSealConfig;
  configPath: string;
  configDir: string;
  fingerprint: string;
}

export async function loadConfigFile(
  configPath: string,
): Promise<LoadedConfig> {
  const absolutePath = resolve(process.cwd(), configPath);
  let rawContent: string;
  try {
    rawContent = await readFile(absolutePath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(
      `Failed to read configuration file at ${configPath}: ${message}`,
      err,
    );
  }

  let parsed: unknown;
  try {
    if (absolutePath.endsWith(".json")) {
      parsed = JSON.parse(rawContent);
    } else {
      parsed = yaml.load(rawContent);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(
      `Failed to parse configuration syntax: ${message}`,
      err,
    );
  }

  const result = PipeSealConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issueSummary = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "root"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(
      `Configuration validation failed:\n${issueSummary}`,
      result.error.issues,
    );
  }

  const fingerprint = computeHash(rawContent);
  const configDir = dirname(absolutePath);

  // Normalize relative input sources to configDir
  const normalizedInputs = result.data.inputs.map((input) => ({
    ...input,
    source: resolve(configDir, input.source),
  }));

  // Normalize relative expected fixture paths in output_match checks
  const normalizedChecks = result.data.checks.map((check) => {
    if (check.type === "output_match") {
      return {
        ...check,
        expected: resolve(configDir, check.expected),
      };
    }
    return check;
  });

  return {
    config: {
      ...result.data,
      inputs: normalizedInputs,
      checks: normalizedChecks,
    },
    configPath: absolutePath,
    configDir,
    fingerprint,
  };
}
