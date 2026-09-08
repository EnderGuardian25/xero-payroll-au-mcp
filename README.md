# xero-payroll-au-mcp

A **read-only** MCP server for Xero, forked from
[`XeroAPI/xero-mcp-server`](https://github.com/XeroAPI/xero-mcp-server) (MIT), being built toward
**Australian Payroll** — pay runs, payslips and superannuation lines.

> **Status: foundation only.** This repo currently exposes 18 accounting read tools and no Payroll
> AU tools. The guards that make the rest of the work safe are in place; the AU surface is not built
> yet. See [`HANDOFF.md`](HANDOFF.md) for where things stand.

## Why this fork exists

The official Xero MCP server cannot reach Australian payroll at all. Its payroll tools cover
employees, leave and timesheets, for NZ and UK only — there is no path in it to a pay run, a
payslip, a superannuation line, a super fund, a membership or STP.

That is not an inference from the docs. Verified against upstream at v0.0.16:

| Evidence | Finding |
|---|---|
| Xero API call sites in upstream | `accountingApi` ×45, `payrollNZApi` ×14, **`payrollAuApi` ×0** |
| `src/types/payroll-au-types.ts` | A 3-line file **nothing imports** |

Australia's Payday Super regime makes per-employee superannuation data the thing every compliance
tool needs to read, and `SuperannuationLines[]` on a payslip — with its `ContributionType`, so an
SGC line can be told from salary sacrifice — is the reason this repo exists.

## What it will and will not do

**Read-only, permanently.** Not "read-only by convention" — the upstream write tools were deleted,
and CI fails the build if a tool that can mutate ever reaches the registry again.

**No tax file numbers, BSBs or bank account numbers.** Live Xero payroll payloads carry all three.
Every tool returns a hand-defined shape, and CI fails the build if a denied field is read or an
unreviewed Xero-derived value reaches a caller.

**No compliance math.** This server reports what Xero says. Calculating shortfalls, deadlines or
penalties is a consumer's job, deliberately.

Three things Xero itself does not expose, so this server cannot either — documented so nobody spends
a week looking: **STP filing status** has no API; **Auto Super batch status** is UI-only, so nothing
here can confirm a contribution reached a fund; and there are **no payroll webhooks**, so
incremental polling with `If-Modified-Since` is the pattern.

## The guards

These are the point of the fork, and they run over the **entire registered surface** on every CI
run — not per tool, and not as a review checklist. A 35-tool surface will eventually gain a tool
nobody reviewed closely, and that is precisely the one that leaks.

| Guard | Asserts |
|---|---|
| **A — read-only** | Write tool directories absent; no mutating Xero API call site; no handler importing the SDK directly; every registered tool, driven against a client that throws on any non-read call, reaches only reads; the registry and the checked-in tool list match exactly, both ways, and the list is non-empty |
| **B — no PII** | No source file reads a denied field (`taxFileNumber`, `bsb`, `accountNumber`, …) by dot *or* bracket access; no tool serialises an unreviewed Xero-derived value; every tool, driven against payloads carrying a checksum-valid TFN, a BSB and an account number, renders none of them |
| **C — no payload logs** | No response object or client-reachable value is passed to a log call. Phrased as a positive allowlist, because "never log a body" names nothing you can check while "log only tool name, tenant id and duration" does |

Two design notes worth knowing before you touch them:

- **The tool list is a tripwire, not proof.** A name records only that somebody typed a string. An
  allowlisted tool whose handler is later edited to `POST` would stay green forever on a name check,
  so read-only is proven by capability instead — and appending to that list is explicitly *not* an
  approval step.
- **Each guard has a permanent negative control.** Four checked-in violations are asserted to make
  the guards fail, on every run. A guard demonstrated once at merge and trusted forever is
  indistinguishable, in CI output, from a guard that has silently stopped seeing anything. Both of
  those risks turned out to be real during the initial build.

Run them alone with `npm run guards`.

## Requirements a caller must satisfy

**Australian Payroll requires granular scopes.** Connections created on or after 29 April 2026 use
them, and `accounting.journals.read` does not exist for such a connection — so `GET /Journals` is
unavailable and Superannuation Payable has to be read through `BankTransactions`.

**Whoever authorises the connection needs Payroll Admin** in that Xero organisation, and there is no
API to create a Custom Connection — it is a manual step in Xero's developer portal.

## Auth

Two modes, inherited from upstream. Credentials come from the process environment; nothing is stored.

| Mode | Env | Shape |
|---|---|---|
| Bearer token | `XERO_CLIENT_BEARER_TOKEN` | Caller does the OAuth and passes a token in. **Recommended** — the server holds no credentials and can be shared. Takes precedence if both are set |
| Custom Connection | `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` (+ optional `XERO_SCOPES`) | `client_credentials`, one Xero organisation per connection. A paid Xero add-on |

The client is constructed lazily, on first use. That is not a micro-optimisation: it is what lets CI
enumerate the tool registry with **no** credentials present, and CI deliberately holds none — so a
test that quietly depended on a live credential could not pass there by accident.

## Development

```bash
npm ci
npm run build
npm test              # includes all three guards and the negative controls
npm run guards        # guards only
npm run inventory     # print the registered tool surface
```

Enable the pre-commit fixture scan once per clone:

```bash
git config core.hooksPath .githooks
```

It refuses a staged file under `fixtures/` containing a TFN, BSB or account number, using the same
matcher Guard B uses. It runs at commit time rather than in CI on purpose: PII in a git history can
only be remedied by rewriting that history, and this fork's whole structure is built on keeping
upstream mergeable. Recorded raw Xero responses belong in `fixtures/raw/`, which is git-ignored.

## Relationship to upstream

`upstream` stays configured and history is preserved on both sides, so fixes remain mergeable.
Divergence is kept in added files where possible. Note that a merge which resurrects a write tool
will be caught by Guard A rather than by a reviewer's attention.

## Licence

MIT, inherited from upstream. See [`LICENSE`](LICENSE).
