# Design: Fork, strip every write tool, and stand up both CI guards

**Change:** 001-fork-strip-writes-guards
**Created:** 2026-09-08

## Technical Approach

Five moves, in dependency order.

**1. Merge upstream in.** `git remote add upstream`, `git fetch upstream`,
`git merge upstream/main --allow-unrelated-histories`. Both roots survive, so `git merge upstream`
stays available later and every inherited file is attributable by blame.

**2. Delete by directory.** Upstream organises tools by verb — `src/tools/{create,update,delete}` is
exactly the write surface. The strip is three directory deletions plus their handlers, not a
file-by-file audit. The NZ payroll tools are identified by `payrollNZApi` usage, which is a grep, not
a judgement call.

**3. Break the credential seam.** This is the blocker for everything after it.
`src/clients/xero-client.ts` currently runs

```ts
if (!bearer_token && (!client_id || !client_secret)) {
  throw Error("Environment Variables not set - please check your .env file");
}
```

at module scope, and exports `export const xeroClient = bearer_token ? new … : new …`. Handlers
import that singleton, tools import handlers, `ToolFactory` imports tools. So **importing the
registry throws unless credentials are present**, and no guard can boot headless. The refactor
converts the eager singleton into a lazy accessor and moves the credential check to first use.

**4. Build the guards on the one seam that already exists.** Every tool is constructed through
`CreateXeroTool(name, description, schema, handler)` in `src/helpers/create-xero-tool.ts`. That is
the universal choke point the proposal hoped for, and it is already there — so the guards enumerate
the registry through `ToolFactory` against a recording stub server, and drive each tool's handler
against a fake Xero client. No new funnel has to be introduced across 18 handlers.

**5. Wire CI and the negative controls.** Guards live in `src/__guards__/*.test.ts` so vitest's
existing `include: ["src/**/*.test.ts"]` picks them up with no config change. Negative controls are
synthetic tool modules under `src/__guards__/fixtures/`, registered into a throwaway registry — never
into the real one.

## Architecture

```
src/
  clients/
    xero-client.ts          ← refactored: lazy accessor, no module-scope throw
  helpers/
    create-xero-tool.ts     ← unchanged; already the universal tool seam
  tools/
    get/                    ← DELETED (get-timesheet is payrollNZApi)
    create/ update/ delete/ ← DELETED (25 write tools)
    list/                   ← 18 accounting reads retained, 8 NZ payroll reads deleted
    tool-factory.ts         ← registers ListTools only
  types/
    payroll-nz-types.ts     ← DELETED
    payroll-au-types.ts     ← DELETED (3-line orphan, nothing imports it)
  __guards__/
    pii-matcher.ts          ← shared TFN/BSB/account matcher (single implementation)
    tool-registry.ts        ← boots ToolFactory against a recording stub server
    fake-xero-client.ts     ← read-only fake; non-read methods throw; can plant PII
    tool-allowlist.ts       ← checked-in tool list (new-registration tripwire)
    guard-a-readonly.test.ts
    guard-b-no-pii.test.ts
    guard-c-no-payload-logs.test.ts
    negative-controls.test.ts
    fixtures/
      violation-write-tool.ts
      violation-direct-sdk-import.ts
      violation-tfn-field.ts
      violation-response-stringify.ts
scripts/
  tool-inventory.mjs        ← prints registered tool names
.github/workflows/ci.yml
.githooks/pre-commit
```

**Guard A mechanism.** Two static passes over `src/` source text plus one dynamic pass:
- static: the three write directories are absent; no `*Api` member matching the mutating-verb
  pattern is referenced; no handler imports `xero-node` directly
- dynamic: boot the registry, assert count is non-zero and exactly matches `tool-allowlist.ts` in
  both directions, then invoke every handler against `fake-xero-client` whose non-read methods throw

**Guard B mechanism.** Because tool output is MCP text content rather than a typed object, the check
is at two layers:
- static: no denied field is read anywhere under `src/` (property access **and** bracket access); no
  tool serialises a whole response or `.body`
- dynamic: drive every tool against a fake client returning a payload seeded with a synthetic TFN,
  BSB and account number, and assert the rendered text matches none of them via `pii-matcher.ts`

The dynamic half is what makes Guard B falsifiable now. The proposal expected to need recorded
fixtures for this and deferred it; the fake client supplies the planted values instead, so no Xero
org is required.

**PII matcher.** One module, used by Guard B, the negative controls and the pre-commit hook, so no
second copy can drift. TFN matching validates the ATO weighted checksum rather than matching any
nine digits, because a bare digit-run rule collides with ABNs, USIs, membership IDs and amounts in
cents — values this surface is required to emit. Separators are normalised before matching; BSBs
match `NNN-NNN` shape; scanning is recursive over string values.

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| *(whole upstream tree)* | Merge | `git merge upstream/main --allow-unrelated-histories` |
| `src/tools/create/` | Delete | 11 write tools |
| `src/tools/update/` | Delete | 13 write tools |
| `src/tools/delete/` | Delete | 1 write tool |
| `src/tools/get/` | Delete | `get-timesheet` — payrollNZApi |
| `src/tools/list/list-payroll-*.tool.ts` | Delete | 6 NZ payroll read tools |
| `src/tools/list/list-timesheets.tool.ts` | Delete | payrollNZApi |
| `src/handlers/*` (writes + NZ payroll) | Delete | ~33 handler files |
| `src/types/payroll-nz-types.ts` | Delete | Orphaned by FR3 |
| `src/types/payroll-au-types.ts` | Delete | 3-line orphan; nothing imports it |
| `src/tools/tool-factory.ts` | Modify | Register `ListTools` only |
| `src/tools/list/index.ts` | Modify | Drop deleted tool exports |
| `src/clients/xero-client.ts` | Modify | Lazy accessor; no module-scope throw or eager singleton |
| `src/handlers/*` (retained 18) | Modify | Use the lazy client accessor |
| `src/__guards__/pii-matcher.ts` | Create | Shared TFN/BSB/account matcher |
| `src/__guards__/tool-registry.ts` | Create | Headless registry enumeration |
| `src/__guards__/fake-xero-client.ts` | Create | Read-only fake; can plant PII |
| `src/__guards__/tool-allowlist.ts` | Create | Checked-in tool list |
| `src/__guards__/guard-a-readonly.test.ts` | Create | FR6 |
| `src/__guards__/guard-b-no-pii.test.ts` | Create | FR7 |
| `src/__guards__/guard-c-no-payload-logs.test.ts` | Create | FR9 |
| `src/__guards__/negative-controls.test.ts` | Create | FR8 |
| `src/__guards__/fixtures/violation-*.ts` | Create | 4 synthetic violations |
| `scripts/tool-inventory.mjs` | Create | FR12 |
| `.github/workflows/ci.yml` | Create | FR11 — no Xero secrets |
| `.githooks/pre-commit` | Create | FR10 |
| `.gitignore` | Modify | `fixtures/raw/` |
| `package.json` | Modify | `guard` / `inventory` scripts |
| `.specclaw/config.yaml` | Modify | test/lint/build commands |
| `README.md` | Modify | Fork provenance, read-only scope, AU intent |
| `HANDOFF.md` | Modify | State block + dated entry |

## Data Model Changes

None. No persistence, no schema. `tool-allowlist.ts` is a checked-in string array plus, per entry,
the handler file path — so a rename is a visible edit rather than a silent pass.

## API Changes

The MCP tool surface shrinks from 51 tools to 18. Every removed tool is a breaking change for any
consumer of upstream's server — acceptable and intended: this fork exists to be read-only and AU-
oriented, and it has no consumers today.

Required Xero scopes drop to accounting reads only, since `payrollNZApi` usage goes to zero. Payroll
scopes return in change 003 when the first Payroll AU tool lands.

## Key Decisions

**D1 — Guard A binds to capability, not to the tool name.** The panel's most-corroborated finding
(4 of 5 seats) was that a name-keyed allowlist records only that someone typed a string, leaving the
*changed-tool* hole open: an allowlisted `list-payruns` whose handler is later edited to `POST` stays
green forever. Guard A therefore asserts absent write directories, absent mutating API references,
absent direct SDK imports, and per-tool behaviour against a verb-enforcing fake client. The
checked-in list is retained but **documented in code as a new-registration tripwire**, not as proof
of read-only.

**D2 — Guard B's mandatory check is field-level, and it is dynamic as well as static.** The
proposal's shape assertion ("not a raw SDK object") established the returned object's *provenance*,
not the absence of a TFN — a hand-written mapper containing `taxFileNumber: emp.TaxFileNumber`
passed it cleanly. The probe then showed tool output is rendered text, so there is no runtime object
to discriminate at all. Both halves of the fix follow: a static denied-field-read check, and a
rendered-output check driven by planted PII. The phrase "structurally impossible" is removed from
all artifacts.

**D3 — The credential seam is refactored, and this is a prerequisite, not a nicety.** Without it the
guards cannot import the registry, and a guard that cannot boot is either skipped or passes on an
empty set — indistinguishable in CI from success. FR6f/FR6g exist for the same reason.

**D4 — The NZ payroll tools are deleted, overriding the build brief.** The brief says "keep the
reads, strip the writes". Evidence against it: all 8 payroll reads reach `payrollNZApi`, none reach
`payrollAuApi`, so none can answer an AU question. Keeping them means per-tool guard cost forever on
tools nobody will call, and they consume a consumer's context window. Deleting them also drops
`payrollNZApi` usage to zero, which simplifies the scope set. **Accepted cost:** wider divergence
from upstream, so a future upstream change to those paths conflicts. Mitigation: they are deleted in
the same isolated strip commit, and resolution is always "stay deleted".

**D5 — No waiver list.** The proposal's waiver was an escape hatch the judged party could edit and
would have covered 100% of the surface on day one. Because the mandatory Guard B check needs no
fixture, nothing requires waiving.

**D6 — No path manifest.** Deleted paths are not tracked in a separate checked-in list. Per the
architect's rebuttal, a resurrected file that nothing registers is dead code; what makes it a write
tool again is a *registration*, and that is what Guard A already catches. A manifest would be a
fourth hand-kept list diverging on the first rename.

**D7 — Negative controls are permanent, not ceremonial.** They run on every CI invocation, so "the
guard still catches" is re-proven at the same cadence as "the surface is still clean". AC10 makes
this concrete: deleting any single guard assertion must break a negative control.

**D8 — The runtime egress filter is out of scope.** Priced by the PO seat as a control with no
consumer in a change with no org, no payroll tool and no deployment. It binds to the first change
constructing a real client. What ships here instead is the honest coverage statement in `spec.md`
Notes, rather than an overstated claim.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **The client refactor breaks the 18 retained handlers.** Highest-probability failure — it touches every retained handler. | Do it as its own wave-2 task with `npm run build` green before guards are written. Type errors surface at compile time, not at runtime. |
| **A guard is written to pass rather than to catch.** The named risk in the proposal. | FR8 negative controls plus AC10 (no inert assertion). A guard that stops catching breaks a test. |
| **Guards can't boot headless and get skipped.** | FR5 + FR6g + AC5, and CI defines no `XERO_*` env at all, so a credential-dependent test cannot pass by accident. |
| **PII matcher false positives on ABN/USI/membership IDs.** | ATO checksum validation rather than digit-run matching; narrowing the pattern requires a negative control proving it still catches a real TFN. |
| **Static field check missed via dynamic key access.** Cannot be closed statically. | Recorded as a known limitation in `spec.md` Edge Cases; FR7c's rendered-output check is the second layer, and the runtime egress filter (D8) is the eventual third. |
| **`npm ci` fails on the inherited lockfile under Node 24.** | Verified in wave 1 immediately after the merge, before anything is built on it. |
| **Merge conflicts at the unrelated-histories merge.** | Root-file collision list is enumerated in FR1; anything unlisted is a stop-and-decide recorded in the build log. |

## Grounding sources

Every claim below is quoted from the file named.

- **`CLAUDE.md`** — the four hard rules this change implements. Rule 1: *"Every tool is read-only. No
  writes, in any version."* Rule 2: *"No tool may return a tax file number, a BSB, or a bank account
  number."* Rule 3: *"Both guards run over the entire registered surface, not per tool. A guard you
  have to remember to apply is not a guard."* Rule 4: *"Never log a payload."* Also the conventions
  followed here: *"Keep the upstream remote configured so fixes stay mergeable, and keep divergence
  in added files rather than edits to inherited ones wherever possible."*
- **`docs/2026-09-08-mcp-brief.md`** — §5 sets the guards' scope: *"Both run over the entire
  registered tool surface, in CI, and fail the build."* §9 step 1 sets this change's position:
  *"Fork, strip every write tool, stand up both guards in CI … Do the removal before adding 35 tools,
  so the guards are proven on a small surface and every later tool is born under them."* Its
  *"Timesheets and leave — inherited from the fork; keep the reads, strip the writes"* is the line
  D4 deliberately overrides, on the evidence that those reads are NZ-only.
- **`docs/2026-07-21-xero-integration.md`** — the founding claim this change's probe confirmed:
  *"payroll tools cover **employees, leave, timesheets only, NZ/UK regions**. Verified via the
  `src/tools/` tree: **no pay run, payslip, superannuation, super fund, or STP tools.**"* The probe
  adds hard evidence: zero `payrollAuApi` call sites, and `payroll-au-types.ts` is an unimported
  3-line orphan.
- **`HANDOFF.md`** — confirms this change is unblocked: Open Decision 1 (an AU org with a Custom
  Connection) *"Blocks Everything from build step 3"*, and this is step 1. Also the convention
  applied in FR10/AC15: *"Update `HANDOFF.md` at the end of any session that changed something …
  Never edit a past entry."*
- **`.specclaw/changes/001-fork-strip-writes-guards/party-report.md`** — D1, D2, D5, D6, D7 and D8
  each resolve a specific blocking finding; the report holds all 40 upheld findings.
