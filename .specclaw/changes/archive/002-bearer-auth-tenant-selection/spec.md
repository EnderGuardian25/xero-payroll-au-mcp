# Spec: Bearer-token auth with explicit tenant selection

**Change:** 002-bearer-auth-tenant-selection
**Created:** 2026-09-09
**Status:** 🟡 Draft

## Overview

Make the server say *which* Xero organisation it read, let a caller choose one, and refuse to guess
when the choice is ambiguous. Add a way to obtain a token at all, and close the runtime PII gap 001
left open.

No Payroll AU tools. This change makes them possible.

### What reading the code established

Planned against the actual source, not the proposal. Findings that shaped the design:

| Question | Answer |
|---|---|
| How is the tenant chosen today? | `MCPXeroClient.updateTenants()` sets `this.tenantId = this.tenants[0].tenantId` — the first connection, unconditionally |
| How do handlers get it? | All **18** read `xeroClient.tenantId`, a mutable public field on the process-wide singleton |
| Concurrency | Because that field is shared mutable state, setting it per call would let two in-flight calls read each other's tenant. **Tenant must be threaded as an argument, never assigned to the singleton** |
| Is there a single response funnel for an egress filter? | **Yes** — `CreateXeroTool()` in `src/helpers/create-xero-tool.ts` constructs every tool. Wrapping the handler there covers the whole surface from one file |
| Handler signatures | Positional args (`page`, `contactIds`, …), not a context object — so each gains an explicit tenant parameter |
| `getShortCode()` | **Zero consumers.** Its only callers were the deeplink helpers deleted in 001. Dead code on the client |
| Does the PII matcher already tolerate GUIDs? | Yes — 001's candidate extraction rejects digit runs welded into identifiers, so a tenant GUID should not trip it. Must be proven by test, not assumed |

The funnel finding is the important one: it makes the egress filter a single-file interception rather
than the ~50-handler co-change 001's review feared.

## Requirements

### Functional Requirements

**FR1 — `list-tenants` tool.** A read tool returning the organisations the current token is
authorised for, from `GET /connections`: tenant id, organisation name, connection type. This is the
discovery step every other tool's `tenantId` depends on.

**FR2 — Optional `tenantId` on every tool.** All 18 existing tools plus `list-tenants` accept an
optional `tenantId` string parameter, described so an MCP client knows to obtain it from
`list-tenants`.

**FR3 — Resolution refuses to guess.** One resolver decides the effective tenant:
- `tenantId` supplied and authorised → use it
- `tenantId` supplied and **not** authorised for this token → error naming the authorised tenants
- omitted, exactly one authorised tenant → use it
- omitted, **more than one** authorised tenant → **error** listing id and name of each. Never pick

**FR4 — Every tool's output names its organisation.** Each successful response states the
organisation the data came from. A consumer must never have to infer it.

**FR5 — `tenants[0]` is deleted, and the singleton's tenant is never used by a handler.** The
resolved tenant is passed as an argument through tool → handler → Xero call. No handler reads
`xeroClient.tenantId`. Two concurrent calls for different organisations must not interfere.

**FR6 — PKCE token-minting helper.** `scripts/mint-token.mjs` performs a local authorization-code +
PKCE exchange: generates `code_verifier`/`code_challenge`, serves a loopback redirect, exchanges the
code, and prints the access token, refresh token and authorised tenants to stdout. It takes
`XERO_CLIENT_ID` only — **there is no client secret** — and **writes nothing to disk**.

**FR7 — Runtime PII egress filter.** `CreateXeroTool` wraps every tool's handler. Before a response
leaves, the shared matcher scans the rendered content; on a match the value is removed and a warning
is emitted naming the tool and field path **but never the value** (rule 4), and a counter is
incremented.

**FR8 — One matcher implementation, shared by guards and production.** The matcher moves to a
location production code may import (`src/security/pii-matcher.ts`); the guards import the same
module. A second copy is forbidden, and 001's FR7d assertion continues to enforce that.

**FR9 — Guards stay green and get extended.**
- Guard A's checked-in tool list and pinned count go 18 → 19
- A test proves a tenant GUID in output does **not** trip the matcher
- The egress filter gets permanent negative controls: a tool returning a denied field is caught at
  runtime, asserted on every CI run
- The suite still passes with no `XERO_*` variable set

**FR10 — The live smoke test is documented, not run.** A README procedure covering mint → list
tenants → read, against Xero's demo company, with the limitation stated: the demo company returns a
pre-2022 9% super rate, so it proves plumbing and **no fixture may be captured from it**.

**FR11 — The PKCE app's scope set is recorded.** README states the scopes to request and that
granular scopes apply, so `accounting.journals.read` does not exist and Superannuation Payable must
be read via `BankTransactions`.

### Non-Functional Requirements

**NFR1 — No credential at rest.** No token, refresh token or secret is written to disk or committed.
The mint helper prints and exits.

**NFR2 — Concurrency safety.** Tenant resolution introduces no shared mutable state. Proven by a
test driving two different tenants concurrently.

**NFR3 — Guards are never weakened to pass.** If a guard fails, the code changes. Any narrowing of
the PII matcher requires a test proving it still catches a real TFN.

**NFR4 — No assertion satisfiable by an empty set.** Every universally quantified assertion is paired
with a non-zero count, as in 001.

**NFR5 — The egress filter must not corrupt legitimate output.** It removes only matched values, and
a test proves a clean response passes through byte-identical.

## Acceptance Criteria

- **AC1** — `npm run inventory` prints **19** tools including `list-tenants`.
- **AC2** — `grep -rn 'tenants\[0\]' src` returns nothing.
- **AC3** — No file under `src/handlers/` references `xeroClient.tenantId`.
- **AC4** — With two authorised tenants and no `tenantId`, a tool errors and the message contains
  both organisation names.
- **AC5** — With two authorised tenants and an explicit `tenantId`, the correct organisation's data
  is returned and the output names that organisation.
- **AC6** — An unauthorised `tenantId` errors, and the message lists the authorised tenants.
- **AC7** — With exactly one authorised tenant and no `tenantId`, the call succeeds.
- **AC8** — Two concurrent calls for different tenants each receive their own organisation's data
  (NFR2).
- **AC9** — A tool whose handler returns a denied field has that value absent from the rendered
  output, and the emitted warning contains the tool name and field path and **not** the value.
- **AC10** — A clean response is unchanged by the filter (NFR5).
- **AC11** — A tenant GUID in output is not flagged by the matcher.
- **AC12** — Guard A, Guard B, Guard C and all negative controls pass; Guard A's pinned count is 19.
- **AC13** — `env -u XERO_CLIENT_ID -u XERO_CLIENT_SECRET -u XERO_CLIENT_BEARER_TOKEN npm test`
  passes.
- **AC14** — `npm run lint`, `npm run build`, `npm test` all pass.
- **AC15** — `scripts/mint-token.mjs` contains no reference to a client secret, and a test or
  inspection confirms it writes no file.
- **AC16** — `git grep -nE '(XERO_CLIENT_SECRET|access_token|refresh_token)\s*[:=]\s*["'\'']'`
  finds no committed literal value.
- **AC17** — README documents the smoke-test procedure, the scope set, and the demo-company
  limitation.
- **AC18** — `HANDOFF.md` state block rewritten and a dated entry prepended; no past entry edited.

## Edge Cases

- **Token authorises zero tenants** — `GET /connections` returns `[]`. Must error clearly, not
  proceed with an empty tenant id.
- **`GET /connections` fails or the token is expired** — surface Xero's error; do not fall back to a
  cached or guessed tenant.
- **Connection ordering changes between calls** — the whole point. Resolution must never depend on
  order.
- **A tenant id that is well-formed but belongs to another token** — must be rejected as
  unauthorised, not attempted.
- **The egress filter matches inside a legitimate value** — e.g. a nine-digit invoice reference that
  passes the TFN checksum. It will be removed. Accepted as the correct trade for a backstop, and the
  warning makes it diagnosable; the field-level guards remain the primary defence.
- **The filter itself throws** — must not take the tool down silently. A filter failure is a
  loud error, not a passthrough.
- **A tool returns non-text content** — the filter must inspect it too, or it becomes a bypass.
- **Loopback port already in use** during minting — report it, do not hang.

## Dependencies

- A PKCE app created at `developer.xero.com/app/manage`, providing `XERO_CLIENT_ID` and a registered
  loopback redirect URI. **Needed only to run the mint helper**, not to build or test this change.
- Xero's demo company, for the manual smoke test.
- No AU organisation required. Open decision 1 does not block this change.

## Notes

- Resolves **open decision 6** (`HANDOFF.md`): the runtime egress filter lands here, because 002 is
  the first change with a real client against a real tenant.
- Moots **open decision 5** ($10/month per Custom Connection): a PKCE app is free.
- **Honest limit, to be documented:** the token is per-*process* (an environment variable at
  startup), because stdio MCP has no per-request header. This change delivers per-call **tenant**
  selection against a per-process **identity** — one token, many organisations. It is not the
  "one process serves many identities" story the build brief's wording implies.
- Still out: Payroll AU tools, the fixture harness, refresh handling inside the server, HTTP
  transport, rate-limit budgeting.
- `getShortCode()` on the client is now dead code. Left in place rather than removed, to keep this
  change's diff about tenancy; noted for a later cleanup.
