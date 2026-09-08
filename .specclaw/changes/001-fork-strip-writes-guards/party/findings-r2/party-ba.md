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
