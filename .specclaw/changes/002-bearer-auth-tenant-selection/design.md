# Design: Bearer-token auth with explicit tenant selection

**Change:** 002-bearer-auth-tenant-selection
**Created:** 2026-09-09

## Technical Approach

Four moves. The first is the one everything else depends on.

**1. Thread the tenant, never store it.** `xeroClient.tenantId` is a mutable public field on a
process-wide singleton, read by all 18 handlers. The naive fix — assign it per call — is a data race:
two in-flight calls for different organisations would read each other's tenant, intermittently, in a
way that is almost impossible to notice and catastrophic for a payroll consumer. So the resolved
tenant becomes an argument passed tool → handler → Xero call, and no handler reads the singleton.

**2. Resolve tenancy in one place.** A `resolveTenant()` function owns the whole decision, so the
"refuse to guess" rule exists once rather than nineteen times. It is the only thing that talks to
`GET /connections`.

**3. Intercept responses at the one funnel that already exists.** Every tool is built by
`CreateXeroTool(name, description, schema, handler)`. Wrapping `handler` there puts the egress filter
on every tool — present and future — from a single file. 001's review anticipated this needing a
co-change across every handler; reading the code showed the funnel was already there.

**4. Share one PII matcher.** It moves to `src/security/pii-matcher.ts` so production may import it,
and the guards import the same module. Build-time and run-time detection therefore cannot drift,
which was 001's FR7d and is now structural rather than aspirational.

## Architecture

```
src/
  clients/
    xero-client.ts          ← updateTenants() no longer sets tenantId; tenants[0] deleted
    resolve-tenant.ts       ← NEW: the whole "which organisation" decision
  security/
    pii-matcher.ts          ← MOVED from __guards__; now importable by production
    egress-filter.ts        ← NEW: scans a tool result, strips matches, warns, counts
  helpers/
    create-xero-tool.ts     ← wraps every handler with the egress filter
  handlers/
    *.handler.ts            ← 18 files: gain an explicit tenantId parameter
    list-xero-connections.handler.ts  ← NEW
  tools/list/
    *.tool.ts               ← 18 files: gain optional tenantId, name the org in output
    list-tenants.tool.ts    ← NEW
  __guards__/
    pii-matcher.test.ts     ← follows the matcher's move
    tool-allowlist.ts       ← 18 → 19 entries
    egress-filter.test.ts   ← NEW
    fixtures/violation-egress-tfn.ts  ← NEW negative control
scripts/
  mint-token.mjs            ← NEW: PKCE, no secret, writes nothing
```

**Tenant resolution.** `resolveTenant(requestedTenantId?: string): Promise<ResolvedTenant>` returns
`{ tenantId, tenantName }`. It authenticates, reads the authorised connections, then applies spec
FR3 exactly. Its error messages list id **and** organisation name, because a bare GUID is useless to
whoever has to fix the call. `ResolvedTenant` carries the name so FR4's "which organisation" line
costs no extra API call.

**Egress filter.** `withEgressFilter(toolName, handler)` returns a handler with the same signature.
It awaits the inner result, walks every content entry — text and non-text, since a value smuggled
through a non-text field would otherwise bypass it — runs `findPii`, and where there is a match
replaces the matched substring with a redaction marker. It emits one warning per finding carrying
tool name and field path only, and increments a module-level counter. A throw inside the filter
propagates: a filter that fails open is worse than no filter, because it looks like one.

**Why redact rather than refuse.** Spec Edge Cases records the trade. This is a backstop behind two
static guards and a driven check; turning a PII sighting into a tool outage would make the safest
configuration the least usable one, and would punish the false positives the matcher will
occasionally produce on nine-digit references. The warning is what makes a redaction diagnosable.

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `src/clients/resolve-tenant.ts` | Create | The whole tenant decision; only caller of `GET /connections` |
| `src/clients/xero-client.ts` | Modify | Stop setting `tenantId` in `updateTenants`; delete `tenants[0]` |
| `src/security/pii-matcher.ts` | Move | From `src/__guards__/`, so production may import it |
| `src/security/egress-filter.ts` | Create | Response scan, redact, warn, count |
| `src/helpers/create-xero-tool.ts` | Modify | Wrap every handler with the filter |
| `src/handlers/list-xero-connections.handler.ts` | Create | Reads authorised connections |
| `src/handlers/*.handler.ts` (18) | Modify | Accept and use an explicit tenant id |
| `src/tools/list/list-tenants.tool.ts` | Create | FR1 |
| `src/tools/list/*.tool.ts` (18) | Modify | Optional `tenantId`; organisation named in output |
| `src/tools/list/index.ts` | Modify | Register `list-tenants` |
| `src/__guards__/tool-allowlist.ts` | Modify | 19 entries, pinned count updated deliberately |
| `src/__guards__/pii-matcher.test.ts` | Modify | Import path; add the tenant-GUID case |
| `src/__guards__/egress-filter.test.ts` | Create | FR7 behaviour and NFR5 |
| `src/__guards__/fixtures/violation-egress-tfn.ts` | Create | Permanent negative control |
| `src/__guards__/scan-pii-fields.ts` | Modify | Matcher import path |
| `scripts/scan-staged-fixtures.mjs` | Modify | Matcher import path |
| `scripts/mint-token.mjs` | Create | FR6 |
| `README.md` | Modify | Smoke test, scopes, per-process-token limit |
| `HANDOFF.md` | Modify | State block + dated entry; close open decision 6 |

## Data Model Changes

None persisted. Two new in-process types: `ResolvedTenant { tenantId, tenantName }` and the egress
filter's counter. Nothing is written to disk — NFR1.

## API Changes

Every tool gains an **optional** `tenantId`. Optional rather than required on purpose: with one
authorised organisation — the common case, and the demo-company case — nothing changes for a caller,
and no existing invocation breaks. With several, the call now fails loudly instead of returning the
wrong organisation's data, which is a deliberate behaviour change and an improvement.

Tool count 18 → 19.

## Key Decisions

**D1 — Tenant is an argument, not client state.** The mutable-singleton race is the reason. This is
also why `updateTenants()` stops assigning `tenantId`: leaving the field in place but unused would
invite the next contributor to read it.

**D2 — Ambiguity is an error, not a default.** The current bug is silently choosing. Choosing
*deterministically* would still be choosing. The resolver names the candidates so the fix is obvious
to whoever hit it.

**D3 — `tenantId` stays optional.** Required would break every existing call and make the
single-organisation case worse for no safety gain, since one authorised tenant is unambiguous.

**D4 — The filter wraps `CreateXeroTool`, not each handler.** One interception point, automatically
inherited by every future Payroll AU tool. A tool that bypassed the factory would also be invisible
to Guard A's registry walk, so the funnel is already the thing the guards assume.

**D5 — Redact and warn, rather than refuse the response.** See "Why redact rather than refuse". It
is a backstop, not the primary defence.

**D6 — The matcher moves rather than being duplicated.** Two implementations drift, and the one
nobody watches is the one that stops catching. 001's FR7d assertion keeps enforcing single-copy after
the move.

**D7 — PKCE, no client secret, nothing written.** The app type was chosen for exactly this: there is
no secret to leak, and the helper prints to stdout so no token file exists to be committed by
accident.

**D8 — The smoke test is documented, not automated.** PKCE consent needs a human browser. Pretending
otherwise would produce a test that cannot run in CI and would be skipped — the failure mode 001's
review named.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **The 18-handler co-change breaks a tool subtly** — highest-probability failure, since it touches everything | The guards already drive all tools against a fake client; that suite is the regression net and must stay green. Do handlers in one wave, with `npm run build` green before tools change |
| **The egress filter corrupts legitimate output** | NFR5 test asserts a clean response is unchanged; redaction is substring-scoped, not whole-field |
| **The filter fails open on a throw** | Explicitly propagate. A filter that swallows is indistinguishable from one that works |
| **Matcher false positive on a tenant GUID**, breaking every response | AC11 pins it. 001's candidate extraction already rejects identifier-welded digits; this proves it |
| **A concurrency bug survives review** because it is intermittent | NFR2/AC8 drive two tenants concurrently and assert isolation, rather than reasoning about it |
| **The mint helper writes a token** | AC15 inspects for file writes; NFR1 forbids it; the pre-commit fixture hook and Guard C remain |
| **Scope creep into Payroll AU tools** because the plumbing now exists | Explicit out-of-scope, and tasks contain no such work |

## Grounding sources

- **`CLAUDE.md`** — rule 2 (*"No tool may return a tax file number, a BSB, or a bank account
  number"*) is what the egress filter finally covers at run time; rule 4 (*"Never log a payload"*)
  is why the filter's warning names a field path and never a value. Also the auth stance this change
  implements: *"Bearer-token mode is the one that scales… the server holds no credentials at rest"*,
  and *"prefer to hold nothing."*
- **`docs/2026-09-08-mcp-brief.md`** — §3: *"Hold no credentials. Run in bearer-token mode: the
  caller performs the OAuth exchange and passes a token per call. The server becomes stateless and
  therefore shareable."* This change delivers the shareable half; the honest gap (a per-process
  rather than per-call token, over stdio) is recorded in `spec.md` Notes. §9 step 2 places this work:
  *"Bearer-token auth, tenant passed per call, plus local test scaffolding that can mint a token."*
- **`docs/2026-07-21-xero-integration.md`** — §4 is the source for tenancy mechanics: *"`GET
  /connections` lists authorized tenants; `xero-tenant-id` header on every call"*, and the
  25-connection uncertified-app cap that stays out of scope here.
- **`HANDOFF.md`** — open decision 6 is closed by this change; open decision 1 (an AU org) is
  confirmed *not* to block it.
- **`.specclaw/changes/archive/001-fork-strip-writes-guards/spec.md`** — the deferral this change
  honours: *"After 001, rule 2 is guarded against field reads, response passthrough and
  rendered-output leakage on the fake-client path; it is not guarded against a live response field no
  test exercised."*
