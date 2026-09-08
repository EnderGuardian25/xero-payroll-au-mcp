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
