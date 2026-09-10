# CLAUDE.md — xero-payroll-au-mcp

## What this repo is

A **read-only MCP server for Xero Payroll AU**, forked from
[`XeroAPI/xero-mcp-server`](https://github.com/XeroAPI/xero-mcp-server) (360★, MIT, Node/TypeScript).

It exists because of one verified gap: **the official Xero MCP server cannot touch Australian
payroll at all.** Its payroll tools cover employees, leave and timesheets only, for NZ and UK — the
region restriction is explicit in its own docs. There are no pay run, payslip, superannuation line,
super fund, membership or STP tools in it. Anyone in Australia who needs to read a pay run through
MCP has to build it.

So this repo adds that surface: roughly 35 read-only Payroll AU tools, on top of the accounting
tools the fork already provides.

**State, as of 2026-09-09.** Two changes merged. The fork is stripped to **19 read tools** — 18
accounting reads plus `list-tenants` — behind four build-failing guards, with bearer auth and
per-call tenant selection. **No Payroll AU tool exists yet**, and nothing in this repo has ever
issued a request to Xero: every test runs against a hand-written fake. The first real call is
therefore still an unvalidated step. `HANDOFF.md` is the current state; this file is the standing
rules.

**Full detail on the API, the auth model, the hard gaps and the rate limits is in
`docs/2026-07-21-xero-integration.md` — verified against the OpenAPI spec, not the doc site — and
`docs/2026-09-08-mcp-brief.md`, which is the build brief.**

## What this repo is not

**It is not part of the Payday Super Reconciler's critical path.** That product originally planned
to consume this server and, on 2026-09-08, deliberately stopped: it reads Xero through a typed .NET
client instead, because MCP protocol between two components of one .NET solution is a serialization
boundary bought for nothing. That decision is not a judgement on this repo — it is the reason this
repo is standalone.

Which means the consumer here is **whoever comes second**: another BISTEC agent, Claude Desktop or
Claude Code directly, or a third party. Build for that audience, not for one product's schedule.

## Hard rules

These are the whole value proposition. A tool surface that leaks a tax file number or mutates a
client's payroll is worse than no tool surface.

1. **Every tool is read-only.** No writes, in any version. The fork inherits write tools from the
   official server — creating invoices, updating contacts, recording payments, mutating timesheets.
   **Strip them.** An automated check must fail the build if any registered tool can write.
2. **No tool may return a tax file number, a BSB, or a bank account number.** Live Xero payroll
   payloads carry all three. Every tool returns a hand-defined shape; raw Xero response objects
   never pass through to the caller. An automated check across the **whole** tool surface must fail
   the build if any tool can emit one — because a 35-tool surface will eventually gain a tool nobody
   reviewed closely, and that is exactly the one that leaks.
3. **Every guard runs over the entire registered surface, not per tool.** A guard you have to
   remember to apply is not a guard. There are now four — see "The guards, as built" below.
4. **Never log a payload.** Log tool names, tenant identifiers and durations, and — added
   deliberately in change 002 — the **field path** of a redaction, so a redaction is diagnosable at
   all. Never response bodies, and never the matched value itself. A field path is metadata about a
   response, not the response; that is the distinction this permits, and the one to re-examine if
   anyone widens it again.
5. **Never guess which Xero organisation to read.** A token can be authorised for many. Use the one
   you were told, use the only one if there is exactly one, and otherwise **fail naming the
   candidates**. Every response states which organisation it came from. Choosing silently — even
   deterministically — hands a consumer one client's payroll while they believe it is another's,
   which looks exactly like a correct answer.

## The guards, as built

| Guard | Asserts | Landed |
|---|---|---|
| **A — read-only** | Write tool directories absent; no mutating Xero API call site; no handler importing the SDK; every registered tool driven against a client that throws on non-read calls; registry and checked-in tool list match exactly both ways, count pinned | 001 |
| **B — no PII** | No source file reads a denied field by dot *or* bracket access; no unreviewed Xero-derived value is serialised; every tool driven against planted checksum-valid PII renders none of it | 001 |
| **C — no payload logs** | No response object or client-reachable value reaches a log call. A positive allowlist, because "never log a body" names nothing checkable while "log only these fields" does | 001 |
| **D — runtime egress filter** | Last line before a response leaves: every string in every content entry scanned, matches stripped, warning naming tool and field path but never the value | 002 |

Two things to understand before touching them:

- **The checked-in tool list is a tripwire, not proof.** A name records only that somebody typed a
  string. Read-only is proven by *capability* — clauses A2 to A4. Appending to that list to make CI
  green is explicitly **not** an approval step.
- **Every guard has a permanent negative control**, run on every CI invocation. A guard demonstrated
  once at merge and trusted afterwards is indistinguishable, in CI output, from one that has
  silently stopped seeing anything. Both of those turned out to be real: Guard B once went green
  while checking nothing, and Guard C caught a defect the same week it was written.

## Auth: how a caller actually gets to a Xero org

**Decided, and built in change 002. This section describes what exists, not options to weigh.**

- **A PKCE "Mobile or desktop" app**, created at `developer.xero.com/app/manage`. **Not** a Custom
  Connection. It is free, and it has **no client secret** — an MCP server on someone's machine is a
  public client, and a secret shipped to a public client is not a secret.
- **The server runs bearer-only and holds no credential at rest.** The caller mints a token and
  passes it in via `XERO_CLIENT_BEARER_TOKEN`. Renewal is the caller's job; the server never sees a
  refresh token.
- **`npm run mint-token`** performs the local PKCE exchange and prints an access token, a refresh
  token and the authorised organisations. It writes nothing to disk, so no token file exists to be
  committed by accident. Tokens last 30 minutes; re-run it.
- **Tenant is chosen per call**, not per process. Every tool takes an optional `tenantId`;
  `list-tenants` enumerates the options. See hard rule 5.

**Honest limit, so nobody reads more into this than it delivers.** stdio MCP has no per-request
header, so the token arrives as an environment variable at startup. This is per-call **tenant**
selection against a per-process **identity** — one token, many organisations. It is *not* "one
process serves many identities", which the brief's wording below implies. Open decision 7 in
`HANDOFF.md` tracks whether anything actually needs that.

### The two modes the fork inherited, for reference

Custom Connections mode still exists in the code because it came from upstream. It is not the path
this repo uses, and the specifics below are kept only so a future reader understands what was
rejected and why.

| Mode | Env | Shape |
|---|---|---|
| Custom Connections | `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` + `XERO_SCOPES` | `client_credentials`, **one Xero organisation per connection** |
| Bearer token | `XERO_CLIENT_BEARER_TOKEN` | Caller arrives already holding a token. Takes precedence over `XERO_CLIENT_ID` if both are set |

**Bearer-token mode is the one that scales, which is why it was chosen.** Credentials come from
process environment variables, so one process serves one identity — fine for one person's Claude
Desktop, useless for a service reading fifty client organisations from one process. In bearer mode
the caller does the OAuth and passes the token in, so the server holds **no credentials at rest**
and can be safely shared.

Design consequence worth stating plainly: **prefer to hold nothing.** A server that stores per-org
`client_id`/`client_secret` for many organisations becomes the single most attractive thing in the
system to compromise, and it stops being shareable.

### Custom Connections, the specifics

- **A premium Xero feature at $10/month AUD per connection**, and the **Xero organisation** buys it.
  One connection is one app talking to one org.
- **No refresh tokens exist in this grant.** An access token comes from `client_id` + `client_secret`
  alone. That deletes rotation, the 60-day idle expiry and the whole `invalid_grant` re-consent
  workflow — a genuine simplification over the authorization-code flow.
- **Does not count toward the 25-connection uncertified-app cap**, so it sidesteps Xero App Partner
  certification entirely.
- **There is no API to create one.** Every connection is created by hand in the Xero developer
  portal, and whoever authorises it must hold Payroll Admin in that org. Nothing can automate
  onboarding away.
- Scopes are chosen by the developer at creation time and shown to the user when they authorise.

### Granular scopes — the trap

**Connections created on or after 29 April 2026 use granular scopes, and `accounting.journals.read`
does not exist for them.** The old broad `accounting.transactions` split into
`accounting.invoices`, `accounting.payments`, `accounting.banktransactions` and
`accounting.manualjournals`.

Every connection this repo will ever create is after that date. So:

| Endpoint | Status |
|---|---|
| `GET /Journals` — general ledger | **Unavailable.** No scope grants it |
| `GET /BankTransactions` | Available via `accounting.banktransactions` |
| `GET /ManualJournals` | Available via `accounting.manualjournals` |

Existing broad-scope connections have until 27 September 2027 to migrate, and removing a broad
scope is irreversible.

## The API surface to build

Base `https://api.xero.com/payroll.xro/1.0`, OpenAPI spec v16.1.0. Read
`docs/2026-07-21-xero-integration.md` §2 for the endpoint-by-endpoint detail.

The reads that matter most, because they are what any superannuation-compliance consumer needs:

- `GET /PayRuns`, `/PayRuns/{id}` — `PayRunStatus` (DRAFT/POSTED), `PaymentDate`, period dates,
  totals including `Super`, `UpdatedDateUTC`; detail carries `Payslips[]`
- `GET /Payslip/{id}` — **`SuperannuationLines[]`** with `SuperMembershipID`, `ContributionType`
  (SGC / SALARYSACRIFICE / …), `CalculationType`, `Amount`. This is the one the official server has
  no path to at all
- `GET /Employees/{id}` — `SuperMemberships[]` (fund plus member number)
- `GET /Superfunds`, `/SuperfundProducts` — REGULATED/SMSF, ABN, USI
- `GET /Settings`, `/PayItems`, `/PayrollCalendars`, earnings rates, leave types

**Payday Super additions:** `IsQualifyingEarnings` on Earnings Rates, Pay Items and Leave Types, and
`IncludeLeaveLoadingInQualifyingEarnings` on the employee Tax Declaration. Xero has enforced
validation on these since 1 September 2026 — already in force.

All list endpoints support `If-Modified-Since`, `where`, `order` and `page` (100 per page), which is
what makes incremental polling viable.

## Three hard gaps — do not spend time looking for a way around these

Verified, not assumed.

1. **STP filing status is not exposed by any Xero API.** No submission endpoints, no timestamps. The
   nearest proxy is pay run `POSTED` status plus `UpdatedDateUTC`.
2. **Xero Auto Super batch status is UI-only** (Filed → Sent → Completed via Beam). The uservoice
   request has been open and unanswered since August 2023. **A consumer cannot learn from Xero
   whether a contribution reached the fund** — only that money left, via the Superannuation Payable
   liability account on the Accounting API. Fund-level receipt needs a clearing house; Beam has the
   best-documented API.
3. **No payroll webhooks.** Xero webhooks cover accounting resources only. Incremental polling with
   `If-Modified-Since` on PayRuns is the pattern, so tools should expose that parameter.

## Rate limits

60 calls/minute/tenant · 5,000/day/tenant · 5 concurrent/tenant · 10,000/minute app-wide. 429
responses carry `Retry-After`.

The daily per-tenant budget is small, so **stagger tenants and honour `Retry-After`.** A consumer
backfilling fifty organisations at once will exhaust it, and the server should make that hard to do
by accident.

## Conventions

- **Node/TypeScript**, matching the fork. Keep the upstream remote configured so fixes stay
  mergeable, and keep divergence in added files rather than edits to inherited ones wherever
  possible.
- **Merging upstream: what actually happens.** Measured with a dry run, not assumed. A simulated
  upstream commit touching four kinds of file gave:
  - files we **edited** (`xero-client.ts`, `create-xero-tool.ts`) — **auto-merged cleanly**
  - files we **deleted** (any stripped write tool or NZ payroll tool) — **`modify/delete` conflict**,
    and git **leaves the upstream copy in the working tree**
  The second is the trap: resolving with a careless `git add -A` **resurrects a write tool**. The
  correct resolution is always `git rm` the path. Guard A catches it if you get it wrong — its
  "write tool directories do not exist" clause fails even though nothing re-registered the tool,
  which is exactly why that clause exists and why no separate path manifest was added.
  After any upstream merge, run `npm ci` (not just `npm install`) — upstream's lockfile did not
  install when this repo was forked.
- **Capture real response samples per tool** into the test suite as tools are built. Recorded fixtures
  from a real AU organisation are the only way to know a hand-defined shape is right.
- Docs live in `docs/`, named `YYYY-MM-DD-slug.md`, dated by when they were written. A superseding
  document is written rather than an old one edited; the old one gets a banner.
- Update `HANDOFF.md` at the end of any session that changed something: rewrite the state block,
  refresh open decisions, and prepend a dated log entry. Never edit a past entry.

## What is needed from outside this repo

- **An Australian Xero organisation with realistic current data.** Xero's stock demo company returns
  a 9% super rate from before 2022 — usable for testing plumbing, wrong for verifying anything about
  Payday Super, and wrong in front of an audience.
- **A PKCE app authorised against that org**, created at `developer.xero.com/app/manage`. Whoever
  authorises it needs **Payroll Admin** in that organisation once payroll scopes are added. Not a
  Custom Connection — see the Auth section.
