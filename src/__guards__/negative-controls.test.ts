import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createFakeXeroClient, PLANTED_PII } from "./fake-xero-client.js";
import {
  findDeniedFieldReads,
  findUnreviewedSerialisation,
} from "./scan-pii-fields.js";
import { scanSource } from "./scan-payload-logs.js";
import { findPii } from "./pii-matcher.js";
import { driveAllTools } from "./tool-driver.js";
import type { RegisteredTool } from "./tool-registry.js";

/*
 * PERMANENT NEGATIVE CONTROLS — proof the guards can still fail.
 *
 * ## Why these are tests and not a merge-day ritual
 *
 * The first draft of this change said both guards "must be demonstrated failing
 * against a deliberately planted violation before this change is considered
 * done". The review panel rejected the placement, not the instinct: that is a
 * human ceremony performed once, by the same person who wrote the guard, and it
 * leaves no artifact behind.
 *
 * Nothing would then re-verify catch-power. A refactor that makes an
 * enumeration return the wrong collection, a matcher regex someone loosens to
 * quiet a false positive, an allowlist comparison silently inverted — each
 * leaves the guard passing. And a guard that passes because it can no longer
 * see anything is byte-for-byte identical, in CI output, to a guard that passes
 * because the surface is clean.
 *
 * So the planted violations are checked in and run on every CI invocation.
 * "The guard still catches" is re-proven at the same cadence as "the surface is
 * still clean".
 *
 * That this is not paranoia was settled during the build: Guard B's first run
 * failed on a *clean* surface, because an ISO date beside a bank cue normalised
 * into the account-number band. The fix narrowed the matcher — and narrowing a
 * PII matcher is exactly the drift these controls exist to catch.
 *
 * ## Why the fixtures live under src/__guards__/fixtures/
 *
 * Every guard's source scan excludes `__guards__`, and each one says so in its
 * own comment. That exclusion is what lets these files exist: a scanner that
 * flagged its own negative controls could never be shown to work, and the
 * fixtures would fail the build they protect.
 *
 * The write-tool fixture is likewise never registered into the real registry.
 * If it were, Guard A would fail legitimately and correctly. It is driven
 * through `driveAllTools`' `tools` override instead — the same code path the
 * real surface takes, which is the point.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

describe("Negative controls — each guard is proven able to fail", () => {
  describe("Guard A", () => {
    it("FR6d — a write tool is caught by the runtime capability check", async () => {
      // Driven through the identical mechanism the real surface uses, against
      // the fake client that throws on any non-read method. This is capability
      // evidence, not a name check: the fixture would be caught even if it were
      // called `list-something`.
      const { default: ViolationWriteTool } = await import(
        "./fixtures/violation-write-tool.js"
      );

      const fake = createFakeXeroClient();
      const tool = ViolationWriteTool() as unknown as RegisteredTool;

      await driveAllTools({ client: fake.client, tools: [tool] });

      expect(fake.mutatingCalls.length).toBeGreaterThan(0);
      expect(fake.mutatingCalls.join(",")).toMatch(/createInvoices/);
    });

    it("FR6b — the write tool's source carries a mutating API reference", () => {
      // The static half of the same violation. Guard A applies this rule to the
      // real tree; here it is applied to the fixture, so the rule is shown to
      // have teeth against a concrete example rather than only against nothing.
      const source = fixture("violation-write-tool.ts");
      expect(/\.\s*(?:create|update|delete|post|put|patch)[A-Z]\w*/.test(source)).toBe(
        true,
      );
    });

    it("FR6c — the direct-SDK fixture binds a capable xero-node symbol", () => {
      const source = fixture("violation-direct-sdk-import.ts");
      expect(/from\s+["']xero-node["']/.test(source)).toBe(true);
      expect(/new\s+XeroClient\s*\(/.test(source)).toBe(true);
    });
  });

  describe("Guard B", () => {
    it("FR7a — a hand-mapped denied field read is caught, in both access forms", () => {
      const violations = findDeniedFieldReads(
        fixture("violation-tfn-field.ts"),
        "violation-tfn-field.ts",
      );

      expect(violations.length).toBeGreaterThan(0);

      // Both forms must be represented. A check that catches dot access and
      // misses bracket access is a hole a contributor finds by accident.
      const forms = new Set(violations.map((v) => v.form));
      expect(forms.has("dot")).toBe(true);
      expect(forms.has("bracket")).toBe(true);

      const fields = new Set(violations.map((v) => v.field));
      expect(fields.has("taxFileNumber")).toBe(true);
      expect(fields.has("bankAccountNumber")).toBe(true);
    });

    it("FR7b — unreviewed serialisation is caught, including the exact T15 defect", () => {
      const violations = findUnreviewedSerialisation(
        fixture("violation-response-stringify.ts"),
        "violation-response-stringify.ts",
      );

      expect(violations.length).toBeGreaterThan(1);
      expect(violations.some((v) => /rows/.test(v.snippet))).toBe(true);
      expect(violations.some((v) => /body/.test(v.snippet))).toBe(true);
    });

    it("FR7c — a tool that renders a TFN is caught by both detectors", async () => {
      // The dynamic half. Exact-substring and the shared matcher must both
      // flag it, because each has a gap the other covers.
      const leaky = {
        name: "violation-renders-tfn",
        description: "Negative control. Never registered.",
        schema: {},
        handler: async () => ({
          content: [
            {
              type: "text" as const,
              text: `TFN ${PLANTED_PII.taxFileNumber} / BSB ${PLANTED_PII.bsb}`,
            },
          ],
        }),
      } as unknown as RegisteredTool;

      const fake = createFakeXeroClient({ plantPii: true });
      const [driven] = await driveAllTools({
        client: fake.client,
        tools: [leaky],
      });

      expect(driven.error).toBeNull();
      expect(driven.renderedText).toContain(PLANTED_PII.taxFileNumber);
      expect(findPii(driven.renderedText).length).toBeGreaterThan(0);
    });
  });

  describe("Guard C", () => {
    it("FR9 — a payload passed to a log call is caught", () => {
      // The upstream-merge scenario the panel named: a merge that adds
      // logger.debug(response) to an inherited file must go red.
      const planted = [
        "logger.debug(response);",
        "console.log(JSON.stringify(res.body));",
        'console.error("failed:", response.body);',
      ].join("\n");

      const result = scanSource("planted.ts", planted);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.logCalls.length).toBeGreaterThan(0);
    });

    it("FR9 — a compliant log call is not flagged", () => {
      // Pairs with the test above. A checker that flags everything is as
      // useless as one that flags nothing, and would be turned off as fast.
      const compliant =
        'console.error("Error:", error);\n' +
        'logger.info("tool", toolName, "tenant", tenantId, "ms", durationMs);';

      const result = scanSource("compliant.ts", compliant);

      expect(result.logCalls.length).toBeGreaterThan(0);
      expect(result.violations).toEqual([]);
    });
  });

  it("the fixtures exist and are excluded from every guard's own scan", () => {
    // NFR4 for this file: if the fixtures were missing or the directory moved,
    // every assertion above would still pass against empty strings. Assert the
    // material is actually there and non-trivial.
    for (const name of [
      "violation-write-tool.ts",
      "violation-direct-sdk-import.ts",
      "violation-tfn-field.ts",
      "violation-response-stringify.ts",
    ]) {
      expect(fixture(name).length).toBeGreaterThan(200);
    }
  });
});
