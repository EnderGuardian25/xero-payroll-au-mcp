import { describe, expect, it } from "vitest";

import {
  COMPLIANT_SOURCES,
  KNOWN_LOG_CALLS,
  PLANTED_VIOLATIONS,
  scanSource,
  scanSourceTree,
} from "./scan-payload-logs.js";

describe("Guard C — no payload logging (FR9 / AC12)", () => {
  const scan = scanSourceTree();

  describe("the scan actually ran", () => {
    // NFR4: every universally quantified assertion below is paired with a
    // non-zero count, so "no offending log calls found" can never be satisfied
    // by having scanned nothing.
    it("scanned a non-trivial number of source files", () => {
      expect(scan.filesScanned.length).toBeGreaterThan(20);
    });

    it("scanned the two files known to contain log calls", () => {
      expect(scan.filesScanned).toContain("index.ts");
      expect(scan.filesScanned).toContain("helpers/get-package-version.ts");
    });

    it("excluded only src/__guards__/, and excluded all of it", () => {
      const guardFiles = scan.filesScanned.filter((file) =>
        file.startsWith("__guards__/"),
      );
      expect(guardFiles).toEqual([]);
      // ...and the exclusion did not swallow the rest of the tree.
      expect(
        scan.filesScanned.filter((file) => file.startsWith("handlers/")).length,
      ).toBeGreaterThan(0);
      expect(
        scan.filesScanned.filter((file) => file.startsWith("tools/")).length,
      ).toBeGreaterThan(0);
    });

    it("found log calls, so the parser is reaching real call expressions", () => {
      expect(scan.logCalls.length).toBeGreaterThan(0);
    });
  });

  describe("the known-clean baseline", () => {
    it("contains exactly the known console calls, at their known sites", () => {
      const found = scan.logCalls
        .map(({ file, callee, args }) => ({ file, callee, args }))
        .sort((a, b) => a.file.localeCompare(b.file));

      expect(found).toEqual(KNOWN_LOG_CALLS);
    });

    it("logs an Error at the two error-reporting sites", () => {
      /*
       * This assertion used to cover every log call in the repo, because both
       * of them were error reports. Change 002 added a third — the egress
       * filter's redaction warning — so the blanket form became false and is
       * narrowed here rather than deleted.
       *
       * Narrowed, not relaxed: the two inherited sites are still pinned to
       * logging an `Error` and nothing else, and the third site is covered by
       * the payload-argument check below plus its own entry in
       * KNOWN_LOG_CALLS. What is gone is only the claim that *every* log call
       * in this repo reports an error, which is no longer the case.
       */
      const errorSites = scan.logCalls.filter(
        (call) => !call.file.includes("egress-filter"),
      );

      expect(errorSites.length).toBe(2);
      for (const call of errorSites) {
        expect(call.args[call.args.length - 1]).toBe("error");
      }
    });

    it("logs no value from the egress filter, only where and what kind", () => {
      // The one non-error log call. It exists so a redaction is diagnosable,
      // and it must never carry the value it just refused to return (rule 4).
      const [egress] = scan.logCalls.filter((call) =>
        call.file.includes("egress-filter"),
      );

      expect(egress).toBeDefined();
      const rendered = egress.args.join(" ");
      expect(rendered).toContain("toolName");
      expect(rendered).toContain("finding.kind");
      expect(rendered).toContain("finding.path");
      // The matched text never reaches a log line: redactPii is the only code
      // that holds it, and it returns redacted output rather than the value.
      expect(rendered).not.toMatch(/\bvalue\s*\}|\bmatched\b|\braw\b/);
    });

    it("has no log call passing a payload argument", () => {
      expect(scan.violations).toEqual([]);
      // Paired non-zero count: the clean result above is a statement about
      // real, parsed log calls, not about an empty scan.
      expect(scan.logCalls.length).toBeGreaterThan(0);
    });
  });

  describe("negative control — the guard can fail", () => {
    it("flags every planted violation", () => {
      const missed: string[] = [];

      for (const planted of PLANTED_VIOLATIONS) {
        const result = scanSource(`planted/${planted.label}.ts`, planted.source);
        if (result.violations.length === 0) missed.push(planted.label);
      }

      expect(missed).toEqual([]);
      expect(PLANTED_VIOLATIONS.length).toBeGreaterThan(0);
    });

    it.each(PLANTED_VIOLATIONS)(
      "flags $label with the expected reason",
      ({ label, source, expected }) => {
        const result = scanSource(`planted/${label}.ts`, source);

        expect(result.logCalls.length).toBeGreaterThan(0);
        expect(result.violations.length).toBeGreaterThan(0);
        expect([...new Set(result.violations.map((v) => v.reason))].sort()).toEqual(
          [...expected].sort(),
        );
      },
    );

    it("reports the offending file, line and argument, so a CI failure is actionable", () => {
      const result = scanSource(
        "planted/report-shape.ts",
        "const x = 1;\nconsole.log(response);\n",
      );

      expect(result.violations).toEqual([
        {
          file: "planted/report-shape.ts",
          line: 2,
          callee: "console.log",
          args: ["response"],
          argument: "response",
          reason: "denied-identifier",
          offender: "response",
        },
      ]);
    });
  });

  describe("the checker is not vacuously strict", () => {
    it.each(COMPLIANT_SOURCES)("passes $label", ({ label, source }) => {
      const result = scanSource(`compliant/${label}.ts`, source);
      expect(result.violations).toEqual([]);
    });

    it("recognises the compliant log calls it was given", () => {
      // Without this, "passes" above would also hold for a checker that failed
      // to parse anything at all.
      const logging = COMPLIANT_SOURCES.filter(({ label, source }) => {
        return scanSource(`compliant/${label}.ts`, source).logCalls.length > 0;
      });

      // Every compliant fixture except the deliberate non-log call.
      expect(logging.length).toBe(COMPLIANT_SOURCES.length - 1);
      expect(logging.length).toBeGreaterThan(0);
    });
  });
});
