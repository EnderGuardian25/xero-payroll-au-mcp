# Proposal: Fork, strip every write tool, and stand up both CI guards

**Created:** 2026-09-08
**Revised:** 2026-09-08 — rewritten against the adversarial panel's 13 blocking findings (`party-report.md`)
**Status:** 🟡 Draft

## Problem

This repo holds four context documents and no code. Before any of the ~35 read-only Payroll AU
tools can be written, the foundation they are born onto has to exist and has to be safe.

Two facts make that foundation load-bearing:

1. **The fork ships write tools.** `XeroAPI/xero-mcp-server` registers tools that create invoices,
   update contacts, record payments and mutate timesheets. Forking it and adding payroll tools
   without a removal pass produces an MCP server that can mutate a client's payroll — the exact
   opposite of what `CLAUDE.md` promises, and the failure mode that makes this server worse than no
   server at all.
2. **Live Xero payroll payloads carry tax file numbers, BSBs and bank account numbers.**
   `GET /Employees/{id}` returns all three. **The harm is one of those values reaching the caller, by
   any route** — not merely a raw Xero response object being passed through. A hand-written mapper
   containing `taxFileNumber: emp.TaxFileNumber` is not a raw SDK object and leaks exactly the same
   PII into an LLM context window, which is an unrecoverable disclosure.

`CLAUDE.md` states both as hard rules and requires both guards to run **over the entire registered
surface, not per tool**, because "a guard you have to remember to apply is not a guard."

This is not a claim of present exposure — there is no org, no consumer and no deployment yet. It is
a claim about cost of deciding late. The surface is cheapest to guard while it is small and
unexposed, every later tool is then born under working guards, and one item in this change (the
fixture-capture policy, §7) is the only commitment here that no later change can undo.

## Proposed Solution

Establish the repository and both CI guards, on the inherited surface only. No Payroll AU tools in
this change.

### 1. Pull the fork — mechanic named, not deferred

- `git remote add upstream https://github.com/XeroAPI/xero-mcp-server`, `git fetch upstream`,
  then `git merge upstream/main --allow-unrelated-histories` onto this repo's history.
- **History is preserved** on both sides, so `git merge upstream` stays available and every
  inherited file is attributable by blame.
- **This repo's branch is renamed `master` → `main`** to match upstream, resolved now rather than at
  first merge.
- **Root-level collisions are enumerated and resolved explicitly during the build**, this repo's
  version winning for anything it already owns (`CLAUDE.md`, `HANDOFF.md`, `.gitignore`, `docs/`,
  `.specclaw/`) and upstream's winning for everything it introduces (`package.json`, `tsconfig.json`,
  `src/`, `LICENSE`). Any collision not on that list is a stop-and-decide, recorded in the build log.

### 2. Strip write tools, and the region-restricted payroll reads

- Delete every write tool — source files and registrations. Deleted, not unregistered, so there is
  nothing to re-register.
- **Also delete the fork's NZ/UK payroll read tools.** *This overrides the build brief's "keep the
  reads, strip the writes".* They are region-restricted, answer nothing an AU consumer can ask, and
  the NZ/UK gap is the entire reason this repo exists. Dead surface still consumes a consumer's tool
  budget and context window and still has to satisfy both guards per tool. Accepted cost: wider
  divergence from upstream, priced in §8.
- Keep the accounting reads — `BankTransactions` on the Superannuation Payable account is a named
  requirement in the brief.
- The before/after inventory is **generated from the tool registry**, not narrated in prose, so the
  strip's completeness is checkable.

### 3. A single read-only Xero client seam

The mechanism both guards hang off, and the answer to "which layer holds the read-only fact".

- One `ReadOnlyXeroClient` wrapper is the **only** path any tool may reach Xero through. It exposes
  read methods only.
- Every tool handler receives it by injection. **No handler imports the Xero SDK directly.**
- Tool registration is a pure function of nothing — constructible with no client, no credentials, no
  env vars — so both guards boot headless in CI.

### 4. Guard A — read-only, by capability

Name-keyed allowlists were the panel's most-corroborated defect: a name records that someone typed a
string, and an already-approved tool whose handler is later edited to `POST` stays green forever.

Guard A therefore asserts, over the whole registry:

- **No handler imports the Xero SDK directly** (static check) — so the wrapper cannot be bypassed.
- **The wrapper exposes no mutating method** (static check).
- **Every tool, invoked against a fake client that throws on any verb but `GET`/`HEAD`, completes
  without throwing** — capability evidence, per tool.
- **The registry and a checked-in tool list match exactly, in both directions**, and the list is
  asserted non-zero. Exact equality catches a stale entry whose tool was deleted; non-zero catches
  the vacuous pass. **Any registry-boot exception fails the guard** rather than yielding an empty
  enumeration that passes loudly green.

The checked-in list is described honestly in the code as a **new-registration tripwire**, not as
proof of read-only. The capability checks above are the proof.

### 5. Guard B — no TFN, BSB or bank account number, by field

- **Primary, and mandatory for every tool: a closed field set.** Every tool declares the output type
  it owns; that type's field set is checked in; the guard fails if a tool's declared output contains
  a denied field name (`TaxFileNumber`, `BSB`, `AccountNumber`, `BankAccount*`, and aliases) or any
  field not on its checked-in list. **This needs no fixture, no org and no live payload, so it is
  falsifiable on day one** — which the previous draft's checks were not.
- **Secondary: no tool returns an SDK response type.** Enforced statically at the type layer (tools
  are forbidden from declaring or returning SDK response types), not by runtime object sniffing —
  there is no runtime discriminator between a deserialized Xero response and a projection.
- **Deferred, deliberately: the fixture value scan.** It can only catch a value someone already
  captured to disk, and there are no fixtures until an AU org exists. It ships in change 002 with
  the harness. **Consequence stated plainly rather than papered over: after this change, rule 2 is
  guarded against declared-field leakage and against SDK passthrough, and is not yet guarded against
  a value arriving in a live response that no fixture exercised.** The runtime egress filter that
  would close that is bound to the first change constructing a real client against a real tenant.
- **No waiver list exists.** The previous draft's waiver was an escape hatch the judged party could
  edit, and would have covered 100% of the surface on day one. Because the mandatory check is
  field-level and needs no fixture, nothing needs waiving.

### 6. Permanent negative controls

The previous draft demonstrated the guards catching once, by hand, at merge. A guard that later
stops catching is indistinguishable in CI from a clean surface, so the planted violations become
checked-in fixtures run on **every** CI invocation, headless and credential-free:

- a synthetic write tool → Guard A must fail
- a synthetic tool importing the SDK directly → Guard A must fail
- a synthetic tool declaring `taxFileNumber` in its output → Guard B must fail
- a synthetic tool declaring an SDK response type → Guard B must fail

### 7. Fixture policy — decided now, because it is the one irreversible thing here

The harness itself ships in 002. Its **policy** ships here, because PII in a preserved history can
only be remedied by a rewrite, and §1 spends that remedy on merge lineage.

- **Two artefacts, not one word for both.** `fixtures/raw/` holds recorded Xero responses and is
  **git-ignored**. `fixtures/tool-output/` holds each tool's projected output and **is** checked in.
- **Redaction happens at capture**, before any file is written — never at review.
- A **pre-commit hook** runs the TFN/BSB/account matcher over staged fixture files, so the failure
  lands before the object exists rather than after a push.
- **No change in this repo may ever require a history rewrite.** Recorded as a standing constraint.

### 8. Upstream merge policy

Deleting inherited files is the largest possible edit to inherited files, and merge cleanliness was
asserted in the same breath. Stated as a decision: **upstream merges are expected**, the strip lands
as one isolated commit, and Guard A's registry checks — bound to capability, not to a path list —
are what catch a merge that resurrects a write tool. No separate path manifest: it would be a fourth
hand-kept list guarding a property Guard A already owns.

### 9. Logging discipline

Rule 4 gets a mechanism, not a sweep: a check that fails the build if any argument to a log call is a
response object or reachable from the HTTP client, plus a test driving every registered tool with a
captured logger, asserting emitted lines contain **only** tool name, tenant id and duration. The
positive field allowlist is the only falsifiable form of the prohibition — "never log a payload" has
no syntactic target; "log exactly these three fields" does.

## Scope

### In Scope

- Fork with the merge mechanic of §1, `upstream` configured, branch renamed to `main`
- Delete every write tool; delete the NZ/UK payroll reads; keep the accounting reads
- The `ReadOnlyXeroClient` seam and injection into every retained handler
- Guard A (capability-based) and Guard B (field-based), both over the whole registry, both in CI
- Permanent negative-control fixtures for both guards
- The rule-4 log check
- Fixture **policy** and `.gitignore` entries and the pre-commit hook (not the harness)
- CI workflow running lint, build, test, both guards and the negative controls — **with no Xero
  environment variables set**
- `config.yaml` `test_command` / `lint_command` / `build_command` filled
- Registry-generated before/after tool inventory
- `HANDOFF.md` updated

### Out of Scope

- **Any Payroll AU tool** — later steps; this change adds no tools
- **The fixture-capture harness and the fixture value scan** — change 002, sequenced with the first
  real AU fixture
- **The runtime egress filter** — bound to the first change with a real client against a real tenant
- **Bearer-token auth** — build order step 2
- **HTTP transport** — build order step 7
- Compliance math, permanently
- Publishing or packaging

## Impact

Added files, enumerated rather than estimated:

| Artefact | Files |
|---|---|
| `ReadOnlyXeroClient` wrapper | 1 |
| Guard A | 1 |
| Guard B | 1 |
| Checked-in tool list + per-tool output field sets | 2 |
| Negative-control fixtures | 4 |
| Rule-4 log check | 1 |
| Pre-commit hook + PII matcher module | 2 |
| CI workflow | 1 |
| `.gitignore`, `config.yaml`, `HANDOFF.md` edits | 3 |

**~18 added or edited files, plus deletions across the fork's tool tree** (count unknown until the
fork is pulled — the previous draft's "~50 tools" was unsourced, and the inventory in §2 is what
establishes it). Every retained handler is also touched, to take the injected client.

- **Complexity:** large, not medium. The removal is mechanical; the client seam is a co-change to
  every retained handler, and Open Question 1 below can turn the test runner into unbounded work.
- **Risk:** low to the repo — nothing here touches a live Xero org. The real risk is a guard written
  to pass rather than to catch, which is why §6 makes the negative controls permanent rather than
  ceremonial.

## Open Questions

1. **Does the fork ship a test runner, or must one be stood up?** Splits the estimate materially.
   Resolved by looking, in the first build task.
2. **Does the fork already have a single tool-response funnel**, or does the `ReadOnlyXeroClient`
   seam have to create one? Decides whether §3 is a small addition or a ~50-handler edit.
3. **Do the fork's own tests assert write-tool behaviour?** If so those tests are deliberately
   deleted with the tools, never silenced.
4. **Is deleting the NZ/UK payroll reads (§2) acceptable**, given it overrides the build brief? The
   proposal takes the decision rather than deferring it, but the brief is a repo document and this
   contradicts it in writing.

---

**To proceed:** Review this proposal and approve to begin planning.
