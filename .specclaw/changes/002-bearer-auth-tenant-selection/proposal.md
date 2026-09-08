# Proposal: Bearer-token auth with explicit tenant selection

**Created:** 2026-09-08
**Status:** 🟡 Draft

## Problem

Change 001 made the server safe. It did not make it usable, and it left one behaviour that is worse
than unusable.

**1. The server silently reads an arbitrary organisation.** In `src/clients/xero-client.ts`:

```ts
if (this.tenants && this.tenants.length > 0) {
  this.tenantId = this.tenants[0].tenantId;
}
```

A bearer token can be authorised against many Xero organisations — `GET /connections` returns all of
them. The server takes **the first one in the list**, no tool can select a different one, and nothing
in any tool's output says which organisation the data came from.

For an accounting read that is sloppy. For the superannuation tooling this repo exists to enable it
is a confidentiality and correctness failure: a consumer reconciling Payday Super obligations would
be handed one client's payroll while believing it was another's, with no signal that anything was
wrong. Ordering of `GET /connections` is not documented as stable, so the same call can change
organisation between runs.

This is the actual reason 002 exists. "Add bearer auth" undersells it — bearer mode already
half-works via `XERO_CLIENT_BEARER_TOKEN`. What is missing is the ability to say *which organisation
you mean*, and a refusal to guess.

**2. There is no way to obtain a token.** The decision is a PKCE app in the Xero developer portal,
which means no client secret — good — but also that nobody can currently get an access token to
point at this server without hand-rolling an OAuth exchange. 001's plan called for "local
token-minting test scaffolding" and it was never built, because 001 needed no credentials by design.

**3. Rule 2 is guarded at build time only.** 001's guards are static analysis plus a driven check
against a fake client. Nothing inspects a **live** response. `spec.md` for 001 states this plainly
and `HANDOFF.md` carries it as open decision 6: a PII value Xero places in report cell text still
reaches the caller, and the runtime egress filter that would catch it was deferred because — fairly
— it had no consumer in a change with no client, no tenant and no deployment.

**002 is the first change with a real client against a real tenant, so that objection expires here.**

## Proposed Solution

### 1. Explicit tenant selection, and a refusal to guess

- **New tool `list-tenants`** — reads `GET /connections` and returns the organisations the current
  token can access: tenant id, name, and connection type. This is the discovery step that makes
  everything below usable, and it is a read, so it lives under Guard A like everything else.
- **Every tool gains an optional `tenantId` parameter.** When supplied, it is used. When omitted:
  - exactly one authorised tenant → use it
  - **more than one → fail with an error naming the available tenants**, rather than picking
- **Every tool's output states which organisation it came from.** A consumer must never have to infer
  it.

The failure mode is deliberate. Silently choosing is the current bug; silently choosing *the same
one as before* would still be a bug. `tenants[0]` is deleted.

### 2. A PKCE token-minting helper

`scripts/mint-token.mjs` — a local, one-shot authorization-code + PKCE exchange:

- generates `code_verifier` / `code_challenge`, opens the Xero consent URL, listens on a loopback
  redirect, exchanges the code
- prints the access token, refresh token and the tenant list to stdout
- **stores nothing.** No token file, no keychain, no `.env` write

**It needs no client secret** — that is the point of choosing a PKCE app, and it means the helper
holds no credential that could leak.

### 3. Runtime PII egress filter

One filter on the single path every tool's response passes through, using the **existing shared
matcher** from 001 (`src/__guards__/pii-matcher.ts` moves to `src/security/` so production code may
import it — the guards keep importing the same module, so build-time and run-time detection cannot
drift, which was 001's FR7d).

On a match it: removes the value, emits a **counted warning naming the tool and the field path but
never the value** (rule 4), and increments a counter a consumer can read.

This closes open decision 6, and it is the layer that covers what static analysis provably cannot —
a denied field reached through a computed key, and a value Xero places somewhere no test exercised.

### 4. Guards extended, not bypassed

- Guard A's tool list and pinned count move from 18 to 19 (`list-tenants`)
- The new `tenantId` parameter must not become a PII channel — it is a GUID and is echoed in output,
  so the matcher must not fire on it and a test must prove that
- **The egress filter gets its own negative controls**, in the same style as 001: a tool that returns
  a denied field must be caught by the filter at runtime, asserted on every CI run

### 5. Live smoke test against the demo company

Documented, manual, and honest about its limits: it proves auth, tenant selection and the live read
path end to end. It proves **nothing** about Payday Super — Xero's demo company returns a pre-2022
9% super rate, per `CLAUDE.md`. No fixture may be captured from it.

## Scope

### In Scope

- `list-tenants` tool reading `GET /connections`
- Optional `tenantId` on all 18 existing tools; ambiguity is an error, never a guess
- Tenant identity surfaced in every tool's output
- Deletion of the `tenants[0]` fallback
- `scripts/mint-token.mjs` — PKCE, no secret, stores nothing
- Runtime PII egress filter on the shared response path, reusing 001's matcher
- Matcher relocated so production and guards share one implementation
- Guard updates: tool count 19, `tenantId` not flagged, egress-filter negative controls
- Documented live smoke test against the demo company
- The scope set the PKCE app must request, recorded in the README
- `HANDOFF.md` updated; open decision 6 closed

### Out of Scope

- **Any Payroll AU tool** — change 003. This change makes them possible, it does not add them
- **The fixture-capture harness and recorded-fixture value scan** — needs a real AU organisation
  (open decision 1), still unresolved
- **Refresh-token handling inside the server.** Decided: the caller owns the OAuth dance and the
  server holds no credential at rest. A 30-minute token means re-running the helper; that cost is
  accepted for now and revisited only if real use makes it intolerable
- **HTTP transport** — still gated on who the second consumer is (open decision 3)
- App Partner certification and the 25-connection cap
- Rate-limit budgeting and `Retry-After` handling — worth its own change once real traffic exists

## Impact

- **Files affected:** ~30. All 18 tool files gain a parameter and an output line; the client loses
  `tenants[0]`; ~4 new files (`list-tenants` tool + handler, mint helper, egress filter); the matcher
  moves; Guard A's list and count change; README and HANDOFF
- **Complexity:** large. Not because any one piece is hard, but because the `tenantId` parameter is a
  co-change across every tool on the surface, and the egress filter is a new production code path
- **Risk:** medium, and higher than 001. 001 could not touch a live organisation; this change is
  specifically about doing so. The failure modes that matter: an egress filter that silently drops a
  legitimate value and makes a tool quietly wrong, and a mint helper that writes a token somewhere it
  shouldn't

## Open Questions

1. **A token is still per-process, not per-call.** Over stdio MCP there is no per-request header, so
   the token can only arrive as an environment variable at process start. So this change delivers
   *per-call tenant selection* against a *per-process token* — one identity, many organisations.
   That is a real improvement and it is **not** the "one process serves many identities" story the
   build brief implies. Worth stating in the docs rather than letting a reader assume more. Does
   anything downstream actually need multi-*identity*, or is multi-tenant-per-token enough?
2. **Should the egress filter drop, or refuse?** Dropping a value keeps the tool working and risks
   masking a mapping bug; refusing the whole response is louder but turns a PII sighting into an
   outage. Recommend dropping plus a counted warning, on the grounds that this is a backstop and the
   field-level guards are the primary defence — but it is a genuine trade.
3. **Does an optional `tenantId` degrade the LLM experience?** An MCP client must now pass a GUID it
   learned from `list-tenants`. With one authorised organisation nothing changes; with several the
   model must chain two calls. Acceptable, or should the server accept an organisation *name* too?
4. **Is this change too big?** The honest cut line is auth + tenant selection now, egress filter as
   003. Against splitting: the filter's whole justification was "no consumer until a real client
   exists", and that consumer arrives in this change — deferring again risks it never landing.
   Recommend keeping it together, but the split is available and cheap to take.
5. **What consumes the egress filter's counter?** Nothing does today — no deployment, no operator.
   If the answer stays "nothing", the counter is a knob paid for and never read, and the warning
   alone may be enough.

---

**To proceed:** Review this proposal and approve to begin planning.
