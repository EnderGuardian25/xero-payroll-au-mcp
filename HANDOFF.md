# HANDOFF — xero-payroll-au-mcp

> Read this first, then `CLAUDE.md`, then `docs/2026-09-08-mcp-brief.md`. The top sections are
> rewritten every session and are true as of the date below. The session log is append-only — never
> edit a past entry.

**As at:** 2026-09-08 · **Owner:** Damian De Cruz

---

## Current state

**Foundation built; no Payroll AU tools yet.** Change 001 is complete and awaiting merge. The repo
is now a working fork of `XeroAPI/xero-mcp-server` with **18 accounting read tools** and three
build-failing guards over the whole registered surface.

Registered surface went **51 tools -> 18**, generated from the registry rather than counted by hand:

- 25 write tools deleted (create/update/delete directories, plus their handlers)
- 8 NZ payroll tools deleted — every one reached `payrollNZApi` and none reached the AU API, so none
  could answer an Australian question. **This overrode the build brief's "keep the reads, strip the
  writes"**, on evidence, and is recorded as design decision D4
- 18 accounting reads retained, including `list-bank-transactions` for Superannuation Payable

**Decided at creation, 2026-09-08, and still true:**

- Fork rather than start fresh; keep `upstream` configured and history preserved on both sides
- Bearer-token auth, holding no credentials at rest
- Read-only and no-PII guards run over the whole surface in CI and fail the build
- No compliance math here. This server reports what Xero says

**Who this is for:** whoever comes second. The Payday Super Reconciler was the expected first
consumer and deliberately stopped being one on 2026-09-08 — it reads Xero through a typed .NET
client, because MCP between two components of one .NET solution is a serialization boundary bought
for nothing. **That is why this repo is standalone, and there is no committed consumer today.**

---

## Open decisions

| # | Decision | Owner | Blocks |
|---|---|---|---|
| 1 | An Australian Xero org with realistic current data, plus a Custom Connection on it | Johann | The fixture harness (change 002) and every Payroll AU tool. Xero's demo company returns a pre-2022 9% super rate |
| 2 | Is a super payment visible as a `BankTransaction`? | Unverified | Any consumer's receipt logic. Worth testing the day an org is available |
| 3 | Who is the second consumer, and do they need HTTP transport or stdio? | BISTEC | Transport work and the auth story. Upstream is stdio-only |
| 4 | Does any platform require a specific MCP registration format? | BISTEC / Nexus team | Packaging only |
| 5 | Is `$10/month AUD` per Custom Connection acceptable to whoever operates this? | BISTEC | Nothing technical — the org being read pays Xero directly |
| 6 | **New.** Should the deferred runtime response-egress filter land with bearer auth, or with the first Payroll AU tool? | BISTEC | Closes the one PII gap change 001 leaves open — a value Xero places in report *cell text* still reaches the caller |

---

## Session log

Newest first. Append only.

### 2026-09-08 — Damian + Claude (Opus 5) — change 001: fork, strip writes, stand up the guards

**Did**

Ran the full specclaw lifecycle for `001-fork-strip-writes-guards`: propose (with a five-seat
adversarial panel), plan, then build across 5 waves and 15 tasks. 106 tests across 7 files, green
with no `XERO_*` variable set.

- **Merged upstream** with `--allow-unrelated-histories`, both roots preserved, branch renamed
  `master` -> `main`. One conflict (`.gitignore`), resolved as a union.
- **Stripped 33 tools** and their handlers as one isolated commit.
- **Made the Xero client lazy.** Upstream checked credentials at module scope and exported an eager
  singleton, so importing the tool registry threw without credentials. Zero handler edits were
  needed — the export kept its name and became a proxy.
- **Built Guards A, B and C** plus four permanent negative controls, and a shared PII matcher whose
  TFN detection validates the ATO weighted checksum rather than matching nine digits.
- **CI** runs lint, build, test and the inventory on every push and PR, with **no Xero secrets** and
  an explicit step that fails if a `XERO_*` variable is ever present.
- **Pre-commit hook** scans staged `fixtures/` files with the same matcher. `fixtures/raw/` is
  git-ignored.

**Worth knowing before the next session**

- **The panel changed the design, twice, in ways that mattered.** It returned CHANGES_REQUESTED with
  13 blocking findings on the first proposal. Two were structural: Guard A originally keyed on the
  tool *name*, which leaves the changed-tool hole open (an allowlisted tool whose handler is later
  edited to `POST` stays green forever); and Guard B's "not a raw SDK object" assertion proved an
  object's *provenance*, not the *absence of a TFN* — a hand-written mapper containing
  `taxFileNumber: emp.TaxFileNumber` passed it cleanly. Both are now capability- and field-based.
  `party-report.md` holds all 40 upheld findings.
- **A real PII leak was found on the surface we kept.** Five report tools rendered
  `JSON.stringify(report.rows, null, 2)`; a probe planting a checksum-valid TFN and a BSB showed all
  five leaked both verbatim. The originally-specified guard would have *passed* over it, because
  `.rows` is a field rather than the whole body. FR7b was reworded to "no unreviewed Xero-derived
  value may reach output" and task T15 added a hand-mapped report row shape. **Probe: 5/5 -> 0/5.**
- **One PII gap remains, deliberately.** A value Xero places in report *cell text* still reaches the
  caller. The formatter is a shape guard, not a redactor — that judgement belongs to the runtime
  egress filter, which is open decision 6 above. Do not close this by making the formatter redact
  silently; a test exists specifically to stop that.
- **Guard B found a defect in its own matcher on first run**, failing on a clean surface: an ISO date
  beside a bank cue normalises into the 6-10 digit account-number band. Narrowed to exclude
  date-shaped runs from the *shape* rules only, never the checksum rule, and pinned in both
  directions by four tests. **If you ever narrow that matcher, add a test proving it still catches a
  real TFN** — that drift is the failure mode.
- **`npm ci` did not work on upstream's lockfile** (`@emnapi/*` drift). Regenerated. Verify `npm ci`,
  not just `npm install`, after any future upstream merge.
- **Scanners live in plain modules, not test files.** Importing a `.test.ts` re-executes its suites
  in the importing file; Guard C's tests were running twice before that split.
- Upstream also ships 15 npm vulnerabilities (10 high). Untouched — fixing them means moving
  dependency versions, which was outside this change.

**Next**

1. Merge 001.
2. Change 002: the fixture-capture harness, redacting at capture, plus the recorded-fixture value
   scan. Gated on Johann's AU org (open decision 1) for real data, though the harness itself is not.
3. Then bearer-token auth with per-call tenant, and decide open decision 6 alongside it.

### 2026-09-08 — Damian + Claude (Opus 5) — repo created

**Did**

- Created the repo as a sibling of `payday-super`, ran `git init`, no remote yet.
- Copied `docs/2026-07-21-xero-integration.md` verbatim from the payday-super repo — the API research
  that justifies this repo, verified against Xero's OpenAPI spec rather than the doc site.
- Wrote `CLAUDE.md` (purpose, hard rules, the auth model in detail, the API surface, the three hard
  gaps, rate limits, conventions) and `docs/2026-09-08-mcp-brief.md` (scope, tool surface by group,
  the two guards, granular scopes, a seven-step build order, open items).
- Deliberately **excluded** all BISTEC commercial material — the strategy decks, revenue plans and
  pricing that live in the payday-super repo. If this repo is ever shared or open-sourced, none of
  that should be in its history.

**Worth knowing before the first line of code**

- **Granular scopes killed the ledger path.** Connections created on or after 29 April 2026 have no
  `accounting.journals.read`, so `GET /Journals` is unavailable to every connection this repo will
  create. Superannuation Payable reads must go through `BankTransactions`.
- **Custom Connections has no creation API.** Every connection is created by hand in the developer
  portal by someone holding Payroll Admin in that organisation. Onboarding cannot be automated away.
- **The fork ships write tools** — invoices, contacts, payments, timesheet mutation. Build step 1 is a
  removal job, and the read-only guard is what stops them coming back.
- **Three gaps have no workaround:** STP filing status has no API; Auto Super batch status is UI-only
  (uservoice open since Aug 2023), so nothing here can confirm a contribution reached a fund; and
  there are no payroll webhooks, so incremental polling with `If-Modified-Since` is the pattern.

**Next**

1. Pull the fork, strip every write tool, stand up both CI guards on the small surface first.
2. Bearer-token auth with per-call tenant, plus local token-minting test scaffolding.
3. Chase Johann for the Xero org — it gates fixture capture and everything from step 3.
