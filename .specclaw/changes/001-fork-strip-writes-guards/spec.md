# Spec: Fork, strip every write tool, and stand up both CI guards

**Change:** 001-fork-strip-writes-guards
**Created:** 2026-09-08
**Status:** 🟡 Draft

## Overview

Fork `XeroAPI/xero-mcp-server` into this repo, remove every tool that can mutate a Xero
organisation, remove the region-restricted NZ payroll tools, and stand up two CI guards that fail
the build if a write tool or a PII-emitting tool ever reaches the registered surface again.

This change adds **no** Payroll AU tools. It is the foundation the ~35 later tools are born onto.

### What the upstream probe established

The plan below is grounded in a shallow clone of upstream at v0.0.16, not in estimates. Findings
that changed the design:

| Question | Answer |
|---|---|
| Registered tool count | **51 tools — 25 writes, 26 reads** (not the "~50" the proposal estimated) |
| Tool layout | Verb-keyed directories: `src/tools/{create,update,delete,get,list}/` |
| Test runner | **Already present** — vitest 4, eslint 9, tsc 5.9. `npm test` = `vitest run` |
| Existing test coverage | **One test file** (`src/helpers/__tests__/format-error.test.ts`). No write-tool tests to delete |
| Shared tool seam | `CreateXeroTool()` in `src/helpers/create-xero-tool.ts` — **every** tool is constructed through it |
| Xero APIs used | `accountingApi` (45 call sites), `payrollNZApi` (14). **`payrollAuApi`: zero** |
| `src/types/payroll-au-types.ts` | A 3-line orphan. **Nothing imports it.** Hard evidence for this repo's founding claim |
| Headless boot | **Impossible as-is.** `src/clients/xero-client.ts` throws at module load when credentials are absent, and exports a singleton |
| Tool output shape | MCP **text content**, not typed objects. Formatters reference Xero fields explicitly (`employee.email`, …) |
| Payload logging | 2 `console` calls, neither logs a response body |

Two of those findings reshaped the guards, and both are recorded as decisions in `design.md`:
the module-load credential throw must be fixed before any guard can boot, and because tool output
is rendered text rather than a typed object, Guard B's mandatory check is a **field-reference**
check plus a **rendered-output** check driven by a fake client carrying planted PII — which makes
it falsifiable today, with no Xero org and no recorded fixture.

## Requirements

### Functional Requirements

**FR1 — Fork with preserved, mergeable history.**
Upstream is configured as a remote named `upstream`; upstream history is merged into this repo's
history with `--allow-unrelated-histories`; this repo's branch is `main`. Root-level collisions are
resolved with this repo's version winning for files it already owns and upstream's winning for files
it introduces.

**FR2 — Every write tool is deleted.**
All 25 write tools and their handlers are removed by deleting `src/tools/create/`,
`src/tools/update/`, `src/tools/delete/` and the corresponding `src/handlers/*` files. Deleted, not
unregistered. `ToolFactory` no longer references them.

**FR3 — The NZ payroll tools are deleted.**
All 8 tools reaching `payrollNZApi` are removed: `list-payroll-employees`,
`list-payroll-employee-leave`, `list-payroll-employee-leave-balances`,
`list-payroll-employee-leave-types`, `list-payroll-leave-periods`, `list-payroll-leave-types`,
`list-timesheets`, `get-timesheet`. After this, no source file references `payrollNZApi`, and the
orphan `src/types/payroll-au-types.ts` and `src/types/payroll-nz-types.ts` are removed with them.
*This overrides the build brief's "keep the reads, strip the writes"* — see `design.md` D4.

**FR4 — The retained surface is exactly 18 accounting read tools.**
`list-accounts`, `list-aged-payables-by-contact`, `list-aged-receivables-by-contact`,
`list-bank-transactions`, `list-contact-groups`, `list-contacts`, `list-credit-notes`,
`list-invoices`, `list-items`, `list-manual-journals`, `list-organisation-details`, `list-payments`,
`list-profit-and-loss`, `list-quotes`, `list-report-balance-sheet`, `list-tax-rates`,
`list-tracking-categories`, `list-trial-balance`.

**FR5 — Registration is credential-free.**
`src/clients/xero-client.ts` no longer throws at module load and no longer exports an eagerly
constructed singleton. Client construction moves behind a lazy accessor, and the missing-credential
error surfaces on first use rather than on import. Importing `ToolFactory` and enumerating the
registry must succeed with **no** `XERO_*` environment variable set.

**FR6 — Guard A asserts read-only by capability, over the whole registry.**
Guard A fails the build if any of these do not hold:
- a. `src/tools/create/`, `src/tools/update/`, `src/tools/delete/` do not exist
- b. no file under `src/` references a mutating xero-node API method (matching
  `^(create|update|delete|post|put|patch|approve|revert|archive|void|email)` on any `*Api` member)
- c. no tool handler imports `xero-node` directly; all Xero access goes through the read-only client
  module
- d. every registered tool, invoked against a fake client whose non-read methods throw, completes
  without a thrown non-read call
- e. the enumerated registry and the checked-in tool list match **exactly, in both directions**
- f. the checked-in tool list is non-empty
- g. any exception during registry boot fails the guard, rather than yielding an empty enumeration

**FR7 — Guard B asserts no TFN, BSB or bank account number, over the whole registry.**
Guard B fails the build if any of these do not hold:
- a. no file under `src/` reads a denied Xero field (case-insensitive property access on
  `taxFileNumber`, `bsb`, `accountNumber`, `bankAccountNumber`, `bankAccountName`,
  `bankAccountDetails`, `taxDeclaration`)
- b. no tool serialises a whole Xero response or response `.body` into its output (no
  `JSON.stringify` of a response/`body`, no spread of a response object into returned content)
- c. every registered tool, driven against a fake client returning a payload **with planted
  synthetic TFN, BSB and account-number values**, renders output containing none of them
- d. the PII matcher used by (c) is a single shared module, so no second copy can drift

**FR8 — Permanent negative controls.**
Four synthetic violations live as checked-in test fixtures and are asserted to make the guards fail,
on every CI run:
- a write tool → Guard A fails
- a tool importing `xero-node` directly → Guard A fails
- a tool reading `.taxFileNumber` → Guard B fails
- a tool stringifying a whole response body → Guard B fails

**FR9 — Rule 4 has a mechanism, not a sweep.**
A check fails the build if any argument to a `console.*` or logger call is a Xero response object or
a value reachable from the Xero client. The two existing `console` calls (a version-read warning and
a top-level error) are confirmed compliant and retained.

**FR10 — Fixture policy is recorded and enforced, though the harness is not built.**
`fixtures/raw/` is git-ignored; `fixtures/tool-output/` is checked in. A pre-commit hook runs the
shared PII matcher over staged files under `fixtures/`. A standing constraint is documented: no
change in this repo may ever require a git history rewrite.

**FR11 — CI runs everything, with no Xero credentials.**
A GitHub Actions workflow on push and pull request runs install, lint, build, test (which includes
both guards and the negative controls), with **no** `XERO_*` secrets available to the job. Any
failure fails the build.

**FR12 — The tool inventory is generated, not narrated.**
A script prints the registered tool names from the registry. Its output is recorded in the build log
before and after the strip.

### Non-Functional Requirements

**NFR1 — Divergence is kept in added files.** Guards, negative controls, CI and the PII matcher are
new files. Edits to inherited files are limited to what FR2/FR3/FR5 require (deletions, the client
refactor, `ToolFactory`, `package.json` scripts).

**NFR2 — Upstream stays mergeable.** `upstream` remains configured; history is preserved on both
sides; the strip lands as one isolated commit so a future merge conflict is legible.

**NFR3 — Guards run in under 60 seconds** on a cold CI runner, so they are not skipped under time
pressure.

**NFR4 — No guard may be satisfied by an empty set.** Every universally quantified assertion is
paired with a non-zero count assertion (FR6e, FR6f).

**NFR5 — No credentials at rest.** No `.env` file, secret, token or org identifier is committed, and
CI holds no Xero secret.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

- **AC1** — `git remote -v` lists `upstream` pointing at `XeroAPI/xero-mcp-server`; `git log` shows
  both roots; the working branch is `main`.
- **AC2** — `src/tools/create`, `src/tools/update`, `src/tools/delete` do not exist.
- **AC3** — `grep -rn 'payrollNZApi' src` returns nothing; `src/types/payroll-nz-types.ts` and
  `src/types/payroll-au-types.ts` do not exist.
- **AC4** — The inventory script prints exactly the 18 tool names in FR4, and no others.
- **AC5** — `env -u XERO_CLIENT_ID -u XERO_CLIENT_SECRET -u XERO_CLIENT_BEARER_TOKEN npm test`
  passes. No test requires a credential.
- **AC6** — `npm run lint`, `npm run build` and `npm test` all pass.
- **AC7** — Guard A fails when the synthetic write tool fixture is registered, and fails when the
  direct-`xero-node`-import fixture is registered. Both demonstrated by passing tests that assert
  the failure.
- **AC8** — Guard B fails when the `.taxFileNumber` fixture is registered, and fails when the
  response-stringify fixture is registered. Both demonstrated by passing tests that assert the
  failure.
- **AC9** — Guard B's rendered-output check (FR7c) is proven live: a retained tool driven against a
  fake client returning a planted TFN, BSB and account number renders none of them.
- **AC10** — Removing any single assertion from Guard A or Guard B causes at least one negative
  control test to fail. No assertion is inert.
- **AC11** — Adding a new tool to the registry without adding it to the checked-in tool list fails
  Guard A; removing a tool without removing its list entry also fails Guard A.
- **AC12** — The rule-4 check fails against a planted `console.log(response)` and passes on the
  retained surface.
- **AC13** — `.gitignore` contains `fixtures/raw/`; the pre-commit hook rejects a staged file under
  `fixtures/` containing a synthetic TFN.
- **AC14** — The CI workflow file exists, runs on push and pull_request, defines no `XERO_*` env or
  secret, and its steps cover lint, build and test.
- **AC15** — `HANDOFF.md` state block is rewritten and a dated log entry is prepended; no past entry
  is edited.

## Edge Cases

- **Registry boot throws** — must fail the guard (FR6g), never pass as an empty enumeration. This is
  the fail-open case that looks exactly like success.
- **A tool is registered twice** — exact bidirectional match (FR6e) must treat a duplicate as a
  mismatch, not silently dedupe.
- **A denied field name appears in a comment or a tool description string** — the field-reference
  check must match property access, not any occurrence of the word, or every tool description
  mentioning "bank account" trips it.
- **A denied field reached via bracket notation** (`emp["taxFileNumber"]`) — must be caught; a
  property-access-only check that misses bracket access is a hole.
- **A denied field reached via a dynamic key** — cannot be caught statically. Accepted and recorded
  as a known limitation, which is precisely why FR7c's rendered-output check exists alongside FR7a.
- **The PII matcher fires on a legitimate value** — ABNs, USIs, membership IDs and amounts in cents
  are digit strings in the same length band. The matcher must not be narrowed to silence a false
  positive without a negative control proving it still catches a real TFN.
- **Upstream merge conflicts on a deleted path** — resolution is always "stay deleted"; Guard A's
  registry check is what proves the resurrection did not land.
- **`npm ci` on a lockfile inherited from upstream** — the merge brings upstream's
  `package-lock.json`; it must install cleanly on Node 24 before any guard can run.

## Dependencies

- Node 24.16.0 / npm 11.14.1 (local); CI pinned to Node 22 LTS or 24
- Upstream `XeroAPI/xero-mcp-server` reachable at fork time
- `gh` CLI authenticated with `repo` + `workflow` scopes (present) for the PR
- **No** Xero organisation, credential or Custom Connection is required by this change. Open
  Decision 1 in `HANDOFF.md` does not block it.

## Notes

- Adapted from the proposal after the adversarial panel returned CHANGES_REQUESTED with 13 blocking
  findings; `party-report.md` holds the full transcript.
- The proposal assumed Guard B's mandatory check would need recorded fixtures and therefore
  scheduled a value scan for change 002. The probe showed tool output is rendered text and every
  tool is constructed through one factory, so a fake client carrying planted PII can drive the whole
  surface today. **Guard B is therefore falsifiable in this change, with no org** — stronger than
  the proposal promised. Change 002 still owns the real-fixture harness.
- Deferred to change 002: the fixture-capture harness and the recorded-fixture value scan.
- Deferred to the first change holding a live client: the runtime response-egress filter. After 001,
  rule 2 is guarded against field reads, response passthrough and rendered-output leakage on the
  fake-client path; it is not guarded against a live response field no test exercised.
