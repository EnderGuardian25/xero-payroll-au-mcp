# Verify report: 002-bearer-auth-tenant-selection

**Date:** 2026-09-09
**Branch:** `specclaw/002-bearer-auth-tenant-selection`
**Verdict:** **PASS**

## Gates

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **passed** |
| Build | `npm run build` | **passed** |
| Test | `npm test` | **passed** — 128 tests, 9 files |
| E2E | *(none)* | **not configured** — `build.e2e_command` is empty. **Not a pass**; no e2e evidence exists. No acceptance criterion here depends on it, so the verdict is not capped |

The suite also passes with `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` and `XERO_CLIENT_BEARER_TOKEN` all
unset (AC13), which is the property that keeps the guards trustworthy.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC1 | Inventory prints 19 tools including `list-tenants` | **met** | `npm run inventory` → 19 |
| AC2 | No positional tenant pick in `src` | **met** | grep for `tenants[0]` / `data[0].tenantId` → nothing |
| AC3 | No handler reads `xeroClient.tenantId` | **met** | grep over `src/handlers/` → nothing |
| AC4 | Two tenants, no `tenantId` → error naming both | **met** | `resolve-tenant.test.ts`; asserts both ids **and** both organisation names appear |
| AC5 | Explicit `tenantId` returns that organisation, named in output | **met** | Resolution test plus all 19 tools rendering `resolved.tenant.tenantName` |
| AC6 | Unauthorised `tenantId` errors, listing what is authorised | **met** | `resolve-tenant.test.ts` |
| AC7 | Single tenant, no `tenantId` → succeeds | **met** | `resolve-tenant.test.ts`, and the driver's "omit" pass over all 19 tools |
| AC8 | Concurrency isolation | **met, by construction rather than by race test** — see note below |
| AC9 | Denied field absent from output; warning names tool and path, not value | **met** | `egress-filter.test.ts` |
| AC10 | Clean response unchanged by the filter | **met** | Asserted byte-identical, including an ABN, a currency amount, an ISO date and a tenant GUID |
| AC11 | Tenant GUID not flagged by the matcher | **met** | 3 cases in `pii-matcher.test.ts`, including a GUID beside a bank cue |
| AC12 | All guards and negative controls pass; count pinned at 19 | **met** | `EXPECTED_TOOL_COUNT = 19` |
| AC13 | Suite passes with no `XERO_*` set | **met** | See Gates |
| AC14 | Lint, build, test pass | **met** | See Gates |
| AC15 | Mint helper has no client secret and writes nothing | **met** | No `client_secret` reference; **no `node:fs` import at all**, so no write API is reachable |
| AC16 | No committed token or secret literal | **met** | `git grep` over `src` and `scripts` → nothing |
| AC17 | README documents smoke test, scopes, demo-company limitation | **met** | All three present |
| AC18 | HANDOFF rewritten, entry prepended, no past entry edited | **met** | Both prior entries diffed byte-identical against `HEAD` |

**18 of 18 met.**

### AC8, stated precisely

AC8 asked for two concurrent calls on different tenants each receiving their own organisation's data.
What is verified is the property that makes that true: **no shared mutable tenant state exists.**
`updateTenants()` no longer assigns `tenantId`, no handler reads it (AC3), and the resolved tenant is
a parameter threaded tool → handler → Xero call. A race needs shared state to race over, and there
is none.

I did not write a two-tenant concurrency test, because against the fake client it would assert the
absence of a bug the code can no longer express, and would pass equally if the argument-threading
were reverted to a single shared field with a lucky interleaving. The honest statement is
**structural, not empirical** — worth knowing when the first real multi-organisation caller appears.

## Notable outcomes

**The bug had two copies.** Upstream picked the first connection in `updateTenants()` *and* again in
the custom-connections token exchange, written against a different variable — so a grep that found
one would have missed the other. Reading the SDK also showed "first" is not insertion order: it
sorts connections by `updatedDateUtc` descending, so the chosen organisation moves on its own. A
test pins that resolution does not depend on order.

**The guards caught this change three times, and each catch was correct.**

1. Guard A flagged `xeroClient.updateTenants` as mutating, by name. It is a read — xero-node's
   implementation is `queryApi('GET', '/connections')`. 001's comment on that pattern had asserted
   "no retained handler calls it", which 002 falsified. The pattern was **not** loosened; the fake
   now stubs the method so it is recorded as the read it is. Verified afterwards that a real mutation
   still throws and an unstubbed `update*` still fails.
2. Guard B reported zero usable tools. The driver's identifier heuristic required a non-letter before
   `id`, so camelCase `tenantId` became the literal `"synthetic-tenantId"`, every driven call failed
   resolution, and **a tool that renders nothing renders no PII.** Guard B refused to pass in that
   state, which is exactly the vacuous-green failure 001 was designed against. Fixed at the source.
3. Guard C caught the egress filter's own new `console.warn`.

**One rule was deliberately extended, and it is flagged rather than buried.** Guard C's permitted log
vocabulary grew by three words — `kind`, `path`, `finding` — so a redaction can say *where* it
happened. That widens rule 4 from "tool names, tenant identifiers, durations" to include a field
path. The justification is that a field path is metadata about a response, not the response. An
earlier draft added ten words including `value`, `text` and `content`; that was trimmed to three.
**This is the decision to re-examine if anyone widens the list again.** Verified afterwards that
`console.log(response.kind, response.path)` is still caught.

**A guard-infrastructure invariant is now pinned.** The fake's authorised tenant must equal the
driver's synthesised GUID. When they drifted, Guard B reported green while checking nothing.

## Known limitations, carried forward

- **Not smoke-tested against Xero.** PKCE consent needs a human browser, so the live path is
  documented and unexecuted. Nothing here proves a real token works end to end.
- **The token is per-process, not per-call.** stdio MCP has no per-request header. This is per-call
  *tenant* selection against a per-process *identity* — recorded as open decision 7.
- **A PII value Xero places in report cell text** still reaches the caller unless the matcher
  recognises it. The egress filter narrows this gap but does not close it: the report formatter
  remains a shape guard, not a redactor.
- **The egress filter will occasionally redact a legitimate value** — a nine-digit reference that
  passes the TFN checksum. Accepted as the correct trade for a backstop; the warning makes it
  diagnosable.
- **No consumer reads the redaction counter.** There is no operator and no deployment, so it exists
  for assertability rather than observability.

## Scope deviation

None. 10 tasks planned, 10 delivered, no task added. Files touched match the design's file-changes
map, plus two the map did not name and which are recorded here: `src/helpers/tenant-arg.ts` (the
shared `tenantId` argument and resolution-error conversion, extracted rather than repeated across 19
tools) and `src/__guards__/tool-driver.ts` (the identifier-heuristic fix above).

**Verdict: PASS** — 18/18 acceptance criteria met, all configured gates green, and every guard
verified still able to fail.
