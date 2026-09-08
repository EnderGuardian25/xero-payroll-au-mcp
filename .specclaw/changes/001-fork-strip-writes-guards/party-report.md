# Party Report: 001-fork-strip-writes-guards

**Reviewed:** 2026-09-08
**Tier:** deep (classifier) — Establishes CI-enforced guards as hard blocks in the merge path for read-only and PII protection, and adds release machinery that gates all future changes to the tool surface.
**Panel:** party-po(opus), party-architect(opus), party-ba(opus), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

42 findings: 13 BLOCK, 21 WARN, 6 NOTE upheld — 2 withdrawn

## Findings

### [BLOCK] party-architect — Guard A keys on the tool name, the one thing the proposal itself says does not carry the write/read fact
**Quotes:**
> Detection is by explicit
> allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately.

**Quotes:**
> Name-pattern heuristics
> (`create-`, `update-`, `delete-`) are a secondary signal, not the mechanism — a write tool named
> `post-payrun` would pass a heuristic and must not pass the guard.

**Problem:** These two sentences argue against each other. The second establishes that a tool's name is not evidence of what the tool does; the first then makes the name the sole key of the mechanism. The property being guarded — "can this tool mutate" — is owned by the handler (which SDK call it makes), not by a string in a registry. A tool already on the allowlist whose handler is later edited to call a create/update SDK method passes Guard A forever, and so does a write tool added under an already-approved name. The allowlist detects *new registrations*, a different and weaker property than *read-only*. Four seats reached this line by four different arrows in round 1 — `party-security` on capability-vs-string ("the reviewed party controls the verdict"), `party-ba` on the unearned word "approved", `party-visionary` on allowlist-append becoming muscle memory — and all three converge on the same remedy I named: bind the entry to the client/verb layer. That convergence strengthens this finding; the layering claim is the structural form of it and is unrebutted by any seat.

**Fix:** State the layer the read-only fact is read from — every tool handler obtains its Xero client through a single injected read-only wrapper, and Guard A asserts the wrapper exposes no mutating method and that no handler imports the SDK directly. Keep the name allowlist as the *new-registration* tripwire it actually is, and say so.

**Status:** upheld

### [BLOCK] party-architect — The "shape assertion" declared to be Guard B's mechanism has no discriminator at the layer it is placed
**Quotes:**
> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.

**Problem:** The artifact places a type-identity decision in a runtime value assertion and calls that placement load-bearing ("This is the mechanism"). At runtime a deserialized Xero response and a hand-defined projection are both plain objects with string keys; the proposal names no brand, class, or marker a test could interrogate. An implementer must invent the discriminator, and the candidates are four different mechanisms with four different blast radii across all ~50 inherited tools: a nominal wrapper type, a per-tool runtime schema, a per-tool key allowlist, or a static lint rule forbidding SDK return types. `party-ba`'s BLOCK ("hand-defining a shape establishes provenance of the object, not absence of the fields") and their WARN on the same phrase ("object identity, or any shape structurally carrying the SDK's fields — `return {...response}` passes the first, fails the intent") are independent confirmation that this single sentence admits materially different builds, and `party-security`'s BLOCK #3 shows the strongest reading still does not deliver the stated property. Their findings are about what the assertion fails to *prove*; mine is that nothing in the artifact says what it *inspects*. Both stand, and the second must be answered before the first can be.

**Fix:** Name the discriminator in the artifact. The cheapest seam consistent with "hand-defined shape" is static: every tool declares an output type it owns, tools are forbidden from returning SDK response types, and the guard is a compile-or-lint assertion over the registry rather than a runtime inspection of values. Whichever is chosen, say which layer holds it, because that choice decides whether Guard B needs to call tools at all.

**Status:** upheld

### [BLOCK] party-architect — "Recorded fixture" is an unspecified shared contract, and both readings break Guard B
**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

**Quotes:**
> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that

**Problem:** A fixture is shared by two components — the capture harness that writes it and Guard B that scans it — and the artifact never says which side of the tool boundary it records. If it is the recorded Xero response, an honestly captured AU employee fixture *contains* a TFN by construction and Guard B fails on every honest fixture, or forces pre-redaction and then proves nothing about any tool. If it is the tool's return value, the scan is meaningful but the fixture is no longer a response sample and cannot verify a hand-defined shape against reality. The design needs both artefacts and the proposal has one word for both. Round 1 makes this the panel's most cross-corroborated structural gap, and each seat's reading resolves the ambiguity differently: `party-security` and `party-visionary` both read it as the raw response and derive a git-history disclosure from that; `party-visionary`'s NOTE independently proposes exactly the split I asked for ("hold the raw recorded response *and* the expected hand-defined output"); `party-ba` and `party-po` read the scanned object as the thing that is empty on day one. Four seats reasoning correctly from three incompatible definitions of the same noun is the defect. Upheld and strengthened.

**Fix:** Split the contract in the artifact: raw response recordings (input, never the scan target, held to whatever handling rule the repo sets) versus tool-output recordings (what Guard B scans, produced by replaying the tool against the raw recording). State the on-disk location and naming for each and which one "the mechanism later tools record into" refers to.

**Status:** upheld

### [BLOCK] party-architect — Step 1 merges two root histories into a non-empty tree, and the mechanic is deferred to an open question that step 1 depends on
**Quotes:**
> **1. Pull the fork.** Clone `XeroAPI/xero-mcp-server` into this repo, preserving its history, with
> `upstream` configured as a remote so later fixes stay mergeable.

**Quotes:**
> This repo holds four context documents and no code.

**Quotes:**
> Note the current branch is `master` while the fork's default is `main` — worth resolving now rather than at first merge.

**Problem:** "Clone X into this repo, preserving its history" is not a single operation. This repo already has its own history and a populated tree; the fork has its own unrelated root. Combining them requires a named choice — merge unrelated histories onto `master`, replay this repo's commits onto the fork's base, or subtree — and each produces a different answer for the two things the proposal says it cares about: whether `git merge upstream` stays clean, and whether existing files survive. Every file present in both trees is a co-change at this merge and the proposal enumerates none. The branch mismatch is correctly spotted and then filed as Open Question 1, so the first step of the change is blocked on an unresolved question in the same document. No seat addressed this; `party-visionary`'s WARN on merge cost is explicitly the recurring future tax ("This is not the merge cost of this commit — that cost is zero"), which is the complementary horizon, not this one. Unrebutted.

**Fix:** Specify the merge mechanic and the branch outcome in the Proposed Solution rather than the Open Questions, and enumerate the root-level files that exist on both sides along with which version wins for each.

**Status:** upheld

### [WARN] party-architect — Both guards must run without credentials or an org, and no stub seam is named
**Quotes:**
> **3. Guard A — read-only, over the whole registered surface.** A test that boots the server's tool registry, enumerates every registered tool, and asserts none can mutate.

**Quotes:**
> - **Risk:** low for the repo, high in what it prevents. Nothing here touches a live Xero org — there
>   is no org yet.

**Quotes:**
> - **Bearer-token auth** — build order step 2, a change of its own

**Problem:** Booting the registry in CI requires registration to be constructible with no Xero client and no credentials, while the proposal defers all auth work to a later change and states no org exists. Guard B's shape assertion is worse: inspecting a return value requires *calling* the tools. The artifact names no stub, no fake client, and no separation between "register tools" and "construct a Xero client", so whether these tests can run headless is left to the implementer — the failure mode where a guard is written, cannot boot, and is quietly skipped. Two round-1 findings make this materially more serious than I filed it. `party-security`'s BLOCK #2 shows the skip is not even needed for the fail-open outcome: every assertion here is universally quantified, so a registry that boots to zero tools because a credential is absent passes *loudly green*. `party-ba`'s WARN shows the same env-dependence can shrink the surface silently through conditional registration. The stub seam and the non-zero-count floor are one fix, not two, and I state that coupling rather than restating their findings. I keep the severity as filed for traceability; on the merits it now reads as the deterministic-test-seam half of a BLOCK.

**Fix:** Name the seam: registration must be a pure function of nothing (or of an injected client interface), the guards construct it with a fake client, and the artifact states that CI runs both guards with no Xero environment variables set. Fail the guard on any boot exception rather than letting an empty enumeration stand, and state that the "deliberately planted violation" demonstration runs in that same headless configuration.

**Status:** upheld

### [WARN] party-architect — Open Question 2 and Open Question 4 must resolve together, or Guard B ships waived across most of the surface
**Quotes:**
> Recommend fail-closed with an explicit checked-in waiver list, so an unfixtured tool is a visible
>    decision rather than a silent gap.

**Quotes:**
> Recommend keeping
>    the reads for now — the brief says "keep the reads, strip the writes" — and revisiting when the tool
>    count is known.

**Quotes:**
> - Real fixture data from a live AU organisation — blocked on Open Decision 1

**Problem:** These three lines are coupled and the proposal treats them as independent. Guard B is fail-closed on missing fixtures; real fixture data is out of scope; and the recommendation is to keep the inherited accounting and NZ/UK payroll reads. Every retained tool is therefore unfixtured at merge and lands on the waiver list. Four seats filed the day-one-waiver outcome (`party-po` BLOCK, `party-ba` BLOCK, `party-security` BLOCK #5, `party-visionary` WARN #3), which corroborates the consequence. The part that remains only mine is the coupling itself and its second-order effect: the region-restricted NZ/UK reads can *never* come off the waiver list, because an AU organisation cannot produce a fixture for them, so the waiver list silently acquires two populations with different lifetimes — "not captured yet" and "structurally unfixturable" — and nothing distinguishes them. Every proposed remedy in round 1 that keys on waiver-list emptiness or a shrinking count (`party-visionary`: "fail when a fixture source is configured and the waiver list is non-empty"; `party-security`: expiry per entry) is defeated by the permanent population unless OQ4 is decided in this change. I state that as a coupling fact; the value question about the NZ/UK reads is `party-po`'s.

**Fix:** State the coupling in the artifact and pick the resolution: either the retained inherited reads are decided in this change so the waiver list has finite, shrinking membership, or the waiver list carries two distinct reasons with different lifetimes and Guard B treats them differently. Also state what Guard B asserts about a tool it has waived — nothing, or the shape assertion only.

**Status:** upheld

### [WARN] party-architect — "TFN, BSB and bank account number shapes" is a shared contract with no definition, and the domain is full of collisions
**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

**Problem:** This is a detector every future fixture author and every future tool must live with, and the artifact gives an implementer three names. The open decisions are load-bearing and mutually exclusive: bare digit-run regexes versus checksum-validated matches; whether separators are normalised first; whether the scan is over serialised JSON text or over leaf values with their keys. A bare digit-run rule collides with values this surface is *required* to return — ABNs and USIs on `/Superfunds`, `SuperMembershipID`s, employee numbers, `YYYYMMDD` values. One implementer ships a guard that fires on every superannuation fixture; another ships a mod-11 matcher that fires on almost nothing. Both satisfy the sentence as written. `party-security`'s NOTE reaches the same collision set from the fail-open-drift direction and supplies a concrete definition (ATO weighted checksum, separator normalisation, BSB prefix set, recursive string scan); that is compatible with this finding rather than competing with it — it is a candidate answer to the question the artifact leaves open, and their BLOCK #3 fix of one shared matcher implementation across build-time and run-time makes defining it once a structural requirement, not a preference. Upheld and strengthened.

**Fix:** Define each pattern in the artifact — digit shape, normalisation, checksum or not, keyed or value-only — name the single module that owns it, and state which known-safe identifier classes (ABN, USI, membership IDs) must not trip it, since those are values this surface is expected to emit.

**Status:** upheld

### [NOTE] party-architect — Three hand-maintained lists keyed by tool name, and the added-file estimate accounts for one
**Quotes:**
> - **Files affected:** ~60 (estimated) — the fork's tool tree is ~50 tools; deletions dominate, plus
>   ~4 added files (two guards, an allowlist, a CI workflow)

**Quotes:**
> Inventory the surface before and after, and record both counts in the change log so the removal is auditable.

**Quotes:**
> `build.test_command`, `lint_command` and `build_command` are all empty in `config.yaml` and need
>    filling as part of this change.

**Problem:** The change introduces at least three artefacts keyed by tool name — Guard A's allowlist, OQ2's fixture waiver list, and the change-log before/after inventory — none derived from the registry and each maintained by hand, so they diverge on the first tool added or renamed. The co-change set of this commit is larger than Impact states: the waiver list, the fixture scaffolding, the `config.yaml` command keys, `HANDOFF.md`, and the planted-violation artefact are all committed to elsewhere in the document and absent from the count. The proposal also never says what happens to an allowlist entry whose tool no longer exists. `party-po`'s WARN #4 owns the pricing reading of the same line and I defer that half to them; what stands here is the co-change enumeration and the stale-entry rule, and on the latter two other seats arrived independently at exactly the bidirectional match I asked for — `party-security` ("enumerated count must equal the checked-in allowlist length exactly (not 'is a subset of')") and `party-visionary` ("derive it from the registry (fail on entries with no matching tool) so it cannot silently rot"). Three seats converging raises the confidence, not the severity: there is still no correctness consequence for the guards themselves in this commit.

**Fix:** List the added files against the In Scope items rather than estimating, and state the stale-entry rule — allowlist and registry must match exactly in both directions, not just registry ⊆ allowlist.

**Status:** upheld

### [WARN] party-architect — Rebutting party-visionary's path manifest: it is a fourth hand-kept list keyed by path, guarding a property Guard A already owns
**Quotes:**
> **2. Strip every write tool.** Delete the write tool source files and their registrations — not
> merely leave them unregistered. Deleted, so there is nothing to accidentally re-register.

**Quotes:**
> Detection is by explicit
> allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately.

**Problem:** `party-visionary`'s delete/modify-conflict observation is correct and I do not contest it. Their proposed remedy — "a path list checked in as a manifest, and a test that fails if any manifested path reappears in the tree" — is a second mechanism for a fact the artifact already assigns to Guard A, keyed on something weaker. A resurrected source file that nothing registers is dead code, not a capability; the thing that makes it a write tool again is a *registration*, and a registration absent from the allowlist is precisely what Guard A is specified to fail closed on. So the manifest adds a fourth hand-maintained tool-keyed list (alongside allowlist, waiver list, inventory — my NOTE above) whose only unique coverage is upstream reintroducing a file that also reintroduces its own registration, which Guard A catches anyway. It diverges from the allowlist on the first rename or path move, and then two files disagree about what is forbidden. The real gap their finding exposes is not a missing manifest: it is that the strip's completeness is asserted by a prose count in the change log rather than derivable from the registry, which is the same defect as the inventory in my NOTE.

**Fix:** Do not add a path manifest. Make Guard A's registry check the single source of truth for "no write tool exists on the surface", which requires it to bind to capability rather than name (my first finding), and let the before/after inventory be generated from the registry so the strip's completeness is checkable rather than narrated.

**Status:** upheld

### [WARN] party-architect — Rebutting party-po's cut line: the shape assertion may not be separable from the fixture harness until the discriminator is named
**Quotes:**
> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.

**Quotes:**
> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that

**Problem:** `party-po` proposes a cut at "Guard A + Guard B shape assertion + CI now, value scan and fixture harness later", on the stated ground that the shape assertion is "each fully testable with no fixture". Whether that is true is decided by the discriminator the artifact never names, which is my second finding. If the shape assertion is what the sentence literally says — an inspection of a tool's *return value* — then it requires invoking every tool, which requires a recorded input to invoke it against, which is the fixture harness. Under that reading the two halves of party-po's cut are one artefact and the line does not exist. It becomes a real line only if the assertion is relocated to a static seam (declared output types, a lint rule forbidding SDK return types), which needs no invocation and therefore no harness. `party-visionary`'s NOTE pushes the opposite way: it proposes the fixture *become* the shape-verification mechanism, which welds them together permanently. I take no position on what ships first — that is party-po's arrow. I state the coupling fact: as written, shape assertion and fixture harness are the same mechanism, and only naming the discriminator can decouple them.

**Fix:** Resolve the discriminator in the artifact before any cut line is drawn, and state explicitly whether the shape assertion invokes tools. If it does, say that it and the fixture harness are one deliverable; if it does not, say which static seam carries it.

**Status:** upheld

### [WARN] party-architect — Rebutting party-security's egress guard: the "single response path every tool returns through" is a seam the proposal does not establish, and creating it is an unnamed co-change to every tool
**Quotes:**
> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.

**Quotes:**
> - **Files affected:** ~60 (estimated) — the fork's tool tree is ~50 tools; deletions dominate, plus
>   ~4 added files (two guards, an allowlist, a CI workflow)

**Problem:** I do not contest `party-security`'s BLOCK #3 — a build-time check over fixtures cannot cover a live response, and a hand-mapped `taxFileNumber` field satisfies the shape assertion. Their fix presumes an architectural fact the artifact never states: "the single response path every tool returns through". Nothing in this proposal establishes that one exists. Each tool in the inherited surface returns its own value from its own handler; if there is no shared return funnel, an egress guard has nowhere to sit, and *creating* the funnel is a co-change touching every one of the ~50 retained handlers — the largest edit to inherited files in the change, and absent from both the Impact estimate and the In Scope list. That matters structurally in both directions: the funnel is also the natural home for the shape discriminator (my second finding) and for the shared TFN/BSB matcher their own fix wants build-time and run-time to share (my seventh), so it is probably the right seam and is exactly the sort of thing that must be named in the artifact rather than assumed by a reviewer's fix. Since I have not read the fork, I assert only that the proposal does not name it.

**Fix:** Have the artifact state whether a single tool-response funnel exists or is being introduced, and if introduced, count it as a co-change to every retained handler. Then place the shape discriminator, the shared PII matcher, and any egress check on that one seam rather than specifying three mechanisms at three layers.

**Status:** upheld

### [BLOCK] party-ba — Guard B targets raw passthrough, but the stated harm is PII emission; a hand-defined shape carrying a TFN satisfies both assertions

**Quotes:**
> **Live Xero payroll payloads carry tax file numbers, BSBs and bank account numbers.**
>    `GET /Employees/{id}` returns all three. Any tool that passes a raw Xero response object through
>    to the caller leaks PII into an LLM context window, which is an unrecoverable disclosure.

> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.

**Problem:** The problem statement names raw passthrough as the disease, but raw passthrough is only one route to the harm. The harm is a TFN/BSB/account number reaching the caller. A tool whose author hand-writes `{ employeeId, name, taxFileNumber, bankAccounts }` — mapped field by field, from a well-meant "return the employee record" tool — is not a raw SDK object and passes the shape assertion cleanly, while emitting exactly the three values `CLAUDE.md` rule 2 forbids. The claim "makes leakage structurally impossible" is therefore not supported by the mechanism described: hand-defining a shape establishes provenance of the object, not absence of the fields. Nothing in this change constrains which fields a hand-defined shape may contain. Corroborated independently by party-security (`a hand-written mapper with taxFileNumber: emp.TaxFileNumber ... satisfies the shape assertion completely`) and by party-architect, who adds that the proposal names no discriminator by which a test could even tell a projection from a raw response — which means the shape assertion is not merely too narrow, it is currently unimplementable as stated. Three seats reaching the same conclusion from three different arrows strengthens rather than duplicates this: the premise "shape assertion ⇒ no PII" is the single load-bearing claim of rule 2's guard, and it is false.

**Fix:** Restate the problem as "no tool's return value may contain a TFN, BSB or bank account number, by any route" and make the load-bearing assertion field-level (a denied-field-name/closed-field-set check over every tool's declared return type), with the raw-object check demoted to a secondary signal — the same demotion the proposal already applies to Guard A's name heuristics.

**Status:** upheld

### [BLOCK] party-ba — Guard B's only field-level check cannot fail at ship time, and the proposal records the vacuous pass itself

**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

> - Real fixture data from a live AU organisation — blocked on Open Decision 1

> Recommend fail-closed with an explicit checked-in waiver list, so an unfixtured tool is a visible
>   decision rather than a silent gap. This is the single most consequential design question in the
>   change — a Guard B that silently skips unfixtured tools would have passed on every tool in the
>   repo on day one.

**Problem:** The value assertion is the only part of Guard B that looks at actual TFN/BSB/account-number values, and its input — real fixture data — is explicitly out of scope for this change. Scanning zero fixtures, or synthetic fixtures authored by the same person writing the guard, yields no match by construction: no observation available at ship time can make this criterion fail. The proposal identifies this exact defect in Open Question 2, then proposes a remedy that reproduces it: if unfixtured tools are fail-closed with a checked-in waiver list, and no tool has a real fixture on day one, then every tool goes on the waiver list and the guard passes vacuously with a list attached. Renaming a silent gap as a visible one does not make the assertion falsifiable. Four seats reached the day-one-empty-set conclusion independently (party-po: "scans nothing"; party-architect: the waiver covers every retained tool and the NZ/UK reads can never come off it; party-visionary: "executes over an empty set while CI reports green"; party-security: "a surface that is 30 waivers and 5 fixtures is indistinguishable in CI output from one that is fully covered"). Party-architect's separate finding that "recorded fixture" has two incompatible readings makes this worse, not better: the criterion cannot fail *and* nobody can say what object it would fail on. The change can therefore be "considered done" with rule 2 — the hardest of the four hard rules — verified by nothing.

**Fix:** State a ship-time criterion for Guard B that can fail without a live org: the guard must fail against a planted fixture containing a synthetic TFN/BSB/account number in each of a raw-object tool and a hand-mapped tool, and the waiver list must be empty for every tool the change ships. If neither is achievable without Open Decision 1, say so and mark rule 2 as unverified rather than guarded.

**Status:** upheld

### [WARN] party-ba — Guard A's allowlist assumes a contributor behaviour the proposal never establishes, and repeats the failure mode it quotes against

**Quotes:**
> Detection is by explicit
> allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately.

> inherited surface means every later tool is born under them, and a contributor adding a convenient
> write tool is stopped by CI rather than by review.

> `CLAUDE.md` states both as hard rules and requires both guards to run **over the entire registered
> surface, not per tool**, because "a guard you have to remember to apply is not a guard."

**Problem:** The party who suffers is the consumer of a mutating tool; the party whose behaviour the guard depends on is the contributor. An allowlist keyed on tool *name* records only that someone typed a string; it verifies no property of the tool. The contributor the proposal describes — one adding "a convenient write tool" — meets a red CI run whose stated remedy is to add the name to a list, and greening the build by appending one line is indistinguishable, to the guard, from deliberate approval. The word "approved" in "a checked-in list of approved read-only tools" is load-bearing and unearned: nothing in the described guard makes the list's entries approved. So the claim that the contributor "is stopped by CI rather than by review" is not established — CI raises a prompt that is resolved by review, or by reflex. That is the same shape as "a guard you have to remember to apply", which the proposal quotes as the thing to avoid. My arrow here is the behavioural assumption, not the mechanism layer: party-architect, party-security and party-visionary each show that a name is the wrong *key*; this finding is that the proposal's benefit sentence asserts a contributor *response* it never evidences, and party-visionary's "after the fifth such change, add your tool's name to allowlist.ts is muscle memory" is direct corroboration of the behaviour I say is assumed rather than shown.

**Fix:** Either evidence why appending to the allowlist will be treated as a review gate (e.g. the list requires a second signature, or an entry must cite the HTTP method the tool issues), or restate Guard A's claim honestly: it detects *unregistered-by-decision* tools and routes them to human review, and does not itself decide whether a tool can mutate.

**Status:** upheld

### [WARN] party-ba — The sequencing evidence rests on an unsourced tool count and a claim the proposal's own Open Question 1 contradicts

**Quotes:**
> There is also a sequencing argument. Doing the removal after adding 35 tools means auditing 85 tools
> instead of 50, with the new ones indistinguishable from the inherited ones in the diff.

> - **Files affected:** ~60 (estimated) — the fork's tool tree is ~50 tools; deletions dominate, plus

> the surface before and after, and record both counts in the change log so the removal is auditable.

> 1. **Fork mechanics:** squash the fork's history into one commit, or preserve it? Preserving history
>    keeps `git merge upstream` clean, which `CLAUDE.md` explicitly wants. Recommend preserving, with
>    `upstream` configured.

**Problem:** Two defects in the same sentence. First, the 50 and therefore the 85 are asserted with no source; the proposal's own Impact line marks the inherited surface as "~50 tools" estimated, and step 2 lists "record both counts" as work still to be done — so the quantity used to justify the ordering is one the proposal concedes it does not yet know. party-po's Impact finding and party-security's observation that the before/after counts land in "the change log, prose no test reads" both bear on the same unsourced figure from other arrows. Second, "indistinguishable from the inherited ones in the diff" is contradicted by Open Question 1's own recommendation: with the fork's history preserved and `upstream` configured, every inherited file is attributable by blame and the whole added surface is exactly `git diff upstream/main`. party-architect's BLOCK on the merge mechanic does not rescue the clause — it shows the history-preservation premise is itself undecided, so the proposal is simultaneously recommending the mechanic that refutes its own "indistinguishable" claim and leaving that mechanic unspecified. Either way the second half of the sequencing argument is unsupported.

**Fix:** Either cite the actual registered-tool count from the fork (it is a public repo — count it before proposing), or drop the numeric form of the argument; and drop or re-evidence the "indistinguishable in the diff" clause, which the recommended history-preserving fork refutes.

**Status:** upheld

### [WARN] party-ba — "Urgent rather than routine" is contradicted by the proposal's own risk statement

**Quotes:**
> Two facts make that foundation urgent rather than routine:

> - **Risk:** low for the repo, high in what it prevents. Nothing here touches a live Xero org — there
>   is no org yet.

**Problem:** The problem section escalates from routine to urgent on the strength of two hazards — a mutating payroll tool and a PII disclosure into an LLM context. Both hazards require a live Xero organisation and a consumer to be reachable, and the Impact section states plainly that neither exists. As written, the premise the proposal asks a reviewer to accept ("urgent") is denied by a later sentence of the same proposal. party-po reaches the same place pricing do-nothing: "nothing gets worse today, because there is no fixture to scan, no org, no payroll tool, and no release". I note explicitly that party-security and party-visionary supply a *different* urgency argument the proposal does not make — that the fixture-capture design is the one commitment here that later changes cannot undo, so it is cheapest to settle now ("this is the last moment it is free"). That argument is about the cost of deciding late, not about present exposure, and it is precisely the reframing my Fix asks for. It therefore refines this finding rather than refuting it: the stated premise remains contradicted by the artifact's own text, and a reviewer approving on "urgent" is approving on the withdrawn premise, not on the sound one.

**Fix:** Restate the premise as what the evidence supports — these two facts make the foundation load-bearing, and the surface cheapest to guard while it is small and unexposed — and delete the urgency claim, or evidence a currently reachable exposure path.

**Status:** upheld

### [WARN] party-ba — "The entire registered surface" carries two readings that produce two different guards

**Quotes:**
> **3. Guard A — read-only, over the whole registered surface.** A test that boots the server's tool
> registry, enumerates every registered tool, and asserts none can mutate.

> - Guard B: no-PII assertion over the entire surface — raw-response-object shape check plus

**Problem:** "Registered surface" is the term both guards' completeness claims rest on, and the proposal never defines it. Reading one: the set of tools present in the source tree. Reading two: the set of tools the registry actually contains when booted under the test process's configuration. These diverge whenever registration is conditional — on env vars, on auth mode (`CLAUDE.md` describes two, bearer and Custom Connections), on region, or on granted scopes. Under reading two, a tool that registers only in a configuration the test harness does not boot is invisible to both guards while remaining shippable, and the surface-wide claim — the thing `CLAUDE.md` rule 3 requires — is false for that tool. The two readings produce materially different builds: a static enumeration over source plus a registration-conditionality check, versus a single runtime registry walk. The proposal specifies the runtime walk while claiming the coverage of the static one. Strengthened from two directions: party-security shows the runtime reading fails open on an empty or partly-booted registry and passes "loudly green", and party-architect shows the boot has no named credential-free seam, so the configuration under which the registry is enumerated in CI is exactly the undefined thing this ambiguity turns on.

**Fix:** Define "registered surface" explicitly, and state whether conditional registration exists in the fork. If it does, require the guards to enumerate every configuration under which a tool can register, or require that registration be unconditional so the runtime walk is provably total. The same ambiguity applies to "a raw Xero SDK response object" — object identity, or any shape structurally carrying the SDK's fields (`return {...response}` passes the first, fails the intent).

**Status:** upheld

### [NOTE] party-ba — Rule 4 gets a goal but no criterion that could fail

**Quotes:**
> **6. Logging discipline.** Assert the server logs tool names, tenant identifiers and durations, and
> never response bodies (`CLAUDE.md` rule 4). Where the fork logs payloads, remove it.

> - Remove any payload logging inherited from the fork

**Problem:** Two of `CLAUDE.md`'s four hard rules get named guards with surface-wide coverage and a planted-violation demonstration; rule 4 gets "assert" with no stated observation, and a one-time removal pass. As written the criterion is satisfied by a server that logs tool names, tenants and durations *and also* bodies, since the affirmative half is checkable and the negative half names no observation. There is also no answer to what makes the negative half fail — no test input, no log capture, no scan target — so nothing at ship time distinguishes "payload logging removed" from "payload logging not looked for". Two other seats found the same line load-bearing from their own arrows: party-security names a concrete recurring vector (an upstream merge re-adding `logger.debug(response)` into an inherited file, with no mechanism to catch it), and party-po argues the affirmative half is scope beyond the prohibition the rule states. Their agreement means the unfalsifiability here is not incidental — it is the reason the gap persists past this change — so this NOTE should be read at the top of its band, though I do not restate it at a higher severity in round 2.

**Fix:** Give rule 4 a falsifiable criterion in the same grammar as the other two: invoke each registered tool against a fixture containing a marker value, capture emitted log output, and fail if the marker appears. If that is out of scope for this change, say so and record rule 4 as unguarded rather than asserted.

**Status:** upheld

### [WARN] party-ba — Rebuttal of party-po's slice line: it prices the shape assertion at the proposal's own unsupported valuation, so slice 1 would ship rule 2 guarded by nothing that covers the harm

**Quotes:**
> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.

> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

**Problem:** party-po's slice line — Guard A plus the shape assertion plus CI now, value scan and fixture harness later — is argued to "capture the whole stated mechanism value". That valuation is the proposal's own sentence taken at its word: "This is the mechanism; it is what makes leakage structurally impossible." My round-1 BLOCK, and party-security's and party-architect's findings, establish that the sentence is false as a matter of premise: the shape assertion tests the provenance of the returned object, not the absence of the three forbidden fields, and party-architect adds that no discriminator is named by which it could be tested at all. So the quantity party-po is deferring is not the low-value half — on the evidence in the artifact, the value assertion is the only described check that addresses the stated harm, and the retained half is the one whose claim does not survive scrutiny. Cutting on that line would ship a change whose Guard B covers rule 2 in name only, while the vacuity my second finding flags becomes permanent rather than temporary. This is a rebuttal of the premise reading, not of party-po's cut-line instinct: if the surface is to be sliced, the field-level check my first Fix asks for is the part that must stay in slice 1, because it is falsifiable today without a live org and without a fixture.

**Fix:** If a slice line is drawn, define slice 1's Guard B as a field-level assertion over each tool's declared return shape (a closed, checked-in field set with TFN/BSB/account-number field names denied), which needs no fixture and no org, and defer only the fixture-based value scan. Do not let the "structurally impossible" claim justify retaining the raw-object check as the whole of slice 1's PII coverage.

**Status:** upheld

### [BLOCK] party-po — Guard B's value scan, fixture harness and waiver list are built now to scan an empty set, and the cheaper cut line is never considered

**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.
> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that
> - Real fixture data from a live AU organisation — blocked on Open Decision 1
> Recommend fail-closed with an explicit checked-in waiver list, so an unfixtured tool is a visible
>   decision rather than a silent gap. This is the single most consequential design question in the
>   change — a Guard B that silently skips unfixtured tools would have passed on every tool in the
>   repo on day one.

**Problem:** By the proposal's own accounting, on the day this ships there are zero fixtures — real fixture data is out of scope and blocked on Open Decision 1. The value assertion therefore scans nothing, and the recommended fail-closed posture means the deliverable is a waiver list with one entry for every tool on the surface (~50 by the Impact estimate). That is three artifacts built and paid for — scanner, harness, waiver list — returning zero detections until an org exists at an unknown date. Priced against do-nothing: if the value scan ships in no form at all, nothing gets worse today, because there is no fixture to scan, no org (*"there is no org yet"*), no payroll tool, and no release (*"Publishing or packaging the server"* is out of scope). The cheaper variant — fork, strip, Guard A, CI now; value scan and fixture harness in the same change that records the first real fixture — is never considered, and no cut line is named: all six items sit behind one gate, *"both guards must be demonstrated failing against a deliberately planted violation before this change is considered done"*.

Round 2 adjudication. Three seats independently confirm the deferred half detects nothing at merge: party-ba ("no observation available at ship time can make this criterion fail"), party-architect ("at merge *every* retained tool is unfixtured, so every retained tool lands on the waiver list"), party-visionary ("the waiver file grows monotonically, nobody is assigned the change that removes an entry"). party-security raises the *price* of slice 2 further — a harness that redacts at capture, plus a pre-commit hook, plus waiver entries carrying expiry dates, named owners and a failing cap — all of which is cost incurred now against zero fixtures, and all of which is cheapest to design at the moment a real payload first exists. That strengthens the cut, it does not weaken it.

One adjustment I owe the panel: my slice 1 originally kept Guard B's shape assertion as "the whole stated mechanism value". party-ba and party-architect show that assertion is not a mechanism as written (no discriminator; a hand-mapped `taxFileNumber` field passes it). So slice 1's content changes — it carries Guard A at the capability layer, not the shape assertion as prose — but the cut line itself is unchanged: nothing that requires a fixture to detect anything should ship in a change that ships no fixtures.

Against this, party-visionary argues the fixture-storage decision must be taken now because preserved history forecloses remediation. I accept that and it does not conflict: the *decision* (fixtures git-ignored, or redacted at capture) is a policy line and a `.gitignore` entry, and belongs in slice 1 at near-zero cost. Building the harness, the scanner and the waiver list is the part that buys nothing until the org exists.

**Fix:** Split into two shippable slices and state the line. Slice 1: fork, strip writes, Guard A, CI workflow, plus the one-line fixture-storage policy party-visionary asks for. Slice 2: fixture harness (with capture-time redaction), value scanner, and the fail-closed/waiver decision, sequenced with the change that captures the first real AU fixture, where the waiver list is short enough to be meaningful. If slice 2 must stay in this change, state what it detects on day one and why that is worth the waiver list.

**Status:** upheld

### [WARN] party-po — Keeping the NZ/UK read tools imports dead surface into both guards' per-tool cost base for zero stated AU value

**Quotes:**
> 4. **Are the fork's inherited payroll read tools (NZ/UK employees, leave, timesheets) kept or
>    removed?** They are read-only and so pass Guard A, but they are region-restricted and answer
>    nothing an AU consumer asks. Keeping them means dead surface that still consumes a consumer's
>    tool budget and rate limit; removing them widens divergence from upstream. Recommend keeping the
>    reads for now — the brief says "keep the reads, strip the writes" — and revisiting when the tool
>    count is known.

**Problem:** The proposal states the cost of keeping them ("dead surface", consumer tool budget, rate limit) and states the value as nil ("answer nothing an AU consumer asks"), then recommends keeping them on the strength of a quoted slogan rather than a value argument. The cost compounds with the guards being built in the same change: every kept tool needs an allowlist entry, must satisfy the hand-defined-shape assertion, and under the recommended fail-closed Guard B needs either a recorded fixture or a waiver entry — per-tool work, paid now and maintained forever, on tools the proposal says nobody will call.

Round 2 adjudication. party-architect sharpens the cost past what I wrote: the NZ/UK reads "can never come off it, because an AU organisation cannot produce a fixture for them" — so keeping them does not just add waiver entries, it adds *permanent* waiver entries, and forces the waiver list to carry two meanings with different lifetimes. That is a cost with no expiry attached to tools with no value attached.

Adjustment I owe the panel: I called the counter-cost ("removing them widens divergence from upstream") unpriced. party-visionary prices it — deletion of inherited paths yields delete/modify conflicts on every future `git merge upstream`, "a recurring tax levied on every future upstream sync for the life of the fork". I accept that pricing, and it does not resolve the question, it completes it: both sides now have a number-shaped cost and the artifact still names neither. The finding stands as a demand for the decision, not as a demand for deletion.

**Fix:** Decide this before planning, not after ("revisiting when the tool count is known" defers it past the point where the guard cost is already sunk). If they are kept, state the value that justifies their allowlist, shape-check and permanent-waiver cost. If the value is nil, delete them while deletions are already the dominant diff, and state the upstream-merge tax you are accepting — the same tax party-visionary prices for the write-tool deletion.

**Status:** upheld

### [WARN] party-po — The per-tool friction tax the fail-closed allowlist imposes on ~35 later tools is never numbered

**Quotes:**
> Detection is by explicit allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately.
> Recommend fail-closed with an explicit checked-in waiver list, so an unfixtured tool is a visible
>   decision rather than a silent gap.

**Problem:** This change's real recurring cost is not CI minutes, it is the mandatory per-tool paperwork it installs for every one of the ~35 Payroll AU tools still to be written: an allowlist entry, a hand-defined shape, and a fixture or a waiver entry, each a checked-in file edit that must land in the same commit as the tool or the build is red. The proposal asserts the benefit of failing closed but never states the number — roughly three checked-in artifacts touched per tool, ~105 edits across the remaining build order — nor whether the allowlist and waiver list are two separate lists to keep in sync. Without that number the trade between "fails closed" and "fails annoying" cannot be judged, and the cost lands on later changes that will not get their own panel on this decision.

Round 2 adjudication. Every other seat's fix raises this number, which makes stating it more necessary, not less: party-security would add a handler content hash per allowlist entry plus an expiry date and named owner per waiver entry plus a per-tool closed field list; party-architect would add a declared output schema per tool; party-visionary would add a per-tool verified read-only claim; party-ba would add a per-entry citation of the HTTP method. Under the union of the panel's fixes a contributor adding one tool touches five or six checked-in artifacts, not three. party-visionary independently confirms the behavioural consequence — "after the fifth such change, 'add your tool's name to `allowlist.ts`' is muscle memory". I am not disputing that the stronger mechanisms are correct; I am recording that the panel is about to double an unnumbered recurring cost, and the artifact still owes the number.

**Fix:** State the per-new-tool cost explicitly — which files a contributor must touch and how many — and state whether the allowlist and the fixture waiver are one artifact or two. If the panel's stronger mechanisms are adopted, re-state the number under them, because that is the number every later change pays.

**Status:** upheld

### [WARN] party-po — The Impact estimate contradicts the proposal's own In Scope list

**Quotes:**
> - **Files affected:** ~60 (estimated) — the fork's tool tree is ~50 tools; deletions dominate, plus
>   ~4 added files (two guards, an allowlist, a CI workflow)
> 3. **Does the fork have any test infrastructure to build on,** or does a runner need standing up?
>    `build.test_command`, `lint_command` and `build_command` are all empty in `config.yaml` and need
>    filling as part of this change.
> - **Complexity:** medium — the removal is mechanical, but establishing a guard that fails *closed*

**Problem:** The stated cost is contradicted by the artifact's own scope. The "~4 added files" omits the fixture-capture scaffolding, the Guard B waiver list the proposal recommends, the test-runner and lint/build configuration that Open Question 3 concedes "need filling as part of this change", `HANDOFF.md`, and the before/after inventory record — all of which appear in In Scope. It also omits the work hidden in Impact/Risk: building a deliberately planted violation for each guard and demonstrating both fail. And Open Question 3 is open in both directions: if no runner exists, standing one up is unbounded work priced at "medium" alongside a mechanical deletion pass.

Round 2 adjudication. party-architect reaches the same undercount from the structure side — "The '~4 added files' count covers only the allowlist and omits the waiver list, the fixture-capture scaffolding..., the `config.yaml` command keys, `HANDOFF.md`, and whatever artefact carries the deliberately planted violation" — arriving independently at the same omissions, which is convergence rather than duplication: theirs is about the co-change set, mine is about whether the stated cost can support an approve-to-plan decision. party-security and party-visionary add a further item neither of us counted: the planted violations become *permanent* negative-control test artifacts run on every CI invocation, not a one-off demonstration, which is another checked-in fixture set.

**Fix:** Re-state Impact with a line per added artifact rather than an estimate, and split it on Open Question 3 into the two branches (runner exists / runner must be stood up) so the approver sees which cost they are approving.

**Status:** upheld

### [WARN] party-po — Rebuttal to party-security BLOCK 3: a runtime egress guard with metrics and operator alarms has no consumer in this change and its cut line is the first live-org change

**Quotes:**
> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.
> - **Risk:** low for the repo, high in what it prevents. Nothing here touches a live Xero org — there
>   is no org yet.

**Problem:** party-security is right that build-time-only controls leave the live path unwatched, and I am not disputing sufficiency — that is their arrow. I am pricing the fix and placing its cut line, which is mine. The proposed control is not one assertion: it is a runtime interception point in every tool's response path, a field deny-list, a value matcher shared with Guard B, a counted warning carrying tool name and field path, a metric an operator can alarm on, and a checked-in closed field list per tool across the ~50 inherited tools. Every one of those costs is paid in this change; not one of them returns value in this change, because by the artifact's own words there is no org, no payroll tool, no consumer and no deployment — "Publishing or packaging the server" is out of scope. A metric nobody scrapes and a counted warning no operator reads are the definition of a knob paid for forever and used never, and the field deny-list lands hardest on exactly the inherited tools my second finding says may not survive the change at all. Worse for sequencing: the matcher is specified to be shared between the runtime guard and Guard B's value scan, and my first finding shows the value scan cannot detect anything until a fixture exists — so building the shared matcher now fixes its design before either consumer exists to constrain it.

**Fix:** Name the cut line rather than folding the runtime control into this change. The egress guard's value begins at the first change that constructs a real Xero client against a real tenant — bearer-token auth (build order step 2) or the first payroll tool, whichever lands first — and that is the change that should carry it, with the shared matcher designed once against a real payload rather than twice against none. If it must land here, state what it observes on day one and what the metric is attached to.

**Status:** upheld

### [NOTE] party-po — Rebuttal to party-visionary NOTE: expanding the fixture format into a replay-and-assert contract adds cost now for value that only arrives with the first fixture, and the seam costs the same then

**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.
> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that

**Problem:** party-visionary's leverage argument is sound in the abstract — a fixture that holds both the raw response and the expected projection gives every later tool a regression test — but the sequencing claim attached to it is that "the step is small only while the harness is still being written", and the artifact's own scope contradicts the premise. The harness is being written against zero fixtures: real fixture data is out of scope, "blocked on Open Decision 1", and there are no tools in this change whose mapping could be replayed. A dual-format fixture spec plus a replay engine, authored with no real payload to shape it and no mapping to run through it, is a format designed from a guess — and the first real AU response is precisely the event that would have corrected the guess. party-architect's finding compounds this: "recorded fixture" is currently one word for two artefacts, so the format party-visionary wants to fix now is a contract the artifact has not yet defined the endpoints of. The step is not cheaper now than later; it is cheaper *later*, because later it is informed.

**Fix:** Keep the sequencing party-visionary's own BLOCK implies rather than the one their NOTE proposes: take the fixture *storage and redaction policy* decision in this change, where it is genuinely irreversible-if-deferred, and take the fixture *format* decision — raw side, projected side, replay assertion — in the change that captures the first real AU payload, where a real payload constrains it. State that cut line in the artifact so the leverage is scheduled rather than lost.

**Status:** upheld

### [BLOCK] party-security — Guard A binds "cannot mutate" to a tool's name, so an already-allowlisted tool can gain write behaviour with the guard still green
**Quotes:**
> **3. Guard A — read-only, over the whole registered surface.** A test that boots the server's tool
> registry, enumerates every registered tool, and asserts none can mutate. Detection is by explicit
> allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately. Name-pattern heuristics
> (`create-`, `update-`, `delete-`) are a secondary signal, not the mechanism — a write tool named
> `post-payrun` would pass a heuristic and must not pass the guard.

**Problem:** The allowlist closes the *new tool* hole and leaves the *changed tool* hole wide open. `asserts none can mutate` is delivered entirely by name-set membership, so once `list-payruns` is on the list, its handler can be edited to issue a `POST`, a `PUT`, or a Xero SDK write call and Guard A returns green forever — no new name appears, no registration changes, nothing to add to the list. That is the same defect the proposal correctly rejects in the heuristic (`a write tool named post-payrun would pass`), reproduced one level up: the string is checked, the capability is not. And the input the guard checks is a string wholly controlled by the contributor the guard exists to stop, so the reviewed party controls the verdict. Round 2 adjudication: independently reached by four seats — party-architect ("the name is not evidence of what the tool does"), party-ba ("greening the build by appending one line is indistinguishable, to the guard, from deliberate approval"), party-visionary ("appending to it is the same keystroke as passing the guard"), and party-po's friction-tax finding, which supplies the mechanism by which the append becomes reflex ("roughly 105 edits across the remaining build order"). No seat contests the reading. My seat's specific claim — that this makes the reviewed party the author of the verdict — is unrebutted and the corroboration converges on the same fix layer (a capability check, not a name check).

**Fix:** Make the allowlist bind name to *capability evidence*, not name alone: pin each allowlisted tool to its handler's HTTP verb surface (assert every outbound call the handler can reach is `GET`/`HEAD`, via a wrapped or fake Xero client that throws on any other verb during a per-tool invocation test), and store a content hash of each handler file in the allowlist entry so an edit to an approved tool forces a deliberate allowlist update. A name-only entry should not be sufficient to certify a tool read-only.

**Status:** upheld

### [BLOCK] party-security — An empty or partly-booted tool registry satisfies both guards vacuously; nothing anchors the expected tool count to the assertion
**Quotes:**
> A test that boots the server's tool
> registry, enumerates every registered tool, and asserts none can mutate.
> Inventory
> the surface before and after, and record both counts in the change log so the removal is auditable.

**Problem:** Every assertion in both guards is universally quantified over the enumerated set — `none can mutate`, `every registered tool name must appear`, `scan every tool's recorded fixture`. All three are trivially true of the empty set. If the registry boot throws, or partially fails, or returns zero tools because an env var is missing in CI, or a registration module silently no-ops, the guards pass and pass *loudly green* — indistinguishable from a healthy full-surface run. The proposal has the counter-evidence in hand and puts it in the wrong place: the before/after counts go into `the change log`, prose no test reads, rather than into the guard as a floor. This is the fail-open case that looks exactly like success. Round 2 adjudication: strengthened from two directions. party-architect's stub-seam WARN supplies the concrete mechanism by which the enumeration comes back empty or the test comes back skipped ("whether these tests can run at all in CI is left entirely to the implementer... quietly marked skipped — which is indistinguishable in a green build from a guard that passed"), and party-ba's WARN on `the entire registered surface` shows the enumeration can be *silently partial* rather than empty, because conditional registration would hide tools from a runtime walk in exactly the configuration the harness does not boot. Both make the count floor more necessary, not less. party-architect's NOTE adds the reverse-direction gap I did not name — a stale allowlist entry whose tool no longer exists — which my exact-equality fix already closes.

**Fix:** Assert a positive lower bound inside both guards — enumerated count must equal the checked-in allowlist length exactly (not "is a subset of"), and that length is asserted non-zero. Fail the guard on any registry-boot exception rather than letting an empty enumeration stand in for a clean one, and assert the boot needed no credentials so a missing secret cannot shrink the surface.

**Status:** upheld

### [BLOCK] party-security — Both PII guards run at build time over fixtures only; at run time against a live org nothing checks the response, and the disclosure the proposal calls unrecoverable leaves no trace
**Quotes:**
> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.
> to the caller leaks PII into an LLM context window, which is an unrecoverable disclosure.

**Problem:** `structurally impossible` overstates what the shape assertion buys. It proves the return value is not a raw SDK object; it does not prove the hand-defined shape excludes a TFN. A hand-written mapper with `taxFileNumber: emp.TaxFileNumber` — or a `notes`, `description`, or free-text passthrough field carrying one — satisfies the shape assertion completely. The value assertion is then the only real check, and it looks exclusively at `recorded fixture` data: it can only ever catch a TFN that someone already captured into a committed file. Every path where a live payload differs from the fixture — a field populated for one employee and null in the sample, a nested object the fixture never exercised, an upstream Xero schema addition — is unguarded, and there is no runtime redaction, no response-egress filter, and no assertion at all on the live path. So the proposal's own worst outcome, an `unrecoverable disclosure`, has CI green as its only control and produces no warning, no recorded state, and no artifact distinguishing a leaking response from a clean one. It cannot even be diagnosed after the fact, because rule 4 forbids logging the body that would prove it. Round 2 adjudication: party-ba's lead BLOCK reaches the same hand-mapped-TFN case from the premise side ("hand-defining a shape establishes provenance of the object, not absence of the fields"), and party-architect's BLOCK 2 shows the shape assertion has no interrogable discriminator at all at the layer it is placed — so the provenance check may not even deliver provenance. The one argument against me is party-po's, and on inspection it strengthens this finding rather than weakening it: party-po's slice 1 would ship Guard A plus the shape assertion alone and calls that "the whole stated mechanism value." Under that cut, the provenance-only check becomes the *sole* control for rule 2, which is strictly worse. I accept party-po's narrower point that a runtime egress filter has nothing to filter in a change with no org and no payroll tools, and I narrow the fix accordingly rather than withdrawing: the defect is that the artifact declares a fail-open control to be the mechanism, and that declaration is made in this change and inherited by every later tool.

**Fix:** Either add the runtime egress guard now, or state explicitly in this change that rule 2 is unguarded against hand-mapped fields and bind the egress guard to the change that adds the first payroll tool. The egress guard is a deny-list on field names (`TaxFileNumber`, `BSB`, `AccountNumber`, `BankAccount*`) plus a TFN/BSB value matcher in the single response path every tool returns through, which drops the value, emits a counted warning with the tool name and field path (never the value), and increments a metric an operator can alarm on. Either way, in *this* change: delete the `structurally impossible` claim, make the shape assertion a secondary signal, and assert per tool that the hand-defined shape's field set is a checked-in closed list so a new field cannot appear in a response without an allowlist edit. Make the value matcher a shared implementation so build-time and any later run-time check cannot drift.

**Status:** upheld

### [BLOCK] party-security — Capturing real AU fixtures writes TFNs, BSBs and bank account numbers into git history, and the only scan for them runs in CI after the push
**Quotes:**
> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that
> **Risk:** low for the repo, high in what it prevents. Nothing here touches a live Xero org — there
> is no org yet.

**Problem:** `Nothing here touches a live Xero org` is true of this change and false of the mechanism this change builds. The harness's entire purpose is to write raw `GET /Employees/{id}` responses to disk, and the proposal states two sections earlier that those responses carry TFNs, BSBs and bank account numbers. Committed fixtures land in a git history the design deliberately keeps entangled with a public upstream (`upstream` configured as a remote), and the only detector — Guard B's value assertion — is `in CI`, i.e. it fires after the object already exists in a pushed history. Removing it then requires a history rewrite coordinated across every clone and fork, which is the least reversible recovery path available and is nowhere stated. The check is downstream of the irreversible effect it is supposed to prevent. Round 2 adjudication: party-visionary reached the identical conclusion from the design-commitment side and named the collision I did not — the remedy (history rewrite) destroys the merge lineage the fork strategy exists to buy, so the two decisions "cannot both survive." Their fix and mine converge on redact-at-capture plus a pre-commit hook. party-architect's BLOCK 3 supplies the missing corroboration that this is unavoidable under the raw-response reading: "a correctly captured AU employee fixture *contains* a TFN and a bank account by construction." That removes any reading in which the harness might happen not to write PII. party-po's slice-1 cut would defer the harness out of this change, which would resolve this finding by amendment — but as the artifact is written the harness is In Scope with no redaction-at-capture rule and no stated recovery path, so it stands.

**Fix:** Redact at capture, not at review: the harness must run the TFN/BSB/account matcher and a field deny-list on the response *before* it writes the file, replacing matched values with stable synthetic placeholders, so a raw payload is never persisted at all. Back that with a pre-commit hook running the same matcher on staged fixture files (local, before the object is shareable) and keep the CI run as the backstop rather than the primary control. State the recovery path explicitly: if a real TFN reaches a pushed fixture, the response is credential-and-history remediation, and name who executes it.

**Status:** upheld

### [BLOCK] party-security — Guard B's default when a tool has no fixture is left undecided, and the recommended resolution is a waiver list the tool's own author can edit
**Quotes:**
> 2. **How does Guard B get a fixture for a tool that has none yet?** Options: fail the guard on a
>    tool with no recorded fixture (strictest, and forces fixture discipline), or skip and warn.
>    Recommend fail-closed with an explicit checked-in waiver list, so an unfixtured tool is a visible
>    decision rather than a silent gap. This is the single most consequential design question in the
>    change — a Guard B that silently skips unfixtured tools would have passed on every tool in the
>    repo on day one.

**Problem:** The proposal diagnoses the fail-open path precisely and then leaves it on the table as a live option, while §4 already presents Guard B as a decided mechanism. `skip and warn` is the permissive default and, as the proposal itself says, would have passed the entire surface on day one — an artifact must not ship with that as an unresolved coin flip. The recommended alternative is only half a fix: a `checked-in waiver list` is an escape hatch reachable by exactly the party the guard judges. The contributor adding a tool with no fixture adds one line to the waiver in the same PR and CI goes green; the waiver has no expiry, no cap, no separate approver, and — critically — a waived tool is reported as a *pass*, so a surface that is 30 waivers and 5 fixtures is indistinguishable in CI output from one that is fully covered. Round 2 adjudication: this is the panel's most-corroborated finding. party-ba ("Renaming a silent gap as a visible one does not make the assertion falsifiable"), party-visionary ("chooses an option that reproduces it with paperwork"), party-po ("the waiver list starts at 100% waived, which is the same coverage as not having the scanner"), and party-architect all land on it. party-architect adds the case I missed and which makes the expiry half of my fix insufficient on its own: the region-restricted NZ/UK reads "can never come off it, because an AU organisation cannot produce a fixture for them," so the waiver acquires a permanent class indistinguishable from the temporary one. I adopt that into the fix.

**Fix:** Resolve to fail-closed in this change, not as a recommendation. Make each waiver entry carry an expiry date, a named owner, and a reason code distinguishing "fixture not yet captured" (expires) from "structurally unfixturable" (does not, and must instead be justified against deletion of the tool). Fail the guard when a dated entry is past expiry, cap the total waiver count and fail when it grows, and have the guard print the waived-tool count and names on every run so partial coverage is visible in the log of a passing build rather than only in a diff nobody re-reads.

**Status:** upheld

### [WARN] party-security — Rule 4 gets a one-time sweep while rules 1 and 2 get surface-wide CI guards, and the design deliberately keeps pulling from upstream through that gap
**Quotes:**
> **6. Logging discipline.** Assert the server logs tool names, tenant identifiers and durations, and
> never response bodies (`CLAUDE.md` rule 4). Where the fork logs payloads, remove it.
> with
> `upstream` configured as a remote so later fixes stay mergeable. Per `CLAUDE.md` conventions, keep
> divergence in added files rather than edits to inherited ones wherever possible.

**Problem:** `Where the fork logs payloads, remove it` is a manual sweep of a codebase this change is seeing for the first time, and the proposal's own argument for surface-wide guards — a guard you have to remember to apply is not a guard — applies to it verbatim. The asymmetry has a concrete vector: the design commits to ongoing `git merge upstream`, so an upstream commit that adds a `logger.debug(response)` to an inherited file re-introduces payload logging with no mechanism to catch it. Guard A does cover the parallel case of a re-added write tool (its allowlist fails closed on the new registration), which is exactly why the uncovered case stands out. A payload in a log is silent, persistent, and outside the process boundary the operator can clean. Round 2 adjudication: party-ba's NOTE independently establishes the criterion half ("nothing at ship time distinguishes 'payload logging removed' from 'payload logging not looked for'"), and party-visionary's WARN 4 independently establishes the merge-vector half, showing the recurring upstream sync is a real and repeated event rather than a hypothetical one. party-po's NOTE argues the *positive* half of item 6 is scope beyond the rule and should be cut while keeping the negative assertion and the removal — that is compatible with this finding, which is entirely about giving the negative half a mechanism. Note that if party-po's cut is taken, my fix's log-capture test must still be kept, because it is the only stated observation that can fail.

**Fix:** Give rule 4 a surface-wide mechanism like the other two: a lint rule or AST check that fails the build if any argument to a log call is a response object or a variable reachable from the HTTP client, plus a test that drives every registered tool against a fixture with a marker value and a captured logger and asserts the emitted lines contain only tool name, tenant id and duration. Run it on the merge commit so an upstream merge cannot land green.

**Status:** upheld

### [WARN] party-security — The negative control is a one-off demonstration at merge time, so a guard that later stops catching does so silently
**Quotes:**
> **Risk:** low for the repo, high in what it prevents. Nothing here touches a live Xero org — there
> is no org yet. The real risk is a guard written to pass rather than to catch, which is why both
> guards must be demonstrated failing against a deliberately planted violation before this change is
> considered done

**Problem:** The instinct is right and the placement is wrong. `demonstrated failing ... before this change is considered done` is a human ritual performed once, by the same author who wrote the guard, with no artifact that survives. Nothing re-verifies catch-power afterwards: a refactor that makes the enumeration return the wrong collection, a matcher regex someone loosens to quiet a false positive, or an allowlist comparison silently inverted all leave the guard passing, and a guard that passes because it can no longer see anything is identical in CI output to a guard that passes because the surface is clean. Self-graded once, then trusted forever. Round 2 adjudication: party-ba's BLOCK 2 arrives at the same artifact from the falsifiability side and asks for exactly this ("the guard must fail against a planted fixture containing a synthetic TFN/BSB/account number in each of a raw-object tool and a hand-mapped tool"), which makes the planted violation a permanent asset rather than a ceremony. party-po's WARN on the Impact estimate confirms it is unpriced work currently hidden in the Risk paragraph ("a fixture-and-revert exercise, not a line of test code"), and party-architect's stub-seam WARN adds the requirement that the demonstration run headless in the same configuration as CI, which I adopt.

**Fix:** Persist the planted violations as permanent negative-control test cases: a fixture directory containing a synthetic write tool and a synthetic TFN-bearing response, asserted to make each guard fail, plus a hand-mapped-TFN case per party-ba. Run them on every CI invocation in the same headless, credential-free configuration as the guards themselves, so "the guard still catches" is re-proven at the same cadence as "the surface is still clean."

**Status:** upheld

### [NOTE] party-security — A shape-based TFN/BSB matcher over payroll data will be tuned toward false negatives, and the artifact names no anchor against that
**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

**Problem:** A TFN is nine digits, a BSB six, an account number six to ten. In a payroll fixture those shapes collide with amounts in cents, employee ids, dates, ABNs and USIs, so the first version of this matcher will be noisy and the pressure will be to narrow it until it is quiet — which is a fail-open drift in the one check the proposal calls the honesty check. It also misses the formats real payloads actually carry: `123 456 782`, `123-456`, or a TFN pasted into a free-text note field. Round 2 adjudication: party-architect's WARN on the same line establishes the collision set with domain specificity I only gestured at — ABNs and USIs on `/Superfunds`, `SuperMembershipID`s, employee numbers — and names the drift endpoint precisely: "another ships a mod-11-validated matcher that fires on almost nothing. Both satisfy the sentence as written." That is my fail-open direction stated as a contract defect, and it raises my confidence in this finding without changing its severity: there is no exposure in the design as written, because the matcher does not exist yet. It becomes exposure the moment it is written to quiet a false positive. Their finding owns defining the contract; this one owns the direction the contract must not be allowed to drift.

**Fix:** Anchor the matcher on structure rather than digit count: validate the ATO TFN weighted checksum so a nine-digit amount is not a hit and a real TFN is, normalise separators before matching, match BSBs against the `NNN-NNN` bank-state-branch prefix set, and scan string values recursively including free-text fields. Pair it with the field-name deny-list so detection does not rest on the value pattern alone, and record every narrowing of the pattern as a deliberate, reviewed change requiring a negative-control test, rather than a test fix.

**Status:** upheld

### [WARN] party-security — Rebuttal of party-po's slice line: cutting the value scan leaves a provenance-only check as the sole control on the hardest hard rule
**Quotes:**
> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.

**Problem:** party-po's cut line — "Guard A + Guard B shape assertion + CI now, value scan and fixture harness in the same change that records the first real fixture" — is defensible on sequencing, and I agree the value scan detects nothing on day one. What I contest is the justification attached to it: that this variant "captures the whole stated mechanism value." It captures the whole *claimed* mechanism value, which is the thing three seats have now shown to be false. The shape assertion establishes provenance, not content (party-ba), and has no named discriminator to establish even that (party-architect). If slice 1 ships with the shape assertion as the only PII control and the panel has endorsed that as complete coverage, rule 2 — the rule the proposal itself calls hardest — ships guarded by a check that cannot fail against a hand-mapped `taxFileNumber` field, and the artifact's own `structurally impossible` sentence remains in the record as the warrant for it. The failure-mode reading party-po's fix rests on takes the proposal's self-assessment of the shape assertion at face value; that self-assessment is the thing under review. This does not withdraw party-po's finding, which only party-po can do, and does not contest the deferral.

**Fix:** If the slice is taken, condition it: slice 1 must delete the `structurally impossible` claim, add the closed-field-list assertion per tool (which needs no fixture and no org, and is the check that actually excludes a TFN), and record rule 2 as guarded only against raw passthrough until slice 2 lands. A cut that defers a check is fine; a cut that inherits an overstated coverage claim is not.

**Status:** upheld

### [NOTE] party-security — Rebuttal of the "no present exposure" reading party-ba's urgency finding rests on: it is true of the change and false of the harness the change builds
**Quotes:**
> - **Risk:** low for the repo, high in what it prevents. Nothing here touches a live Xero org — there
>   is no org yet.

**Problem:** party-ba's premise finding is theirs and I do not contest it on its own terms — the artifact does say "urgent" and then say "low risk," and that is an inconsistency for that seat to file. What I contest is the direction the panel may carry the resolution. party-ba concludes these are "facts about *foundation quality*, not about present exposure," treating the quoted Risk line as the accurate half of the contradiction. That line is accurate about this change's *effects* and inaccurate about this change's *deliverables*: the In Scope list includes a harness whose purpose is to write raw `GET /Employees/{id}` responses — carrying, per the same proposal, TFNs, BSBs and bank account numbers — into a versioned tree, and the design of that harness is fixed by this change and is where the irreversible effect originates (my finding 4, party-visionary's BLOCK). If "no present exposure" is accepted as the resolution, the harness's write-path defaults are the thing that gets waved through on the strength of it. The safe resolution is party-ba's own alternative wording — the surface is cheapest to guard while small and unexposed — with the harness explicitly excluded from the "unexposed" claim.

**Fix:** If the urgency claim is restated per party-ba, restate the Risk line too rather than leaving it as written: name the fixture harness as the one in-scope item that does create exposure once Open Decision 1 resolves, and carry its redaction-at-capture and pre-commit defaults as decided in this change rather than deferred.

**Status:** upheld

### [BLOCK] party-visionary — Real payroll fixtures in preserved git history is the one commitment here that no later change can undo, and it collides with the mergeability this same change buys

**Quotes:**
> **1. Pull the fork.** Clone `XeroAPI/xero-mcp-server` into this repo, preserving its history, with
> `upstream` configured as a remote so later fixes stay mergeable.

> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that

> leaks PII into an LLM context window, which is an unrecoverable disclosure.

**Problem:** Upheld, and strengthened by independent convergence: `party-security`'s fourth BLOCK reaches the same hazard from the runtime side — the harness writes raw `GET /Employees/{id}` responses to disk and Guard B fires only in CI, after the object exists in a pushed history. Two seats arriving at the same conclusion from opposite ends of the pipeline is the strongest signal this panel produced.

I cede the mechanism half to that seat — redact-at-capture, pre-commit matcher, CI as backstop is their remedy and it is better specified than mine. What remains uniquely in my lens is the door: the only remediation for PII already in history is a rewrite, and this change's fork strategy spends its entire structure on preserved lineage and a live `upstream` remote precisely so that rewrite is never available. `party-security` names history rewrite as the "least reversible recovery path"; my claim is stronger and different — this change has *already foreclosed* it, in the same section that creates the mechanism that will need it. Every other commitment in the proposal is revisable by a later change: the allowlist can be replaced, guards tightened, deleted files restored from history. This one is not, and the artifact classifies fixture capture as scaffolding whose only open question is timing.

`party-architect`'s BLOCK on "recorded fixture" being an undefined contract makes this worse, not better: the side of the tool boundary a fixture records is exactly what decides whether the committed file carries a TFN, and that decision is currently unmade. A repo can commit to preserved history or to persisting raw payroll payloads; committing to both without deciding which yields on collision is the finding.

**Fix:** Decide in this change where fixtures live and which side of the tool boundary they record, because this is the last moment it is free. Either the harness redacts before the file is written, or raw recordings are git-ignored with only redacted golden files checked in. State explicitly that no change may ever require a history rewrite, since the fork strategy has already spent that remedy.
**Status:** upheld

### [WARN] party-visionary — The allowlist is a hand-kept mirror of the registry, and appending to it is the same keystroke as passing the guard

**Quotes:**
> Detection is by explicit allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately.

> a 35-tool surface will eventually gain a tool nobody reviewed closely, and that is precisely the one that leaks.

**Problem:** Upheld, but narrowed, and I say plainly what I now cede. Three seats filed on this line from inside merge day and each did it better than my construction argument: `party-architect` established that the name is not where the read/write fact lives, `party-security` found the changed-tool hole (an allowlisted handler edited to `POST` stays green forever), and `party-ba` found that "approved" is unearned. Those are the mechanism critique and they are theirs. `party-architect`'s NOTE also files the rot half — the stale entry outliving its tool — so I withdraw my second paragraph's claim to that.

What survives as mine is the claim none of them make: the guard degrades *by repetition even if built correctly*. Their findings say the allowlist is weak by construction; mine says the ritual is weak by frequency. Thirty-five later tool changes each pay a mandatory two-file edit — registration plus allowlist — where the second edit is the price of a green build. By the fifth, "add your tool's name to the allowlist" is part of the definition of finishing a tool; by the twenty-eighth it is muscle memory, and it is keystroke-identical to the deliberate act of granting write approval. The contributor who adds `post-payrun` at tool 28 hits red, reads the error, appends, and goes green — not through malice but because that is what the guard has taught them 27 times. That trajectory holds even if `party-security`'s handler content-hash fix lands, because a hash mismatch is also cleared by re-running the update script. `party-po` prices this friction at ~105 edits; pricing is theirs, and what the friction *converts the gate into* is mine.

**Fix:** Make the line a contributor adds a claim the guard verifies rather than a permission it grants — the allowlist entry declares "this tool is a read" and the guard proves it against the handler's reachable HTTP verbs, so appending a name is no longer sufficient to ship a write. Independently of the mechanism chosen, the repetition count is the design input: a gate crossed 35 times by the same hand is not a gate, and the artifact should say what makes crossing it distinguishable from routine on the 28th occasion.
**Status:** upheld

### [WARN] party-visionary — Deleting ~50 inherited files re-litigates itself at every future upstream merge, and the proposal claims the opposite property

**Quotes:**
> **2. Strip every write tool.** Delete the write tool source files and their registrations — not
> merely leave them unregistered. Deleted, so there is nothing to accidentally re-register.

> Per `CLAUDE.md` conventions, keep divergence in added files rather than edits to inherited ones wherever possible.

> Preserving history keeps `git merge upstream` clean, which `CLAUDE.md` explicitly wants.

**Problem:** Upheld, and no seat contested it. `party-architect`'s BLOCK on step 1 is the adjacent but distinct question — how two root histories combine *at this merge*, and which root-level file wins. Mine is the recurring cost of every merge after it, and the two do not overlap: architect's resolves on merge day, mine recurs for the life of the fork.

`party-security`'s WARN #6 independently corroborates the channel. They find that an upstream commit adding `logger.debug(response)` to an inherited file re-introduces payload logging through the merge with no mechanism to catch it. That is a second liability arriving through the same door I flagged, which is evidence the door is a standing one rather than a one-off. Their fix — run the guards on the merge commit — is necessary but not sufficient for my case, because a delete/modify conflict does not produce a wrong file that a guard can inspect; it produces a human being holding 20 or 40 conflicts whose correct resolution is "delete again, every time, forever," and the failure mode of getting one wrong is a resurrected write tool. Guard A catches that only if Guard A is stronger than an allowlist append — which is the finding above, and which architect, security and ba all agree it currently is not. Two weak links on the same chain.

The artifact's own reasoning is applied asymmetrically: Open Question 4 weighs "widens divergence from upstream" for a handful of NZ/UK reads while the far larger deletion of ~50 files, already committed to in step 2, gets no divergence accounting at all.

**Fix:** Decide the upstream merge policy now, while it is cheap. Keep the strip as one isolated commit whose deleted path list is checked in as a manifest, and add a test that fails if any manifested path reappears in the tree — a merge that resurrects a write tool then becomes a red build rather than a careful reviewer's catch, and it fails on the *path*, which no allowlist append clears. Also state whether upstream merges are expected at all, or whether the fork detaches after this change: "stays mergeable" is being paid for in this proposal's structure and should be a decision, not an inheritance.
**Status:** upheld

### [NOTE] party-visionary — The fixture harness is one step from a shape-contract seam that would make all 35 later tools cheap to keep correct, and the proposal uses it only as a PII scanner

**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into.

**Problem:** Upheld, and materially strengthened by `party-architect`. Their BLOCK on "recorded fixture" being one word for two artefacts concludes, from the contract-ambiguity direction, that the design needs both a raw input recording and a projected output recording — which is exactly the two-sided fixture format this NOTE asks for. Two seats independently arriving at the same file format, one from "the contract is ambiguous today" and one from "this seam pays for a year", means the format is not a nicety.

What is still only mine is why the two-sided format is worth more than disambiguation. Once a fixture holds the raw response *and* the expected hand-defined output, replaying the mapping gives every one of the ~35 later tools a regression test as a side effect of a file it was already required to record. That matters here specifically because the hand-defined shape *is* the PII strategy — `party-ba` and `party-security` both establish that the shape assertion proves provenance and not field content — so a mapping that silently starts returning `undefined` is how a tool quietly stops being correct while every guard stays green. And Xero's payroll surface is moving now: the Payday Super fields landed under enforced validation this month, and the spec is pinned at v16.1.0 in the context docs, not frozen.

The concrete future change remains the first Xero payroll spec bump after this repo has tools. With fixtures asserting mappings, that bump is a red test naming the field. Without it, it is a consumer receiving nulls for a superannuation line and nobody noticing until someone reconciles by hand.

**Fix:** Define the fixture format in this change to hold the raw recorded response and the expected hand-defined output, and make the guard replay the mapping. Guard B's value scan then runs over both sides for free, `party-architect`'s ambiguity is resolved by construction, and every later tool inherits shape verification as a side effect of a file it had to write anyway.
**Status:** upheld

### [WARN] party-visionary — Deferring the fixture harness to the change that captures the first real fixture defers the format to the moment it stops being free

**Quotes:**
> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that

> - Real fixture data from a live AU organisation — blocked on Open Decision 1

**Problem:** A rebuttal, not a withdrawal on anyone's behalf. `party-po`'s BLOCK proposes a cut line that puts "fixture harness, value scanner, and the fail-closed/waiver decision" into a later slice "sequenced with the change that captures the first real AU fixture." On the value-per-token lens that is sound, and I do not contest the scanner half — a matcher that scans an empty set genuinely detects nothing today, and deferring it costs the repo nothing.

The *format* is a different object and must not travel with it. The fixture format is the seam all ~35 later tools record into, and it is the thing `party-architect`'s BLOCK shows is currently undefined and my NOTE above shows is one step from paying for itself. Formats defined by the change that first needs data are defined as whatever the capture script happened to emit, under schedule pressure, by an author whose success criterion is "I have a fixture," not "35 tools will inherit this." That change is also the one holding a live AU org's raw payroll payload for the first time — the worst possible moment to be making an unhurried decision about whether raw responses are committed or redacted, which is the BLOCK at the top of this output.

So the deferral po proposes moves two decisions from a change with no data and no deadline into a change with both. Slicing here does not defer cost; it relocates a one-way decision into worse conditions. The distinction po's cut line does not draw is between the *detector*, which is genuinely idle until an org exists, and the *format and capture policy*, which every later change is bound by whether or not any fixture exists yet.

**Fix:** Take po's slice line, and move the boundary: slice 1 keeps the fixture *format* and the capture *policy* — which side of the tool boundary is recorded, redacted or not, committed or git-ignored — while slice 2 takes the value scanner and the waiver mechanics. The format costs a paragraph today and cannot be renegotiated once tools have recorded into it.
**Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN NOTE] party-po — Item 6 asserts positive log content, which is scope beyond the rule it cites

**Quotes:**
> **6. Logging discipline.** Assert the server logs tool names, tenant identifiers and durations, and
> never response bodies (`CLAUDE.md` rule 4). Where the fork logs payloads, remove it.
> - Remove any payload logging inherited from the fork

**Problem:** I argued the cited rule is a prohibition, that removing inherited payload logging returns the whole safety value, and that asserting the server *does* log three named fields smuggles a logging feature into a change that "adds no tools; it only removes and guards", with nothing consuming those logs today.

Round 2 adjudication. party-ba and party-security both show the cheap half is the half I proposed cutting, and that the half I proposed keeping is not independently expressible. party-ba: "the affirmative half is checkable and the negative half names no observation." party-security's fix states the only shape that works — "asserts the emitted lines contain only tool name, tenant id and duration." A prohibition on "response bodies" has no syntactic target; a closed allowlist of permitted log fields does, and it is strictly cheaper to implement and to maintain than an open-ended deny-list. So the positive assertion is not extra scope sitting beside the prohibition — it is the mechanism *of* the prohibition, and cutting it would leave the negative half unfalsifiable, which is the more expensive outcome. The expensive-looking path is the only correct one here.

**Status:** withdrawn — party-ba and party-security show the positive field assertion is the only falsifiable form of the prohibition, not additional scope; a field allowlist is cheaper than an open-ended deny-list on "response bodies", so my cheaper-variant claim was wrong.

### [WITHDRAWN WARN] party-visionary — The fixture waiver list will cover the entire surface on day one and nobody owns emptying it

**Quotes:**
> Recommend fail-closed with an explicit checked-in waiver list, so an unfixtured tool is a visible
> decision rather than a silent gap. This is the single most consequential design question in the
> change — a Guard B that silently skips unfixtured tools would have passed on every tool in the
> repo on day one.

> - Real fixture data from a live AU organisation — blocked on Open Decision 1

**Problem:** Withdrawn. Two findings persuade me, and one of them shows my prescription was wrong.

`party-architect`'s WARN on the coupling of Open Questions 2 and 4 establishes something I missed: a subset of the waived surface — the retained NZ/UK region-restricted reads — can *never* be fixtured, because an AU organisation cannot produce a fixture for them. My prescribed fix was "fail the guard when a fixture source is configured and the waiver list is non-empty." Under architect's observation that rule fails the build forever, on tools whose waiver is permanent and correct. My remedy was broken, and the finding's only unique contribution over the panel's was its remedy.

`party-security`'s fifth BLOCK then files the ownership and drift mechanism I asked for, with more precision than I gave it: per-entry expiry, named owner, a count cap that fails on growth, and the waived count printed on every passing run so partial coverage is visible in a green log. `party-ba` and `party-po` cover the day-one vacuity. Between architect's two-lifetimes distinction and security's expiry-and-owner mechanics, the panel holds the whole of my concern and none of my error. Re-emitting it upheld would spend the most expensive seat on a finding already filed, in a version the other seats have improved.

**Fix:** None from me. Adopt `party-security`'s expiry/owner/cap mechanics with `party-architect`'s requirement that a waiver carry its reason, so "not captured yet" and "structurally unfixturable" have different lifetimes and the second does not keep the first alive.
**Status:** withdrawn — party-architect's OQ2/OQ4 coupling shows my prescribed remedy (fail when the waiver list is non-empty) would fail forever on permanently unfixturable NZ/UK reads, and party-security's BLOCK #5 files the expiry/owner/cap mechanism that was the rest of my contribution.
