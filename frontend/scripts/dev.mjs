#!/usr/bin/env node
/**
 * frontend/scripts/dev.mjs — `npm run dev` wrapper.
 *
 * Reads the port from frontend/.env.local's NEXT_PUBLIC_SITE_URL so port +
 * env var can never drift apart (the bug behind the "Next bumped to :3001
 * but env still said :3000" mystery).
 *
 * Default if NEXT_PUBLIC_SITE_URL is missing or unparseable: 3333.
 *
 * Boots Next with --port <derived> --turbopack. Fails fast if the port is
 * already in use (Next's default behaviour with an explicit --port).
 *
 * To change the port for THIS project: edit NEXT_PUBLIC_SITE_URL in
 * .env.local — e.g. `http://localhost:5577` — that's the ONLY change needed.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "..");
const envFile = join(frontendDir, ".env.local");

const DEFAULT_PORT = 3333;

function parsePortFromEnvLocal() {
  if (!existsSync(envFile)) return null;
  const content = readFileSync(envFile, "utf8");
  const match = content.match(/^NEXT_PUBLIC_SITE_URL=(.*)$/m);
  if (!match) return null;
  const raw = match[1].trim().replace(/^["']|["']$/g, "");
  try {
    const url = new URL(raw);
    if (url.port) return Number(url.port);
    // No explicit port → http defaults to 80, https to 443; treat as "use default"
    return null;
  } catch {
    return null;
  }
}

const port = parsePortFromEnvLocal() ?? DEFAULT_PORT;

console.log(`\x1b[36mℹ\x1b[0m dev server → port ${port} (from NEXT_PUBLIC_SITE_URL in .env.local${port === DEFAULT_PORT ? ", default fallback" : ""})`);

const child = spawn("npx", ["next", "dev", "--port", String(port)], {
  cwd: frontendDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
