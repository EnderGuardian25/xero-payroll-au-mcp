### [BLOCK] party-visionary — Real payroll fixtures in preserved git history is the one commitment here that no later change can undo, and it collides with the mergeability this same change buys

**Quotes:**
> **1. Pull the fork.** Clone `XeroAPI/xero-mcp-server` into this repo, preserving its history, with
> `upstream` configured as a remote so later fixes stay mergeable.

> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into. Populated with real AU data only once an org exists (Open Decision 1); the harness must not
>   block on that

> leaks PII into an LLM context window, which is an unrecoverable disclosure.

**Problem:** This change makes two decisions that cannot both survive. It commits the repo to preserved, mergeable history, and it stands up the mechanism by which real Australian payroll payloads — the ones the problem statement says carry TFNs, BSBs and account numbers — will later be written into the versioned tree. Guard B fails the *build*; it does not fail the *commit*. So the first fixture-capture session after Open Decision 1 resolves produces a local commit containing a live TFN, and Guard B's verdict arrives after that object exists in history and quite possibly after a push. The only remediation for PII in git history is a history rewrite, which destroys the merge lineage this change spent its entire fork strategy preserving, and which cannot be coordinated with anyone who has already cloned. Every other commitment in this proposal is revisable by a later change: the allowlist can be replaced, the guards tightened, deleted files restored from history. This one is not, and the artifact does not name it as a door. It treats fixture capture as scaffolding whose only open question is timing.

The concrete future change: the change that captures the first real fixture from the AU org, plus each of the ~35 tool changes that record one. Each is an opportunity to commit an unredacted payload, and the cost of one mistake is permanent and unbounded.

**Fix:** Decide now, in this change, where fixtures live, because this is the last moment it is free. Either (a) fixtures are redacted at capture time by the harness — the scrub happens before the file is written, and Guard B's value scan becomes the honesty check on the scrubber rather than the only line of defence — or (b) recorded fixtures are git-ignored and live outside the versioned tree, with only redacted golden files checked in. Add the guard as a pre-commit hook as well as a CI step, so the failure lands before the object is created. State explicitly that no change may ever require a history rewrite, since the fork strategy has already foreclosed that remedy.

**Status:** upheld

### [WARN] party-visionary — The allowlist is a hand-kept mirror of the registry, and appending to it is the same keystroke as passing the guard

**Quotes:**
> Detection is by explicit allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately.

> a 35-tool surface will eventually gain a tool nobody reviewed closely, and that is precisely the one that leaks.

**Problem:** Guard A never inspects what a tool does. It asserts that a string appears in a file. That means every one of the ~35 future tool-adding changes must edit two places — the registration and the allowlist — and the second edit is mandatory to get CI green. After the fifth such change, "add your tool's name to `allowlist.ts`" is muscle memory, part of the definition of finishing a tool, and it is indistinguishable from the deliberate act of granting write approval that the guard was supposed to force. The contributor who adds `post-payrun` at tool 28 will hit the red build, read the error, append the name, and go green — not out of malice but because that is what the guard has taught them to do 27 times. The proposal cites "a tool nobody reviewed closely" as the reason this change exists first, then builds a mechanism whose entire strength is that someone reviews the allowlist diff closely.

The sync failure has a second face: the allowlist keys on names, so a rename in a later refactor breaks CI in a way whose only fix is editing the list, and a tool deleted in a later change leaves a stale entry nothing fails on. The list drifts long, and a long allowlist with dead entries is read less carefully, not more.

**Fix:** Make the line the contributor adds a *claim the guard verifies* rather than a permission it grants. Assert a machine-checkable property of each registered tool — that its implementation reaches Xero only through a single HTTP client that refuses any non-GET verb, or that it calls only from a whitelist of read client methods. Then the allowlist entry declares "this tool is a read" and the guard proves it, so appending a name to make CI green is no longer sufficient to ship a write. If the allowlist stays the mechanism, at minimum derive it from the registry (fail on entries with no matching tool) so it cannot silently rot.

**Status:** upheld

### [WARN] party-visionary — The fixture waiver list will cover the entire surface on day one and nobody owns emptying it

**Quotes:**
> Recommend fail-closed with an explicit checked-in waiver list, so an unfixtured tool is a visible
> decision rather than a silent gap. This is the single most consequential design question in the
> change — a Guard B that silently skips unfixtured tools would have passed on every tool in the
> repo on day one.

> - Real fixture data from a live AU organisation — blocked on Open Decision 1

**Problem:** The artifact spots the day-one hole in the *skip* option and then chooses an option that reproduces it with paperwork. Because real fixtures are blocked on an org that does not yet exist, the waiver list at merge contains every tool on the surface. Each of the ~35 later tool changes appends one more line, because the org still may not exist when they land, and each append is the path of least resistance with a documented blessing in this proposal. The value assertion — the honesty check that is supposed to catch what the shape assertion misses — then executes over an empty set while CI reports green, which is operationally identical to the outcome this paragraph says would be unacceptable.

The drift is quiet and slow: the waiver file grows monotonically, nobody is assigned the change that removes an entry, and the discovery event is not a red build but a leaked TFN in someone's context window. Realistically that is a year out, when the org exists, tools are being used, and the waiver list is 40 lines nobody has read since it was 3.

**Fix:** Give the waiver an expiry the build can see. Make the guard fail when a fixture source is configured and the waiver list is non-empty, so resolving Open Decision 1 forces the cleanup instead of leaving it optional. Record the waived tool count as a checked-in number and fail when it increases, so growth is a deliberate edit rather than an append. And state who owns emptying it — the change that captures the first real fixture should be the change that removes all of them or explains each survivor.

**Status:** upheld

### [WARN] party-visionary — Deleting ~50 inherited files re-litigates itself at every future upstream merge, and the proposal claims the opposite property

**Quotes:**
> **2. Strip every write tool.** Delete the write tool source files and their registrations — not
> merely leave them unregistered. Deleted, so there is nothing to accidentally re-register.

> Per `CLAUDE.md` conventions, keep divergence in added files rather than edits to inherited ones wherever possible.

> Preserving history keeps `git merge upstream` clean, which `CLAUDE.md` explicitly wants.

**Problem:** Wholesale deletion of the inherited tool tree is the largest possible edit to inherited files, and the proposal asserts merge cleanliness in the same breath. Git merges deletions cleanly only while upstream leaves those paths alone. Upstream is an actively maintained 360-star server whose write tools sit next to the shared Xero client; the first upstream release that touches `create-invoice.ts` or refactors the client those files import produces a delete/modify conflict per file. So the next `git merge upstream` — which is exactly what the bearer-token change (step 2) or any upstream security patch needs — hands a person 20 or 40 conflicts whose correct resolution is "delete again, every time, forever." That person is not necessarily the one who made the deletion decision, and the failure mode of getting one wrong is a resurrected write tool. Guard A catches that only if Guard A is stronger than an allowlist append, which is the previous finding.

This is not the merge cost of this commit — that cost is zero, since there is no upstream divergence yet. It is a recurring tax levied on every future upstream sync for the life of the fork, and the artifact's own reasoning about divergence (Open Decision 4 weighs "widens divergence from upstream" for the NZ/UK reads) is not applied to the far larger deletion it has already committed to.

**Fix:** Decide the upstream merge policy now, while it is cheap. Keep the strip as one isolated commit whose path list is checked in as a manifest, and add a test that fails if any manifested path reappears in the tree — then a merge that resurrects a write tool is a red build rather than a careful reviewer's catch. Also state whether upstream merges are expected at all, or whether the fork detaches after this change; "stays mergeable" is being paid for in this proposal's structure and should be a decision, not an inheritance.

**Status:** upheld

### [NOTE] party-visionary — The fixture harness is one step from a shape-contract seam that would make all 35 later tools cheap to keep correct, and the proposal uses it only as a PII scanner

**Quotes:**
> - **Value assertion:** scan every tool's recorded fixture for values matching TFN, BSB and bank
>   account number shapes, and fail on a match. This is the honesty check on the mechanism.

> - Fixture-capture scaffolding — the harness Guard B scans, and the mechanism later tools record
>   into.

**Problem:** This change builds the single most leverage-bearing piece of infrastructure in the repo — a mechanism that records a real Xero payload next to a tool — and spends it on one grep. The same recorded fixture, replayed through the tool's mapping and asserted against its hand-defined shape, would give every one of the ~35 later tools a regression test for free at the moment it is written. That matters here specifically because the hand-defined shape is the whole PII strategy: a mapping that silently starts returning `undefined` is how a tool quietly stops being correct, and Xero's payroll surface is moving right now — the Payday Super fields (`IsQualifyingEarnings`, `IncludeLeaveLoadingInQualifyingEarnings`) landed under enforced validation this month, and the spec is pinned at v16.1.0 in the context docs, not frozen.

The concrete future change: the first Xero payroll spec bump after this repo has tools. With fixtures asserting mappings, that bump is a red test naming the field. Without it, it is a consumer receiving nulls for a superannuation line and nobody noticing until someone reconciles by hand. The proposal stops one step short with no stated reason, and the step is small only while the harness is still being written.

**Fix:** Define the fixture format so it holds the raw recorded response *and* the expected hand-defined output, and make the guard replay the mapping. Guard B's value scan then runs over both sides for free, and every later tool inherits shape verification as a side effect of the fixture it was already required to record.

**Status:** upheld
