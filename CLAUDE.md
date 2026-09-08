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
3. **Both guards run over the entire registered surface, not per tool.** A guard you have to
   remember to apply is not a guard.
4. **Never log a payload.** Log tool names, tenant identifiers and durations. Not response bodies.

## Auth: how a caller actually gets to a Xero org

The official server offers two modes and the choice matters.

| Mode | Env | Shape |
|---|---|---|
| Custom Connections | `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` + `XERO_SCOPES` | `client_credentials`, **one Xero organisation per connection** |
| Bearer token | `XERO_CLIENT_BEARER_TOKEN` | Caller arrives already holding a token. Takes precedence over `XERO_CLIENT_ID` if both are set |

**Bearer-token mode is the one that scales, and it is the recommended shape here.** Credentials
come from process environment variables, so one process serves one identity — fine for one person's
Claude Desktop pointed at one org, useless for a service reading fifty client organisations. In
bearer mode the caller does the OAuth and passes the token in, so the server holds **no credentials
at rest** and can be safely shared.

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
- A Custom Connection on that org, created in the developer portal by someone with Payroll Admin.
