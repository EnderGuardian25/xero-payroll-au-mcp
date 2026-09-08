#!/usr/bin/env node
/**
 * Rejects a staged fixture file containing a TFN, BSB or bank account number.
 *
 * Why this runs at commit time and not only in CI: PII in a git history can
 * only be remedied by rewriting that history, and this repo's fork strategy
 * spends that remedy on keeping upstream mergeable. Once a real tax file number
 * is committed and pushed, the recovery path is a coordinated rewrite across
 * every clone — the least reversible option available. So the check has to land
 * before the object exists, not after.
 *
 * It shares pii-matcher with Guard B rather than reimplementing detection, so
 * the two cannot drift (spec FR7d, FR10).
 *
 * Requires `npm run build`. If dist/ is missing the hook says so and fails
 * closed rather than waving the commit through.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolved from this file's own location, not the working directory: a git hook
// can be invoked from any subdirectory of the repo, and a dynamic import()
// resolves relative to the importing module rather than to cwd.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MATCHER_PATH = join(REPO, "dist", "__guards__", "pii-matcher.js");
const MATCHER = pathToFileURL(MATCHER_PATH).href;

if (!existsSync(MATCHER_PATH)) {
  console.error(
    "pre-commit: dist/ not built, so staged fixtures cannot be scanned.\n" +
      "Run `npm run build` and commit again. Failing closed — an unscanned\n" +
      "fixture is exactly what this hook exists to stop.",
  );
  process.exit(1);
}

const { findPii } = await import(MATCHER);

const staged = execSync("git diff --cached --name-only --diff-filter=ACM", {
  encoding: "utf8",
  cwd: REPO,
})
  .split("\n")
  .map((f) => f.trim())
  .filter((f) => f.startsWith("fixtures/"));

let failed = false;

for (const file of staged) {
  const absolute = join(REPO, file);
  if (!existsSync(absolute)) continue;
  const findings = findPii(readFileSync(absolute, "utf8"));
  if (findings.length === 0) continue;

  failed = true;
  // Report the kind and the path only. Echoing the value would put the very
  // thing we are refusing to commit into a terminal and a shell history
  // (CLAUDE.md rule 4).
  console.error(`pre-commit: ${file} contains PII:`);
  for (const f of findings) {
    console.error(`  ${f.kind} at ${f.path || "<root>"}`);
  }
}

if (failed) {
  console.error(
    "\nRefusing the commit. Fixtures must be redacted at capture, and raw\n" +
      "recordings belong in fixtures/raw/, which is git-ignored.",
  );
  process.exit(1);
}
