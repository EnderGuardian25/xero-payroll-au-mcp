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

### [WARN] party-visionary — The fixture waiver list will cover the entire surface on day one and nobody owns emptying it

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
