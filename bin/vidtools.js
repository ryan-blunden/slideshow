#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const launcherDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(launcherDir, "..");
const tsxBin = path.join(packageRoot, "node_modules", ".bin", "tsx");
const cliScript = path.join(packageRoot, "scripts", "cli.ts");

const result = spawnSync(tsxBin, [cliScript, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
