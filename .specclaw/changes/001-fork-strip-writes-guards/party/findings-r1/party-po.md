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

**Problem:** By the proposal's own accounting, on the day this ships there are zero fixtures — real fixture data is out of scope and blocked on Open Decision 1. The value assertion therefore scans nothing, and the recommended fail-closed posture means the deliverable is a waiver list with one entry for every tool on the surface (~50 by the Impact estimate). That is three artifacts built and paid for — scanner, harness, waiver list — returning zero detections until an org exists at an unknown date, and the waiver list starts at 100% waived, which is the same coverage as not having the scanner. Meanwhile the proposal names the shape assertion as the load-bearing half: *"This is the mechanism; it is what makes leakage structurally impossible rather than merely unobserved."* Priced against do-nothing: if the value scan ships in no form at all, nothing gets worse today, because there is no fixture to scan, no org (*"there is no org yet"*), no payroll tool, and no release (*"Publishing or packaging the server"* is out of scope). The cheaper variant — Guard A + Guard B shape assertion + CI now, value scan and fixture harness in the same change that records the first real fixture — captures the whole stated mechanism value and defers the part that cannot detect anything. The proposal never considers it, and never names any cut line: all six items are bundled behind one gate, *"both guards must be demonstrated failing against a deliberately planted violation before this change is considered done"*.

**Fix:** Split into two shippable slices and state the line. Slice 1: fork, strip writes, Guard A allowlist, Guard B shape assertion, CI workflow — each independently worth having and each fully testable with no fixture. Slice 2: fixture harness, value scanner, and the fail-closed/waiver decision, sequenced with the change that captures the first real AU fixture, where the waiver list is short enough to be meaningful. If slice 2 must stay in this change, state what it detects on day one and why that is worth the waiver list.

**Status:** upheld

### [WARN] party-po — Keeping the NZ/UK read tools imports dead surface into both guards' per-tool cost base for zero stated AU value

**Quotes:**
> 4. **Are the fork's inherited payroll read tools (NZ/UK employees, leave, timesheets) kept or
>    removed?** They are read-only and so pass Guard A, but they are region-restricted and answer
>    nothing an AU consumer asks. Keeping them means dead surface that still consumes a consumer's
>    tool budget and rate limit; removing them widens divergence from upstream. Recommend keeping the
>    reads for now — the brief says "keep the reads, strip the writes" — and revisiting when the tool
>    count is known.

**Problem:** The proposal states the cost of keeping them ("dead surface", consumer tool budget, rate limit) and states the value as nil ("answer nothing an AU consumer asks"), then recommends keeping them on the strength of a quoted slogan rather than a value argument. The cost is larger than the paragraph admits, because it compounds with the guards being built in the same change: every kept tool needs an allowlist entry, must satisfy the hand-defined-shape assertion, and under the recommended fail-closed Guard B needs either a recorded fixture or a waiver entry. That is per-tool work, paid now and maintained forever, on tools the proposal says nobody will call. The counter-cost offered — "removing them widens divergence from upstream" — is unpriced and is in tension with the change's own thesis that the same audit is cheaper on a smaller surface ("auditing 85 tools instead of 50").

**Fix:** Decide this before planning, not after ("revisiting when the tool count is known" defers it past the point where the guard cost is already sunk). If they are kept, state the value that justifies their allowlist, shape-check and fixture-or-waiver cost. If the value is nil, delete them in this change while deletions are already the dominant diff, and price the divergence you accept.

**Status:** upheld

### [WARN] party-po — The per-tool friction tax the fail-closed allowlist imposes on ~35 later tools is never numbered

**Quotes:**
> Detection is by explicit allowlist: every registered tool name must appear in a checked-in list of approved read-only tools,
> so a *new* tool fails closed until someone adds it deliberately.
> Recommend fail-closed with an explicit checked-in waiver list, so an unfixtured tool is a visible
>   decision rather than a silent gap.

**Problem:** This change's real recurring cost is not CI minutes, it is the mandatory per-tool paperwork it installs for every one of the ~35 Payroll AU tools still to be written: an allowlist entry, a hand-defined shape, and a fixture or a waiver entry, each a checked-in file edit that must land in the same commit as the tool or the build is red. The proposal asserts the benefit of failing closed but never states the number — three checked-in artifacts touched per tool, roughly 105 edits across the remaining build order — nor whether the allowlist and waiver list are two separate lists to keep in sync. Without that number the trade between "fails closed" and "fails annoying" cannot be judged, and the cost lands on later changes that will not get their own panel on this decision.

**Fix:** State the per-new-tool cost explicitly (which files a contributor must touch, and how many), and state whether the allowlist and the fixture waiver are one artifact or two. If it is two, justify the second.

**Status:** upheld

### [WARN] party-po — The Impact estimate contradicts the proposal's own In Scope list

**Quotes:**
> - **Files affected:** ~60 (estimated) — the fork's tool tree is ~50 tools; deletions dominate, plus
>   ~4 added files (two guards, an allowlist, a CI workflow)
> 3. **Does the fork have any test infrastructure to build on,** or does a runner need standing up?
>    `build.test_command`, `lint_command` and `build_command` are all empty in `config.yaml` and need
>    filling as part of this change.
> - **Complexity:** medium — the removal is mechanical, but establishing a guard that fails *closed*

**Problem:** The stated cost is contradicted by the artifact's own scope. The "~4 added files" omits the fixture-capture scaffolding, the Guard B waiver list the proposal recommends, the test-runner and lint/build configuration that Open Question 3 concedes "need filling as part of this change", the CI-consumed config edits, `HANDOFF.md`, and the before/after inventory record — all of which appear in In Scope. It also omits the work item hidden in Impact/Risk: building a deliberately planted violation for each guard and demonstrating both fail, which is a fixture-and-revert exercise, not a line of test code. And Open Question 3 is open in both directions: if no runner exists, standing one up is unbounded work priced at "medium" alongside a mechanical deletion pass. A cost estimate that excludes the two most uncertain items in its own scope cannot support an approve-to-plan decision.

**Fix:** Re-state Impact with a line per added artifact, and split the estimate on Open Question 3 into the two branches (runner exists / runner must be stood up) so the approver sees which cost they are approving.

**Status:** upheld

### [NOTE] party-po — Item 6 asserts positive log content, which is scope beyond the rule it cites

**Quotes:**
> **6. Logging discipline.** Assert the server logs tool names, tenant identifiers and durations, and
> never response bodies (`CLAUDE.md` rule 4). Where the fork logs payloads, remove it.
> - Remove any payload logging inherited from the fork

**Problem:** The cited rule is a prohibition. Removing inherited payload logging is already an In Scope line and returns the whole safety value. Asserting that the server *does* log tool names, tenant identifiers and durations is a different and larger job: if the fork does not already emit those three fields, this smuggles a logging feature — plus the assertions that pin its format — into a change whose stated purpose is that it "adds no tools; it only removes and guards". No value is attached to the positive half; nothing in this change consumes those logs, since there is no org, no consumer and no deployment.

**Fix:** Keep the negative assertion and the payload-logging removal in this change. Cut the positive log-field assertion, or, if it is kept, state what consumes those fields now and why it cannot wait for the change that first talks to a real tenant.

**Status:** upheld
