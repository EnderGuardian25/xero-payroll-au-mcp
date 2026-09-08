# Learnings: 001-fork-strip-writes-guards

Build learnings, spec gaps, and patterns discovered.

**Categories:** spec_gap | design_gap | pattern | best_practice | agent_issue

---

## [L1] design_gap — Upstream package-lock.json is out of sync with its packag...

**When:** 2026-09-08 11:42 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail
Upstream package-lock.json is out of sync with its package.json; npm ci fails EUSAGE on @emnapi/* drift. The plan assumed npm ci would work and only flagged it as a risk.

### Action
When forking, verify npm ci (not just npm install) in the first wave; treat a lockfile regen as expected inherited-file divergence and note it for future upstream merges.

---

## [L2] design_gap — Five retained report tools render JSON.stringify(report.r...

**When:** 2026-09-08 12:01 UTC
**Category:** design_gap
**Priority:** high
**Status:** pending

### Detail
Five retained report tools render JSON.stringify(report.rows) — proven by probe to leak a planted TFN and BSB verbatim. The plan's FR7b said 'no whole response or .body serialisation', which these pass on a technicality while violating CLAUDE.md hard rule 2.

### Action
When specifying a no-passthrough guard, phrase the requirement as 'no unreviewed Xero-derived value reaches output' rather than naming specific objects; and probe the retained surface for stringify call sites during planning, not during build.

---
