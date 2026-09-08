# HANDOFF — xero-payroll-au-mcp

> Read this first, then `CLAUDE.md`, then `docs/2026-09-08-mcp-brief.md`. The top sections are
> rewritten every session and are true as of the date below. The session log is append-only — never
> edit a past entry.

**As at:** 2026-09-08 · **Owner:** Damian De Cruz

---

## Current state

**Pre-implementation.** The repo holds context documents and nothing else — no fork pulled yet, no
code, no `package.json`. `git init` has run; there is no remote and nothing is committed.

**What it will be:** a fork of `XeroAPI/xero-mcp-server` (360★, MIT, Node/TypeScript) adding roughly
35 read-only Payroll AU tools. The official server's payroll tools are NZ/UK only and reach no pay
run, payslip, superannuation line, fund or membership — that gap is the entire reason this exists.

**Decided at creation, 2026-09-08:**

- Fork the official server rather than starting fresh — 50 working accounting tools, established
  auth and tool patterns, and upstream fixes stay mergeable
- **Bearer-token auth, holding no credentials at rest.** Custom Connections mode binds one process
  to one Xero organisation because credentials are environment variables
- Read-only and no-PII guards run over the whole surface in CI and fail the build
- No compliance math here. This server reports what Xero says

**Who this is for:** whoever comes second. The Payday Super Reconciler was the expected first
consumer and deliberately stopped being one on 2026-09-08 — it reads Xero through a typed .NET
client, because MCP protocol between two components of one .NET solution is a serialization boundary
bought for nothing. **That is why this repo is standalone, and it means there is no committed
consumer today.** Build for reuse; do not assume a deadline inherited from another product.

---

## Open decisions

| # | Decision | Owner | Blocks |
|---|---|---|---|
| 1 | An Australian Xero org with realistic current data, plus a Custom Connection on it | Johann | Everything from build step 3. Xero's demo company returns a pre-2022 9% super rate — fine for plumbing, wrong for anything Payday Super |
| 2 | Is a super payment visible as a `BankTransaction`? | Unverified | Build step 6, and any consumer's receipt logic. Worth testing the day an org is available |
| 3 | Who is the second consumer, and do they need HTTP transport or stdio? | BISTEC | Build step 7 and the auth story. The official server is stdio-only |
| 4 | Does any platform require a specific MCP registration format? | BISTEC / Nexus team | Packaging only |
| 5 | Is `$10/month AUD` per Custom Connection acceptable to whoever operates this? | BISTEC | Nothing technical — the org being read pays Xero directly |

---

## Session log

Newest first. Append only.

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
