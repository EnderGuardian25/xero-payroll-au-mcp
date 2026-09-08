# Tasks: Fork, strip every write tool, and stand up both CI guards

**Change:** 001-fork-strip-writes-guards
**Created:** 2026-09-08
**Total Tasks:** 15

## Summary

14 tasks in 5 waves. Wave 1 lands the fork and proves it builds. Wave 2 strips 33 tools and breaks
the module-load credential seam — the prerequisite for every guard. Wave 3 builds the shared
primitives the guards stand on. Wave 4 builds the three guards and their permanent negative
controls. Wave 5 wires CI, the fixture policy and the docs.

Ordering rationale: the credential seam (T5) gates everything after it, because a guard that cannot
import the registry cannot boot, and a guard that cannot boot either gets skipped or passes on an
empty set. The negative controls (T11) land in the same wave as the guards so no guard is ever
committed without proof it can fail.

## Tasks

### Wave 1 — Land the fork and prove it builds

- [x] `T1` — Merge upstream into this repo with both histories preserved
  - Files: whole tree, `.git/config`
  - Estimate: medium
  - Kind: migration
  - Notes: `git remote add upstream https://github.com/XeroAPI/xero-mcp-server`, `git fetch upstream`,
    `git merge upstream/main --allow-unrelated-histories`. Root collisions: this repo wins for
    `CLAUDE.md`, `HANDOFF.md`, `.gitignore`, `docs/`, `.specclaw/`; upstream wins for `package.json`,
    `tsconfig.json`, `src/`, `LICENSE`, `eslint.config.js`, `vitest.config.ts`, `README.md`
    (rewritten in T14). **Any collision not on that list is a stop-and-decide — record it in the
    build log, do not guess.** Satisfies FR1 / AC1.

- [x] `T2` — Verify the inherited toolchain installs and passes on Node 24
  - Files: none (verification only)
  - Estimate: small
  - Kind: test
  - Depends: T1
  - Notes: `npm ci`, then `npm run lint`, `npm run build`, `npm test`. Baseline must be green
    *before* anything is deleted, so a later failure is attributable to this change. Record the
    outcome. If `npm ci` fails on the inherited lockfile, resolve here — it blocks every later task.

- [x] `T3` — Add the tool inventory script and record the pre-strip inventory
  - Files: `scripts/tool-inventory.mjs`, `package.json`
  - Estimate: small
  - Kind: impl
  - Depends: T2
  - Notes: Boots `ToolFactory` against a stub server that records `server.tool(...)` names, prints
    them sorted. Expect **51 tools**. Record the output in the build log. Satisfies FR12. Note this
    script will not run headless until T5 — run it with dummy `XERO_CLIENT_ID`/`SECRET` set for the
    pre-strip reading only, and re-run credential-free after T5.

### Wave 2 — Strip the surface and break the credential seam

- [x] `T4` — Delete all write tools and the NZ payroll tools, with their handlers
  - Files: `src/tools/{create,update,delete,get}/`, `src/tools/list/list-payroll-*.tool.ts`,
    `src/tools/list/list-timesheets.tool.ts`, `src/tools/list/index.ts`,
    `src/tools/tool-factory.ts`, `src/handlers/*` (writes + NZ payroll),
    `src/types/payroll-nz-types.ts`, `src/types/payroll-au-types.ts`
  - Estimate: large
  - Kind: refactor
  - Depends: T3
  - Notes: 25 write tools + 8 NZ payroll tools = 33 removed; 18 accounting reads retained (exact
    list in spec FR4). `ToolFactory` registers `ListTools` only. Delete orphaned helpers that lose
    their last caller — but **only** those; check callers before removing. Land as **one isolated
    commit** (design NFR2/D4). `npm run build` must be green at the end. Satisfies FR2 / FR3 / FR4,
    AC2 / AC3 / AC4.

- [x] `T5` — Refactor the Xero client so registration needs no credentials
  - Files: `src/clients/xero-client.ts`, all 18 retained `src/handlers/*`
  - Estimate: large
  - Kind: refactor
  - Depends: T4
  - Notes: **The gating task.** Today `xero-client.ts` throws at module scope
    (`if (!bearer_token && (!client_id || !client_secret)) throw Error(...)`) and exports an eagerly
    constructed singleton, so importing the registry throws without credentials. Replace with a lazy
    accessor (`getXeroClient()`) that constructs on first call and raises the missing-credential
    error there; update every retained handler to call it. Keep both auth modes (bearer takes
    precedence over client-credentials) exactly as they behave now — this task changes *when* the
    client is built, not *how*. Verify: `env -u XERO_CLIENT_ID -u XERO_CLIENT_SECRET
    -u XERO_CLIENT_BEARER_TOKEN node -e "import('./dist/tools/tool-factory.js')"` must not throw.
    Satisfies FR5 / AC5.

- [x] `T6` — Re-run the inventory credential-free and record the post-strip surface
  - Files: none (verification only)
  - Estimate: small
  - Kind: test
  - Depends: T5
  - Notes: Inventory must now run with no `XERO_*` set and print exactly the 18 names from FR4.
    Record before/after counts (51 → 18) in the build log. Confirms AC4 and that T5 landed.

### Wave 3 — Shared primitives the guards stand on

- [x] `T7` — Build the shared PII matcher
  - Files: `src/__guards__/pii-matcher.ts`, `src/__guards__/pii-matcher.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T2
  - Notes: One implementation, used by Guard B, the negative controls and the pre-commit hook, so no
    copy can drift (FR7d). TFN detection **validates the ATO weighted checksum**, not any nine
    digits — a bare digit-run rule collides with ABNs, USIs, `SuperMembershipID`s and amounts in
    cents, which this surface is required to emit. Normalise separators before matching; BSB matches
    `NNN-NNN`; scan string values recursively. Its own tests must assert both directions: real
    synthetic TFNs caught, and ABN/USI/membership-ID/cents values **not** flagged.

- [x] `T8` — Build the headless registry enumerator and the fake Xero client
  - Files: `src/__guards__/tool-registry.ts`, `src/__guards__/fake-xero-client.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes: `tool-registry.ts` boots `ToolFactory` against a recording stub server and returns
    `{name, description, schema, handler}` per tool; **any boot exception propagates as a failure**,
    never as an empty list (FR6g). `fake-xero-client.ts` implements the read surface the 18 handlers
    use, throws on any non-read method (FR6d), and can return payloads seeded with a synthetic TFN,
    BSB and account number (FR7c).

- [x] `T9` — Add the checked-in tool list
  - Files: `src/__guards__/tool-allowlist.ts`
  - Estimate: small
  - Kind: config
  - Depends: T6
  - Notes: The 18 names plus each one's handler file path. **Document in the file's own comment that
    this is a new-registration tripwire and NOT proof of read-only** — the capability checks in
    Guard A are the proof (design D1). A rename must therefore be a visible edit, not a silent pass.

### Wave 4 — The guards, and proof they can fail

- [x] `T10` — Guard A: read-only by capability, over the whole registry
  - Files: `src/__guards__/guard-a-readonly.test.ts`
  - Estimate: large
  - Kind: test
  - Depends: T8, T9
  - Notes: All seven assertions of FR6: (a) write directories absent; (b) no mutating `*Api` member
    referenced anywhere under `src/`, pattern
    `^(create|update|delete|post|put|patch|approve|revert|archive|void|email)`; (c) no handler
    imports `xero-node` directly; (d) every tool invoked against the verb-enforcing fake client
    makes no non-read call; (e) registry ↔ tool list match **exactly, both directions** (a duplicate
    registration is a mismatch, not a dedupe); (f) list non-empty; (g) boot exception fails. Include
    the reasoning from the brief as a comment: a 35-tool surface will eventually gain a tool nobody
    reviewed closely, and that is the one that leaks. Satisfies FR6 / AC11.

- [x] `T11` — Guard B: no TFN, BSB or account number, by field and by rendered output
  - Files: `src/__guards__/guard-b-no-pii.test.ts`
  - Estimate: large
  - Kind: test
  - Depends: T7, T8
  - Notes: FR7 in full. (a) static denied-field read check over `src/` — must catch **both**
    `emp.taxFileNumber` and `emp["taxFileNumber"]`, and must **not** fire on the word appearing in a
    comment or a tool description string (spec Edge Cases); (b) no tool serialises a whole response
    or `.body` (no `JSON.stringify` of a response, no spread into returned content); (c) drive every
    registered tool against the fake client seeded with planted PII and assert the rendered text
    matches none of it via `pii-matcher`; (d) matcher is imported, never reimplemented. Satisfies
    FR7 / AC9.

- [x] `T12` — Permanent negative controls for both guards
  - Files: `src/__guards__/negative-controls.test.ts`,
    `src/__guards__/fixtures/violation-write-tool.ts`,
    `src/__guards__/fixtures/violation-direct-sdk-import.ts`,
    `src/__guards__/fixtures/violation-tfn-field.ts`,
    `src/__guards__/fixtures/violation-response-stringify.ts`
  - Estimate: medium
  - Kind: test
  - Depends: T10, T11
  - Notes: Four synthetic violations, each asserted to make its guard **fail**, run on every CI
    invocation. Fixtures register into a throwaway registry — **never** into the real one, or Guard A
    will legitimately fail the build. This is what converts the proposal's one-off merge-day
    demonstration into a standing check (design D7). Then verify AC10 by hand: temporarily remove
    each guard assertion in turn and confirm at least one negative control fails. Record the result
    in the build log; revert every temporary edit. Satisfies FR8 / AC7 / AC8 / AC10.

- [x] `T13` — Guard C: no payload logging
  - Files: `src/__guards__/guard-c-no-payload-logs.test.ts`
  - Estimate: medium
  - Kind: test
  - Depends: T8
  - Notes: Fails the build if any argument to a `console.*` or logger call is a Xero response object
    or a value reachable from the client. The two inherited `console` calls
    (`get-package-version.ts` warning, `index.ts` top-level error) are compliant and stay — assert
    that explicitly so the guard is known to pass on the real surface. Add a planted
    `console.log(response)` negative control proving it fails. The positive field allowlist is the
    only falsifiable form of the prohibition: "never log a payload" has no syntactic target, "log
    exactly tool name, tenant id and duration" does. Satisfies FR9 / AC12.

- [x] `T15` — Hand-map report rows, closing the widest PII egress on the retained surface
  - Files: `src/helpers/format-report-rows.ts`, `src/tools/list/list-trial-balance.tool.ts`,
    `src/tools/list/list-profit-and-loss.tool.ts`,
    `src/tools/list/list-report-balance-sheet.tool.ts`,
    `src/tools/list/list-aged-payables-by-contact.tool.ts`,
    `src/tools/list/list-aged-receivables-by-contact.tool.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T8
  - Notes: **Discovered during T8, not in the original plan, and proven by probe.** Five retained
    tools render report output as `JSON.stringify(report.rows, null, 2)`. A probe planting a
    checksum-valid TFN and a BSB into report rows confirmed **all five leak both values verbatim**
    to the caller. That is a direct violation of `CLAUDE.md` hard rule 2 — "Every tool returns a
    hand-defined shape; raw Xero response objects never pass through to the caller" — sitting on the
    surface this change retains. Guard B passing over it would make the guard ceremonial on the
    widest egress in the repo, which is the exact failure mode `spec.md` names as the real risk.
    Fix: one shared `formatReportRows()` that hand-maps the recursive row structure to a declared
    shape — `rowType`, `title`, `cells: string[]`, nested `rows` — dropping `Attributes` and
    anything else Xero may add later, then use it in all five tools. Re-run the probe afterwards and
    confirm the planted values no longer render. Satisfies FR7b properly rather than by a
    technicality about the word "whole".

### Wave 5 — CI, fixture policy, and the paper trail

- [~] `T14` — Wire CI, the fixture policy, the pre-commit hook, and update the docs
  - Files: `.github/workflows/ci.yml`, `.githooks/pre-commit`, `.gitignore`, `package.json`,
    `.specclaw/config.yaml`, `README.md`, `HANDOFF.md`
  - Estimate: medium
  - Kind: config
  - Depends: T12, T13
  - Notes: CI runs on push and pull_request: `npm ci`, `npm run lint`, `npm run build`, `npm test` —
    and defines **no** `XERO_*` env or secret, so a credential-dependent test cannot pass by accident
    (FR11 / AC14). `.gitignore` gains `fixtures/raw/`; `.githooks/pre-commit` runs `pii-matcher`
    over staged files under `fixtures/` (FR10 / AC13). Fill `config.yaml` `test_command: "npm test"`,
    `lint_command: "npm run lint"`, `build_command: "npm run build"`. `README.md` is rewritten for
    fork provenance, read-only scope and AU intent. `HANDOFF.md`: rewrite the state block, refresh
    open decisions, **prepend** a dated entry recording the 51 → 18 inventory, the credential-seam
    refactor and the D4 override of the brief — never edit a past entry (AC15).

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**
```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration
  - Depends: <task ids> (if any)
  - Notes: <additional context>
```
