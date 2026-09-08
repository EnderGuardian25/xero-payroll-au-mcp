### [BLOCK] party-architect — Guard A keys on the tool name, the one thing the proposal itself says does not carry the write/read fact

**Quotes:**
> Detection is by explicit
> allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately.

**Quotes:**
> Name-pattern heuristics
> (`create-`, `update-`, `delete-`) are a secondary signal, not the mechanism — a write tool named
> `post-payrun` would pass a heuristic and must not pass the guard.

**Problem:** These two sentences argue against each other. The second establishes that a tool's name is not evidence of what the tool does; the first then makes the name the sole key of the mechanism. The property being guarded — "can this tool mutate" — is owned by the handler (which SDK call it makes), not by a string in a registry. Concretely: a tool already on the allowlist whose handler is later edited to call a create/update SDK method passes Guard A forever, and so does a write tool added under an already-approved name. The allowlist detects *new registrations*, which is a different and weaker property than *read-only*, and `CLAUDE.md` rule 1 as the proposal quotes it is about the latter ("an automated check must fail the build if any registered tool can write"). The proposal never names a mechanism that inspects the layer where the decision actually lives.

**Fix:** State the layer the read-only fact is read from — e.g. every tool handler must obtain its Xero client through a single injected read-only client wrapper, and Guard A asserts the wrapper exposes no mutating method and that no handler imports the SDK directly. Keep the name allowlist as the *new-registration* tripwire it actually is, and say so, rather than presenting it as the read-only mechanism.

**Status:** upheld

### [BLOCK] party-architect — The "shape assertion" declared to be Guard B's mechanism has no discriminator at the layer it is placed

**Quotes:**
> - **Shape assertion:** no tool's return value is a raw Xero SDK response object. Every tool returns
>   a hand-defined shape. This is the mechanism; it is what makes leakage structurally impossible
>   rather than merely unobserved.

**Problem:** The artifact places a type-identity decision in a runtime value assertion and calls that placement load-bearing ("This is the mechanism"). At runtime, a deserialized Xero response and a hand-defined projection are both plain objects with string keys; there is no brand, class, or marker named in the proposal that a test could interrogate to tell them apart. An implementer therefore has to invent the discriminator, and every candidate is a different design: a nominal wrapper type returned by every tool, a runtime schema validated per tool, a key-allowlist per tool, or a static lint rule that forbids returning the SDK's types. Those are not implementation details of one mechanism — they are four different mechanisms with four different blast radii across all ~50 inherited tools. Worse, "return value" requires *invoking* every tool, which is a different test shape from Guard A's registry enumeration and is what makes the guard depend on a client (see the stub-seam finding). If the discriminator is left to the implementer, "structurally impossible" is asserted by the prose and not by anything in the code.

**Fix:** Name the discriminator in the artifact. The cheapest seam consistent with "hand-defined shape" is static: every tool declares an output schema/type it owns, tools are forbidden from returning SDK response types, and the guard is a compile-or-lint assertion over the registry rather than a runtime inspection of values. Whichever is chosen, say which layer holds it, because the choice decides whether Guard B needs to call tools at all.

**Status:** upheld

### [BLOCK] party-architect — "Recorded fixture" is an unspecified shared contract, and both readings break Guard B

**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

**Quotes:**
> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that

**Problem:** A fixture is shared by two components — the capture harness that writes it and Guard B that scans it — and the artifact never says which side of the tool boundary it records. The two readings are not close:

- If a fixture is the **recorded Xero response** (the sense the repo's own convention uses when it asks for real response samples per tool, and the sense `GET /Employees/{id}` implies in the Problem section), then a correctly captured AU employee fixture *contains* a TFN and a bank account by construction, and Guard B fails on every honest fixture. The guard then forces fixtures to be pre-redacted, at which point it is scanning material that was scrubbed before the guard ran and proves nothing about any tool.
- If a fixture is the **tool's own return value**, then it is a projection and the scan is meaningful — but then the fixture is not a response sample, cannot verify a hand-defined shape against reality, and gives the shape assertion nothing to compare against.

The design needs both artefacts — a raw input recording and a projected output recording — and the proposal names one word for both. Two implementers will build different directories, different capture points, and mutually incompatible guards, and Open Question 2 ("a fixture for a tool that has none yet") cannot be answered until this is settled because it is asking about an object whose definition is missing.

**Fix:** Split the contract in the artifact: raw response recordings (input, never scanned by Guard B, held to whatever handling rule the repo sets) versus tool-output recordings (what Guard B scans, produced by invoking the tool against the raw recording). State the on-disk location and naming for each and which one "the mechanism later tools record into" refers to.

**Status:** upheld

### [BLOCK] party-architect — Step 1 merges two root histories into a non-empty tree, and the mechanic is deferred to an open question that step 1 depends on

**Quotes:**
> **1. Pull the fork.** Clone `XeroAPI/xero-mcp-server` into this repo, preserving its history, with
> `upstream` configured as a remote so later fixes stay mergeable.

**Quotes:**
> This repo holds four context documents and no code.

**Quotes:**
> Note the current branch is `master` while the fork's default is `main` — worth resolving now rather than at first merge.

**Problem:** "Clone X into this repo, preserving its history" is not a single operation. This repo already has its own commit history and a populated tree (four context documents, `CLAUDE.md`, `config.yaml`, `.specclaw/`, and the change log this proposal wants to write an inventory into); the fork has its own unrelated root. Combining them requires a named choice — fetch upstream and merge with unrelated histories onto `master`, or take the fork's history as the base and replay this repo's commits onto it, or subtree — and each produces a different result for the two things the proposal says it cares about: whether `git merge upstream` stays clean later, and whether existing files survive. Every file that exists in both trees is a co-change at this merge (at minimum the repo-root files this repo has already written and any the fork ships under the same names), and the proposal enumerates none of them. The branch mismatch is correctly spotted and then filed as Open Question 1, i.e. the first step of the change is blocked on an unresolved question in the same document.

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

**Problem:** Booting the registry in CI requires tool registration to be constructible with no Xero client, no `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET`, and no bearer token — and the proposal explicitly defers all auth work to a later change while stating no org exists. Guard B's shape assertion is worse: inspecting "no tool's return value is a raw Xero SDK response object" requires *calling* the tools, which requires a client that can answer. The artifact names no stub, no fake client, and no separation between "register tools" and "construct a Xero client", so whether these tests can run at all in CI is left entirely to the implementer. This is the failure mode where a guard is written, cannot boot headless, and is quietly marked skipped — which is indistinguishable in a green build from a guard that passed. It also determines whether the in-scope CI workflow needs secrets, which the proposal does not say.

**Fix:** Name the seam: registration must be a pure function of nothing (or of an injected client interface), the guards construct it with a fake client, and the artifact states that CI runs both guards with no Xero environment variables set. Then say explicitly that the "deliberately planted violation" demonstration runs in that same headless configuration.

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

**Problem:** These three lines are coupled and the proposal treats them as independent. Guard B is fail-closed on missing fixtures; real fixture data is out of scope pending an org; and the recommendation is to keep the inherited accounting and NZ/UK payroll reads. Taken together, at merge *every* retained tool is unfixtured, so every retained tool lands on the waiver list — and the region-restricted NZ/UK reads can never come off it, because an AU organisation cannot produce a fixture for them. Guard B therefore merges in the state the proposal's own Open Question 2 calls out as the thing to avoid: it "would have passed on every tool in the repo on day one", with the waiver list rather than a silent skip as the mechanism. The waiver list also acquires a second, permanent meaning (structurally unfixturable) alongside its intended one (fixture not captured yet), and nothing distinguishes them.

**Fix:** State the coupling in the artifact and pick the resolution: either the retained inherited reads are decided in this change so the waiver list has a finite, shrinking membership, or the waiver list carries two distinct reasons with different lifetimes and Guard B treats them differently. Also state what Guard B asserts about a tool it has waived — nothing, or the shape assertion only.

**Status:** upheld

### [WARN] party-architect — "TFN, BSB and bank account number shapes" is a shared contract with no definition, and the domain is full of collisions

**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

**Problem:** This is a detector every future fixture author and every future tool has to live with, and the artifact gives an implementer nothing but three names. The open decisions are load-bearing and mutually exclusive: bare digit-run regexes (TFN 8-9 digits, BSB 6, account 6-10) versus checksum-validated matches; whether separators and whitespace are normalised first; whether the scan is over serialised JSON text or over leaf values with their keys. A bare digit-run rule collides with things this surface is *required* to return — ABNs and USIs on `/Superfunds`, `SuperMembershipID`s, employee numbers, and any `YYYYMMDD`-style value, all of which are digit strings in the same length band. One implementer ships a guard that fires on every superannuation fixture; another ships a mod-11-validated matcher that fires on almost nothing. Both satisfy the sentence as written, and the difference decides whether the guard is usable at all.

**Fix:** Define each pattern in the artifact — digit shape, normalisation, checksum or not, and whether matching is keyed or value-only — and state explicitly which known-safe identifier classes (ABN, USI, membership IDs) must not trip it, since those are values this surface is expected to emit.

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

**Problem:** The change introduces at least three artefacts keyed by tool name — Guard A's allowlist, Open Question 2's fixture waiver list, and the change-log before/after inventory — none derived from the registry and each maintained by hand, so they diverge on the first tool added or renamed. The "~4 added files" count covers only the allowlist and omits the waiver list, the fixture-capture scaffolding that the In Scope section commits to, the `config.yaml` command keys, `HANDOFF.md`, and whatever artefact carries the deliberately planted violation. No correctness consequence for the guards themselves, but the co-change set of this commit is larger than the Impact section states, and the proposal also never says what happens to an allowlist entry whose tool no longer exists — a stale approval that outlives its tool is the direction this design does not fail closed in.

**Fix:** List the added files against the In Scope items rather than estimating, and state the stale-entry rule (allowlist and registry must match exactly in both directions, not just registry ⊆ allowlist).

**Status:** upheld
