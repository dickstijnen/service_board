#!/usr/bin/env node
/**
 * frontend/scripts/start.mjs — `npm start` wrapper.
 *
 * Production server binds to port 4444. Dev (`scripts/dev.mjs`) still reads
 * NEXT_PUBLIC_SITE_URL from .env.local — so you can run dev and production
 * side-by-side without a port clash.
 *
 * Boots `next start` with --port 4444. Fails fast if the port is already in use.
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "..");

const PORT = 4444;

console.log(`\x1b[36mℹ\x1b[0m production server → port ${PORT}`);

const child = spawn("npx", ["next", "start", "--port", String(PORT)], {
  cwd: frontendDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
