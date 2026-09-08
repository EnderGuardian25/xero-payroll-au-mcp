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

### [NOTE] party-po — Item 6 asserts positive log content, which is scope beyond the rule it cites

**Quotes:**
> **6. Logging discipline.** Assert the server logs tool names, tenant identifiers and durations, and
> never response bodies (`CLAUDE.md` rule 4). Where the fork logs payloads, remove it.
> - Remove any payload logging inherited from the fork

**Problem:** I argued the cited rule is a prohibition, that removing inherited payload logging returns the whole safety value, and that asserting the server *does* log three named fields smuggles a logging feature into a change that "adds no tools; it only removes and guards", with nothing consuming those logs today.

Round 2 adjudication. party-ba and party-security both show the cheap half is the half I proposed cutting, and that the half I proposed keeping is not independently expressible. party-ba: "the affirmative half is checkable and the negative half names no observation." party-security's fix states the only shape that works — "asserts the emitted lines contain only tool name, tenant id and duration." A prohibition on "response bodies" has no syntactic target; a closed allowlist of permitted log fields does, and it is strictly cheaper to implement and to maintain than an open-ended deny-list. So the positive assertion is not extra scope sitting beside the prohibition — it is the mechanism *of* the prohibition, and cutting it would leave the negative half unfalsifiable, which is the more expensive outcome. The expensive-looking path is the only correct one here.

**Status:** withdrawn — party-ba and party-security show the positive field assertion is the only falsifiable form of the prohibition, not additional scope; a field allowlist is cheaper than an open-ended deny-list on "response bodies", so my cheaper-variant claim was wrong.

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
