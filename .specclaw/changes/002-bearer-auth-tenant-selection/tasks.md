# Tasks: Bearer-token auth with explicit tenant selection

**Change:** 002-bearer-auth-tenant-selection
**Created:** 2026-09-09
**Total Tasks:** 10

## Summary

10 tasks in 5 waves. Wave 1 relocates the PII matcher so production may use it, and builds tenant
resolution. Wave 2 threads the tenant through all 18 handlers — the widest edit. Wave 3 exposes it on
the tools and adds `list-tenants`. Wave 4 adds the egress filter at the single funnel plus its
guards. Wave 5 adds the mint helper and the docs.

Ordering rationale: the matcher move (T1) is a prerequisite for the egress filter but touches import
paths the guards depend on, so it lands first and alone. Handlers before tools, because a tool cannot
pass a tenant to a handler that does not accept one. The egress filter comes after the surface is
final so its negative controls exercise the real 19-tool registry.

## Tasks

### Wave 1 — Foundations: shared matcher, tenant resolution

- [ ] `T1` — Move the PII matcher into production reach
  - Files: `src/security/pii-matcher.ts` (from `src/__guards__/pii-matcher.ts`),
    `src/__guards__/pii-matcher.test.ts`, `src/__guards__/scan-pii-fields.ts`,
    `src/__guards__/fake-xero-client.ts`, `scripts/scan-staged-fixtures.mjs`
  - Estimate: small
  - Kind: refactor
  - Notes: Move only — **no behaviour change**. Update every import, including the pre-commit hook's
    `dist/` path. Production code may not import from `__guards__`, which is why the move is
    necessary rather than cosmetic (design D6). 001's FR7d single-copy assertion must still pass
    afterwards; check its path assumptions. Add the AC11 case here while touching the tests: a tenant
    GUID must not be flagged. `npm test` green before moving on.

- [ ] `T2` — Build tenant resolution, and stop the client choosing
  - Files: `src/clients/resolve-tenant.ts`, `src/clients/xero-client.ts`,
    `src/clients/__tests__/resolve-tenant.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: `resolveTenant(requested?) -> {tenantId, tenantName}` implementing spec FR3 exactly:
    supplied+authorised → use; supplied+unauthorised → error listing authorised tenants;
    omitted+single → use; **omitted+multiple → error naming id and organisation of each**. Never
    pick. Delete `this.tenantId = this.tenants[0].tenantId` from `updateTenants()` and stop
    maintaining that field for handler use (design D1/D2) — leaving it populated would invite the
    next contributor to read it. Handle zero authorised tenants and a failing `GET /connections` as
    explicit errors, never a fallback (spec Edge Cases). Tests cover all five branches plus zero
    tenants.

### Wave 2 — Thread the tenant through the handlers

- [ ] `T3` — Give all 18 handlers an explicit tenant parameter
  - Files: all 18 `src/handlers/*.handler.ts`
  - Estimate: large
  - Kind: refactor
  - Depends: T2
  - Notes: The widest edit in the change. Each handler takes the resolved tenant id as an argument
    and passes it to the Xero call in place of `xeroClient.tenantId`. **No handler may read
    `xeroClient.tenantId` afterwards** (spec AC3) — that is the concurrency fix, not a tidy-up:
    the field is shared mutable state and per-call assignment would race (design D1). Mechanical but
    touches everything, so `npm run build` and `npm test` must both be green at the end before tools
    change.

- [ ] `T4` — Add the connections handler
  - Files: `src/handlers/list-xero-connections.handler.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T2
  - Notes: Reads the authorised connections for the current token — tenant id, organisation name,
    connection type — returning the repo's usual `XeroClientResponse<T>` shape. Reuse whatever
    `resolve-tenant.ts` already does to read connections rather than calling Xero a second way.

### Wave 3 — Expose it on the tool surface

- [ ] `T5` — Add optional `tenantId` to all 18 tools and name the organisation in output
  - Files: all 18 `src/tools/list/*.tool.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T3
  - Notes: Each tool's schema gains `tenantId: z.string().optional()` with a description telling an
    MCP client to get it from `list-tenants`. Each calls `resolveTenant()`, passes the id to its
    handler, and **states the organisation name in the successful response** (spec FR4) — a consumer
    must never have to infer which org it read. Optional, not required, so the
    single-organisation case is unchanged and no existing call breaks (design D3). A resolution
    error must surface as the tool's error text, in the same style as the existing error branches.

- [ ] `T6` — Add the `list-tenants` tool and register it
  - Files: `src/tools/list/list-tenants.tool.ts`, `src/tools/list/index.ts`,
    `src/__guards__/tool-allowlist.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T4, T5
  - Notes: The discovery tool every other tool's `tenantId` depends on. Registering it takes the
    surface 18 → 19, so the checked-in tool list and its pinned count both change — **deliberately**.
    The list's own comment says appending to it is not an approval step; that still holds, and the
    justification here is that this is a read tool added by this change on purpose. Verify with
    `npm run inventory` (spec AC1).

### Wave 4 — The runtime egress filter and its guards

- [ ] `T7` — Build the egress filter and wire it into the single funnel
  - Files: `src/security/egress-filter.ts`, `src/helpers/create-xero-tool.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T6
  - Notes: `withEgressFilter(toolName, handler)` scans the awaited result, redacts matched
    substrings, emits one warning per finding carrying **tool name and field path only, never the
    value** (rule 4), and increments a counter. Must inspect non-text content too, or that becomes a
    bypass (spec Edge Cases). **A throw inside the filter propagates** — a filter that fails open is
    worse than none because it looks like one. Wire it in `CreateXeroTool`, which every tool is built
    through, so the whole surface and every future Payroll AU tool inherit it from one file
    (design D4). Closes `HANDOFF.md` open decision 6.

- [ ] `T8` — Guard the filter, permanently
  - Files: `src/__guards__/egress-filter.test.ts`,
    `src/__guards__/fixtures/violation-egress-tfn.ts`
  - Estimate: medium
  - Kind: test
  - Depends: T7
  - Notes: Negative control in 001's style, run on every CI invocation: a synthetic tool returning a
    checksum-valid TFN must have it absent from rendered output, with the warning naming tool and
    field path and **not** the value (spec AC9). Plus NFR5's counterpart — a clean response passes
    through unchanged (AC10) — because a filter that mangles good output will be switched off. Assert
    the filter is actually reached via `CreateXeroTool` rather than only unit-tested in isolation,
    and pair every universal assertion with a non-zero count (NFR4).

### Wave 5 — Minting, docs, handoff

- [ ] `T9` — PKCE token-minting helper
  - Files: `scripts/mint-token.mjs`, `package.json`
  - Estimate: medium
  - Kind: impl
  - Notes: Local authorization-code + PKCE: generate `code_verifier`/`code_challenge`, open the
    consent URL, serve a loopback redirect, exchange the code, print access token, refresh token and
    authorised tenants to stdout. Takes `XERO_CLIENT_ID` only — **no client secret exists** for a
    PKCE app (design D7). **Writes nothing to disk**, so no token file can be committed by accident
    (NFR1 / AC15). Report a busy loopback port instead of hanging (spec Edge Cases). Do **not** run
    it against Xero — consent needs a human browser, and the smoke test is the user's to perform.

- [ ] `T10` — Docs, handoff, and final gates
  - Files: `README.md`, `HANDOFF.md`
  - Estimate: medium
  - Kind: docs
  - Depends: T8, T9
  - Notes: README gains the smoke-test procedure (mint → `list-tenants` → a read, against the demo
    company) with its limitation stated plainly — the demo company returns a pre-2022 9% super rate,
    so it proves plumbing and **no fixture may be captured from it** (spec FR10). Record the PKCE
    scope set and that granular scopes mean `accounting.journals.read` does not exist (FR11). State
    the honest limit: the token is per-process, so this is per-call *tenant* selection against a
    per-process *identity*. `HANDOFF.md`: rewrite the state block, close open decision 6, note open
    decision 5 is moot, and **prepend** a dated entry without editing any past one (AC18). Then run
    the full gates credential-free and confirm AC1–AC18.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**
```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration
  - Depends: <task ids> (if any)
  - Notes: <additional context>
```
