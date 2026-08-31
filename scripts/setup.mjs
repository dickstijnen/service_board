#!/usr/bin/env node
/**
 * `npm run setup` — the green button for a fresh clone.
 *
 * What it does:
 *   1. Generates fresh per-project Strapi secrets (crypto.randomBytes — never reused across projects)
 *   2. Copies backend/.env.example → backend/.env and fills the secrets in
 *   3. Copies frontend/.env.local.example → frontend/.env.local with sane local defaults + a generated REVALIDATE_SECRET
 *   4. Refuses to overwrite existing files (idempotent — safe to re-run any time)
 *   5. Prints the generated REVALIDATE_SECRET and a "what's left for you" checklist
 *
 * What it does NOT do (deliberately — these are platform clicks, no script can do them safely):
 *   - Install dependencies (npm install)
 *   - Create the Strapi admin user
 *   - Add locales / grant Public role permissions
 *   - Touch any cloud account (DO, Vercel, Spaces)
 *   - Run the dev server
 *
 * If you want to regenerate: delete backend/.env and/or frontend/.env.local first, then re-run.
 */

import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Paths ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const backendEnvExample = join(repoRoot, "backend", ".env.example");
const backendEnv = join(repoRoot, "backend", ".env");
const frontendEnvExample = join(repoRoot, "frontend", ".env.local.example");
const frontendEnv = join(repoRoot, "frontend", ".env.local");

// ── Tiny terminal helpers ───────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", red: "\x1b[31m",
};
const log = (msg) => console.log(msg);
const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const skip = (msg) => console.log(`${c.yellow}↷${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}ℹ${c.reset} ${msg}`);
const fail = (msg) => console.error(`${c.red}✗${c.reset} ${msg}`);

// ── Secret generators ───────────────────────────────────────────────────────
/** A single base64 secret. Strapi expects base64 for all its core secrets. */
const b64 = (bytes = 32) => crypto.randomBytes(bytes).toString("base64");
/** Hex secret — used for REVALIDATE_SECRET (also goes in the Strapi webhook header). */
const hex = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

// ── .env file munger ────────────────────────────────────────────────────────
/**
 * For each [key, value] in `pairs`: if a line starting with `key=` exists in `content`, set its value;
 * otherwise leave content untouched (the env.example is the source of truth for which keys exist).
 * Preserves comments, blank lines, and ordering.
 */
function fillEnvValues(content, pairs) {
  let out = content;
  for (const [key, value] of pairs) {
    const re = new RegExp(`^(${key}=).*$`, "m");
    if (re.test(out)) {
      out = out.replace(re, `$1${value}`);
    }
    // If a key isn't in the example file, we intentionally do nothing — example is the contract.
  }
  return out;
}

// ── Step 1: backend/.env ────────────────────────────────────────────────────
function writeBackendEnv() {
  if (!existsSync(backendEnvExample)) {
    fail(`Missing ${backendEnvExample}`);
    process.exit(1);
  }
  if (existsSync(backendEnv)) {
    skip(`backend/.env already exists — leaving it alone (delete it and re-run to regenerate)`);
    return null;
  }

  const example = readFileSync(backendEnvExample, "utf8");

  // Strapi wants APP_KEYS as comma-joined; the rest are single base64 strings.
  const secrets = [
    ["APP_KEYS", [b64(), b64()].join(",")],
    ["API_TOKEN_SALT", b64()],
    ["ADMIN_JWT_SECRET", b64()],
    ["TRANSFER_TOKEN_SALT", b64()],
    ["JWT_SECRET", b64()],
    ["ENCRYPTION_KEY", b64()],
  ];

  const filled = fillEnvValues(example, secrets);
  writeFileSync(backendEnv, filled, "utf8");
  ok(`Wrote backend/.env with fresh Strapi secrets (APP_KEYS, JWT_SECRET, ENCRYPTION_KEY, etc.)`);
  return secrets;
}

// ── Step 2: frontend/.env.local ─────────────────────────────────────────────
function writeFrontendEnv() {
  if (!existsSync(frontendEnvExample)) {
    fail(`Missing ${frontendEnvExample}`);
    process.exit(1);
  }
  if (existsSync(frontendEnv)) {
    skip(`frontend/.env.local already exists — leaving it alone (delete it and re-run to regenerate)`);
    return null;
  }

  const example = readFileSync(frontendEnvExample, "utf8");
  const revalidateSecret = hex();

  const defaults = [
    ["NEXT_PUBLIC_STRAPI_URL", "http://localhost:1337"],
    ["NEXT_PUBLIC_SITE_URL", "http://localhost:3333"],
    ["REVALIDATE_SECRET", revalidateSecret],
  ];

  const filled = fillEnvValues(example, defaults);
  writeFileSync(frontendEnv, filled, "utf8");
  ok(`Wrote frontend/.env.local with local defaults + generated REVALIDATE_SECRET`);
  return { revalidateSecret };
}

// ── What's left for the human ───────────────────────────────────────────────
function printChecklist(frontendResult) {
  const sep = `${c.dim}${"─".repeat(70)}${c.reset}`;

  log("");
  log(sep);
  log(`${c.bold}${c.green}Setup complete.${c.reset} What's left for you (script can't do these):`);
  log(sep);

  if (frontendResult?.revalidateSecret) {
    log("");
    log(`${c.bold}REVALIDATE_SECRET (use this exact value in the Strapi webhook later):${c.reset}`);
    log(`${c.cyan}${frontendResult.revalidateSecret}${c.reset}`);
  }

  log("");
  log(`${c.bold}1. Install deps${c.reset}        — cd backend && npm install   /   cd frontend && npm install`);
  log(`${c.bold}2. 🔧 Boot Strapi${c.reset}      — cd backend && npm run develop  (then open http://localhost:1337/admin)`);
  log(`${c.bold}3. 🔧 In Strapi admin${c.reset}  — create admin user → Settings → Internationalization → add 'en'`);
  log(`${c.bold}4. 🔧 Public role${c.reset}      — Settings → Users & Permissions → Public → tick find + findOne on Page + Global → Save`);
  log(`${c.bold}5. 🔧 Webhook${c.reset}          — Settings → Webhooks → New → URL: http://localhost:3333/api/revalidate`);
  log(`                       Header: key "secret", value = the REVALIDATE_SECRET above`);
  log(`                       Events: all five Entry events  ·  Media: off`);
  log(`${c.bold}6. ⚙️  Boot frontend${c.reset}   — cd frontend && npm run dev   (http://localhost:3333)`);
  log("");
  log(`${c.dim}Full walkthrough lives in the runbook (see docs at repo root).${c.reset}`);
  log(sep);
  log("");
}

// ── Run ─────────────────────────────────────────────────────────────────────
log(`${c.bold}strapi-web-boilerplate setup${c.reset}`);
log("");
info(`Generating env files. Existing files will NOT be overwritten.`);
log("");

writeBackendEnv();
const frontendResult = writeFrontendEnv();
printChecklist(frontendResult);
