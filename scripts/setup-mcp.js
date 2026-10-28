#!/usr/bin/env node

/**
 * PipeSeal MCP Configuration Setup
 * Generates a local, machine-specific .agents/mcp_config.json for Antigravity IDE
 * without exposing personal absolute paths to version control.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const configDir = path.join(repoRoot, ".agents");
const targetConfig = path.join(configDir, "mcp_config.json");

const isForce = process.argv.includes("--force") || process.argv.includes("-f");

if (fs.existsSync(targetConfig) && !isForce) {
  console.log(`[setup-mcp] Configuration already exists at ${targetConfig}`);
  console.log(`[setup-mcp] Pass --force to regenerate with the current repository path.`);
  process.exit(0);
}

if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// Format canonical forward-slash path across Windows, macOS, and Linux
const normalizedRepoRoot = repoRoot.replace(/\\/g, "/");
const entryPointFsPath = path.join(repoRoot, "packages", "mcp", "dist", "index.js");
const normalizedEntryPoint = `${normalizedRepoRoot}/packages/mcp/dist/index.js`;

if (!fs.existsSync(entryPointFsPath)) {
  console.warn(
    `[setup-mcp] Note: Built entry point not found at ${entryPointFsPath}.\n` +
      `[setup-mcp] Please ensure you run 'pnpm run build' before launching the MCP server in Antigravity.`
  );
}

const config = {
  mcpServers: {
    pipeseal: {
      command: "node",
      args: [
        normalizedEntryPoint,
        "--project-root",
        normalizedRepoRoot,
      ],
    },
  },
};

fs.writeFileSync(targetConfig, JSON.stringify(config, null, 2) + "\n", "utf8");

console.log(`[setup-mcp] Successfully generated ${targetConfig}`);
console.log(`[setup-mcp] Entry point: ${normalizedEntryPoint}`);
console.log(`[setup-mcp] Project root: ${normalizedRepoRoot}`);
