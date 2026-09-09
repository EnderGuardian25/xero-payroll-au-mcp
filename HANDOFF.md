# HANDOFF — xero-payroll-au-mcp

> Read this first, then `CLAUDE.md`, then `docs/2026-09-08-mcp-brief.md`. The top sections are
> rewritten every session and are true as of the date below. The session log is append-only — never
> edit a past entry.

**As at:** 2026-09-09 · **Owner:** Damian De Cruz

---

## Current state

**Foundation and auth done; no Payroll AU tools yet.** 001 is merged and tagged `v0.1.0-guards`.
002 is complete and awaiting merge.

The server now exposes **19 read tools** — 18 accounting reads plus `list-tenants` — behind four
build-failing guards, and it can be pointed at a real Xero organisation.

**What 002 changed, and why it mattered more than "add auth":**

- **The server no longer guesses which organisation it reads.** It took whichever connection the SDK
  sorted first — which moves as organisations are updated — and said nothing about which one it had
  used. Every tool now takes an optional `tenantId`, errors naming the candidates when several are
  authorised, and names the organisation in its output. That defect had **two copies**, in
  `updateTenants()` and in the custom-connections token exchange; a grep for one would have missed
  the other.
- **The tenant is threaded as an argument, never stored.** `tenantId` was a public mutable field on
  a process-wide singleton, so setting it per call would have raced between concurrent calls, and
  the wrong organisation's payroll reads exactly like a correct answer.
- **A runtime PII egress filter** sits at `CreateXeroTool`, the factory every tool is built through,
  so the whole surface and every future Payroll AU tool is covered from one file. **This closes open
  decision 6.**
- **A PKCE mint helper** (`npm run mint-token`) — no client secret, writes nothing to disk.

**Decided this session:**

- **A PKCE "Mobile or desktop" app, not a Custom Connection.** Free, so **open decision 5 is moot**.
  No client secret exists to leak.
- **The server stays bearer-only.** It holds no refresh token; renewal is the caller's job. The cost
  — a 30-minute token and re-running the mint helper — was accepted deliberately.
- **Xero's demo company is the first authorisation target, for plumbing only.**

---

## Open decisions

| # | Decision | Owner | Blocks |
|---|---|---|---|
| 1 | An Australian Xero org with realistic current data | Johann | The fixture harness and every Payroll AU tool. The demo company returns a pre-2022 super rate, so it can prove plumbing and nothing about Payday Super |
| 2 | Is a super payment visible as a `BankTransaction`? | Unverified | Any consumer's receipt logic. Testable the day an org exists |
| 3 | Who is the second consumer, and do they need HTTP transport or stdio? | BISTEC | Transport work. Upstream is stdio-only |
| 4 | Does any platform require a specific MCP registration format? | BISTEC / Nexus team | Packaging only |
| ~~5~~ | ~~Is $10/month per Custom Connection acceptable?~~ | — | **Closed.** A PKCE app is free |
| ~~6~~ | ~~Where does the runtime egress filter land?~~ | — | **Closed by 002.** It landed with bearer auth, at the tool factory |
| 7 | **New.** Is a per-*process* token enough, or does something need multi-*identity*? | BISTEC | Nothing yet. stdio MCP has no per-request header, so 002 delivers per-call *tenant* selection against a per-process *identity* — one token, many organisations. Less than the brief's wording implies |

---

## Session log

Newest first. Append only.

### 2026-09-09 — Claude (Opus 5), scheduled unattended run — change 002: bearer auth, tenant selection

Ran overnight from a scheduled continuation. Full lifecycle: propose (approved), plan, build across
5 waves and 10 tasks, verify. **128 tests, green with no `XERO_*` variable set.**

**Did**

- `resolve-tenant.ts` owns the whole "which organisation" decision and refuses to guess
- All 18 handlers take the tenant as a required first argument; none reads the singleton
- All 19 tools take an optional `tenantId` and name the organisation in their output
- `list-tenants` added; surface 18 → 19, with Guard A's pinned count and tool list both updated
  deliberately
- Runtime egress filter at `CreateXeroTool`, with permanent negative controls
- PKCE mint helper, no secret, no disk writes
- README: token minting, scopes, organisation selection, and the demo-company smoke test

**Worth knowing before the next session**

- **The guards caught this change three times, and each catch was correct.** Guard A flagged
  `updateTenants` as mutating (it is a GET; the fake now stubs it rather than the pattern being
  loosened). Guard B went to zero usable tools because the driver's id heuristic missed camelCase
  `tenantId`, so every driven call errored — and a tool that renders nothing renders no PII, which
  Guard B correctly refused to pass. Guard C caught the egress filter's own new `console.warn`.
- **Guard C's rule 4 vocabulary was extended**, from "tool names, tenant identifiers, durations" to
  also permit a field path — three words: `kind`, `path`, `finding`. A field path is metadata about
  a response, not the response. **That is the distinction to re-examine if anyone widens it again.**
  An earlier draft added ten words including `value`, `text` and `content`; that was trimmed.
- **A guard-infrastructure invariant is now pinned**: the fake's authorised tenant must equal the
  driver's synthesised GUID. When they drifted, Guard B reported green while checking nothing.
- **The PII matcher gained `redactPii`**, sharing one classification generator with `findPii` so
  detection and redaction cannot disagree. Redaction lives in the matcher because `findPii`
  deliberately never returns the matched value, so no caller *can* redact from a finding.
- **`updateTenants(false)`** — the SDK default fans out one `getOrganisations` call per authorised
  organisation, spending thirteen requests for a twelve-org token against a 60/minute limit, for a
  field nothing reads.
- **The smoke test has not been run.** PKCE consent needs a human browser. It is documented in the
  README and is the operator's to perform.
- Still unresolved from 001: a PII value Xero places in report *cell text* reaches the caller. The
  egress filter now catches it **if the matcher recognises it**, which narrows but does not close
  the gap — the formatter is still a shape guard, not a redactor.

**Next**

1. Merge 002, then run the demo-company smoke test.
2. Change 003: the fixture-capture harness, redacting at capture. Needs Johann's AU org for real
   data (decision 1), though the harness itself does not.
3. Then the first Payroll AU tools — pay runs and payslips, including `SuperannuationLines[]`, which
   is the reason this repo exists. Payroll scopes join the mint helper there.

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
