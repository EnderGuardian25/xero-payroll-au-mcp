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
