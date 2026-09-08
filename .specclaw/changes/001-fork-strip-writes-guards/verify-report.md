# Verify report: 001-fork-strip-writes-guards

**Date:** 2026-09-08
**Branch:** `specclaw/001-fork-strip-writes-guards`
**Verdict:** **PASS**

## Gates

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **passed** — clean |
| Build | `npm run build` | **passed** — clean |
| Test | `npm test` | **passed** — 106 tests, 7 files |
| E2E | *(none)* | **not configured** — `build.e2e_command` is empty. **This is not a pass**; there is no e2e evidence. No acceptance criterion in this change depends on e2e, so the verdict is not capped. |

The full suite was also run with `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` and
`XERO_CLIENT_BEARER_TOKEN` all unset, and passed — which is itself an acceptance criterion (AC5),
not an aside.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC1 | Fork with both roots; `upstream` configured; branch renamed | **met** | `git remote get-url upstream` → `XeroAPI/xero-mcp-server`; `git rev-list --max-parents=0 HEAD` → **2 root commits**; work branched from `main` |
| AC2 | `src/tools/{create,update,delete}` absent | **met** | All four checked (incl. `get/`, which held the last NZ payroll read) — absent |
| AC3 | No NZ payroll API call site; both type files gone | **met** | `grep -rn payrollNZApi src` → no match; `payroll-nz-types.ts` and `payroll-au-types.ts` absent |
| AC4 | Inventory prints exactly the 18 FR4 names | **met** | Generated inventory compared set-wise against the FR4 list — exact match, no extras, no omissions |
| AC5 | Suite passes with no `XERO_*` set | **met** | `env -u XERO_CLIENT_ID -u XERO_CLIENT_SECRET -u XERO_CLIENT_BEARER_TOKEN npm test` → 106 passed |
| AC6 | Lint, build and test all pass | **met** | See Gates |
| AC7 | Guard A fails on a write tool and on a direct-SDK import | **met** | Negative controls, 3 assertions green (runtime capability + static reference + SDK binding) |
| AC8 | Guard B fails on a `.taxFileNumber` read and on response stringification | **met** | Negative controls, both access forms represented; serialisation control catches the exact T15 defect |
| AC9 | Guard B's rendered-output check proven live | **met** | FR7c drives all 18 tools, both argument passes, against a client seeded with a checksum-valid TFN, a BSB and an account number; none rendered. Independently re-probed by the orchestrator |
| AC10 | No guard assertion is inert | **met** | All seven Guard A clauses proven able to fail by source mutation, each reverted — see below |
| AC11 | Registry/list mismatch fails Guard A, both directions | **met** | Stale list entry → FR6e+FR6f failed. Duplicate registration → FR6e failed (treated as mismatch, not deduped) |
| AC12 | Rule-4 check fails on a planted payload log, passes on the real surface | **met** | Negative control flags `logger.debug(response)`, `JSON.stringify(res.body)`, `response.body`; compliant control not flagged; real tree clean with the two inherited `console` calls pinned by exact inventory |
| AC13 | `fixtures/raw/` ignored; hook rejects a staged TFN | **met** | `git check-ignore` confirms the path is actually ignored; hook rejected a planted TFN+BSB and accepted a clean fixture containing an ISO date and a currency amount |
| AC14 | CI on push and PR, no `XERO_*`, covers lint/build/test | **met** | Workflow present; both triggers; zero `XERO_*` env declarations, plus an explicit step that fails if one is ever present; all three commands run |
| AC15 | HANDOFF state rewritten, dated entry prepended, no past entry edited | **met** | Prior entry diffed byte-for-byte against `4943d2f` — identical. New entry sits above it |

**15 of 15 met.**

## AC10 in detail — every Guard A clause proven able to fail

Each mutation was applied to real source, the guard run, then reverted; all backups were diffed
afterwards to confirm nothing was left behind.

| Mutation | Expected | Observed |
|---|---|---|
| Planted `src/tools/create/` | FR6a fails | FR6a alone failed |
| Static `createInvoices` reference in a handler | FR6b fails | FR6b alone failed |
| `new XeroClient()` direct in a handler | FR6c fails | FR6c alone failed |
| Mutating call via a **computed** key (`"cre"+"ate"+"Invoices"`) | FR6d fails | **FR6b passed, FR6d failed** |
| Stale list entry for a non-existent tool | FR6e fails | FR6e and FR6f failed |
| Duplicate registration | FR6e fails | FR6d and FR6e failed |
| Registry swallowing its boot error and returning `[]` | FR6g fails | FR6g alone failed |

The fourth row is the one worth keeping. The mutation deliberately hid the method name from static
analysis, the static clause passed as expected, and the runtime capability clause caught it anyway.
That is the "a computed key cannot be caught statically" limitation `spec.md` records, shown
empirically to be covered by the second layer. The two clauses are not redundant.

## Defects found and fixed during this change

Recorded because they were found by the work rather than anticipated by the plan.

1. **A real PII leak on the retained surface.** Five report tools rendered
   `JSON.stringify(report.rows, null, 2)`. A probe planting a checksum-valid TFN and a BSB into
   report rows showed **all five rendered both values verbatim**. FR7b as originally written would
   have *passed* over this, because `.rows` is a field rather than the whole body — so the
   requirement was reworded to "no unreviewed Xero-derived value may reach output", and task T15
   added a hand-mapped row shape. Probe result: **5/5 → 0/5**, independently re-verified.
2. **A false positive in the PII matcher, found by Guard B on its first run against a clean
   surface.** `list-bank-transactions` renders both `Bank Account:` and `Date: 2026-08-14`; because
   candidate runs absorb single hyphens, that date normalises to the 8-digit `20260814`, inside the
   account-number band with a bank cue in scope. Narrowed to exclude date-shaped runs from the
   *shape* rules only — never from the checksum rule — and pinned in both directions by four tests,
   including one that fails if anyone reorders the date check above the checksum check.
3. **Upstream's lockfile does not install.** `npm ci` fails `EUSAGE` on `@emnapi/*` drift.
   Regenerated, so CI can use `npm ci`.
4. **Test files were being imported for their helpers**, which re-executed their suites inside the
   importing file — Guard C's 27 tests ran twice per suite. Scanners extracted into plain modules.

## Known limitations, carried forward deliberately

Stated so the coverage claim stays accurate rather than flattering.

- **A PII value Xero places in report *cell text* still reaches the caller.** `formatReportRows` is
  a shape guard, not a redactor: that value is inside the data the caller asked Xero for, and
  judging whether a digit run in a financial report is a TFN or an invoice number is a redaction
  decision. It belongs to the runtime response-egress filter deferred in design D8, now raised as
  open decision 6 in `HANDOFF.md`. A test exists specifically to stop someone closing this by making
  the formatter redact silently.
- **A denied field reached through a computed key cannot be caught statically.** Covered by FR7c's
  driven check, and demonstrated above via AC10's fourth mutation.
- **The recorded-fixture value scan and the capture harness are not in this change** — deferred to
  002, which needs a real AU organisation for data (open decision 1), though the harness itself does
  not.
- **Rule 4's honest limit:** an HTTP error object could in principle embed a response body. The two
  inherited `console` calls log an `Error`, not a payload.
- **15 inherited npm vulnerabilities (10 high)** remain untouched; fixing them means moving
  dependency versions, outside this change's scope.

## Scope deviation

One task was added during the build and is declared: **T15** (hand-map report rows), created in
response to defect 1 above. Tasks total 15, not the 14 planned. Files touched outside originally
declared task scope: `src/helpers/format-report-rows.ts` and the five report tools (T15), plus
`src/__guards__/scan-pii-fields.ts` and `src/__guards__/scan-payload-logs.ts` (the extraction in
defect 4). All are recorded in `tasks.md` and in commit messages.

**Verdict: PASS** — 15/15 acceptance criteria met, all configured gates green, and every guard
demonstrated able to fail.
