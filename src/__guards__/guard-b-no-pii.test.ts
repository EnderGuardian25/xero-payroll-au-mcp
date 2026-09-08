import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createFakeXeroClient,
  PLANTED_PII,
  PLANTED_PII_VALUES,
} from "./fake-xero-client.js";
import { findPii } from "./pii-matcher.js";
import {
  collectSourceFiles,
  findDeniedFieldReads,
  findUnreviewedSerialisation,
  REPO,
  SOURCE_FILES,
  SRC,
  stripCommentsAndStrings,
} from "./scan-pii-fields.js";
import { driveAllTools } from "./tool-driver.js";
import { enumerateRegisteredTools } from "./tool-registry.js";

describe("Guard B — no TFN, BSB or bank account number reaches a caller", () => {
  it("FR7a — no source file reads a denied Xero field", () => {
    // NFR4: prove the scan actually saw the surface before trusting a clean
    // result. "No denied reads found" must not be reachable by scanning nothing.
    expect(SOURCE_FILES.length).toBeGreaterThan(20);
    const scanned = SOURCE_FILES.map((f) => relative(REPO, f));
    expect(scanned.some((f) => f.includes(`handlers${sep}`))).toBe(true);
    expect(scanned.some((f) => f.includes(`tools${sep}`))).toBe(true);

    const violations = SOURCE_FILES.flatMap((f) =>
      findDeniedFieldReads(readFileSync(f, "utf8"), relative(REPO, f)),
    );

    expect(violations).toEqual([]);
  });

  it("FR7a — the field scan catches both access forms, and ignores prose", () => {
    // The load-bearing test for the scanner itself. A scanner that cannot fail
    // is not a check, and one that fires on tool descriptions gets switched off.
    expect(
      findDeniedFieldReads("const t = employee.taxFileNumber;"),
    ).toHaveLength(1);
    expect(
      findDeniedFieldReads('const t = employee["taxFileNumber"];'),
    ).toHaveLength(1);
    expect(findDeniedFieldReads("const t = emp.bankAccountNumber;")).toHaveLength(
      1,
    );

    // Prose and comments must not trip it — Xero tool descriptions are long
    // English written for an LLM and mention bank accounts constantly.
    expect(
      findDeniedFieldReads('const d = "Lists the bank account number";'),
    ).toEqual([]);
    expect(
      findDeniedFieldReads("// never render employee.taxFileNumber here"),
    ).toEqual([]);
    expect(
      findDeniedFieldReads("/* taxFileNumber must not be read */"),
    ).toEqual([]);
  });

  it("FR7b — no tool serialises an unreviewed Xero-derived value", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(20);

    const violations = SOURCE_FILES.flatMap((f) =>
      findUnreviewedSerialisation(readFileSync(f, "utf8"), relative(REPO, f)),
    );

    expect(violations).toEqual([]);
  });

  it("FR7b — the serialisation scan catches the defect T15 removed", () => {
    // This is the exact line that was in five retained tools, and which a
    // probe proved leaked a planted TFN and BSB.
    expect(
      findUnreviewedSerialisation(
        "text: JSON.stringify(report.rows, null, 2),",
      ),
    ).toHaveLength(1);
    expect(
      findUnreviewedSerialisation("JSON.stringify(response.body)"),
    ).toHaveLength(1);

    // A mapped local shape is reviewed by construction and must stay allowed,
    // or the guard would forbid the fix it is meant to require.
    expect(findUnreviewedSerialisation("JSON.stringify(mapped)")).toEqual([]);
  });

  it("FR7c — every registered tool, driven against planted PII, renders none of it", async () => {
    const registry = enumerateRegisteredTools();
    expect(registry.length).toBeGreaterThan(0);

    // Both passes. Several tools branch on whether an optional id was supplied
    // — list-contact-groups and list-manual-journals each read a different Xero
    // method — so driving only one pass leaves half the read paths untouched.
    for (const optional of ["fill", "omit"] as const) {
      const fake = createFakeXeroClient({ plantPii: true });
      const driven = await driveAllTools({ client: fake.client, optional });

      expect(driven.length).toBe(registry.length);

      // NFR4 again, and the sharpest form of it here: a tool that errored
      // rendered nothing, and "nothing" contains no PII. Counting that as a
      // pass is how this assertion would go quietly vacuous.
      const usable = driven.filter((d) => d.error === null);
      expect(usable.length).toBe(driven.length);

      for (const tool of usable) {
        for (const planted of PLANTED_PII_VALUES) {
          expect(
            tool.renderedText.includes(planted),
            `${tool.name} (optional=${optional}) rendered a planted value`,
          ).toBe(false);
        }

        // Second detector. Exact-substring only sees the values we planted;
        // the shared matcher also catches a re-formatted or partially
        // reproduced one. Both run, because each has a gap the other covers.
        expect(
          findPii(tool.renderedText),
          `${tool.name} (optional=${optional}) rendered matcher-detected PII`,
        ).toEqual([]);
      }
    }
  });

  it("FR7c — the driven check is not vacuous: the same harness detects a real leak", async () => {
    // Proof the assertion above can fail. A synthetic tool that renders the
    // planted TFN is driven through the identical code path, and both detectors
    // must flag it. Without this, FR7c passing tells us nothing.
    const leakyTool = {
      name: "violation-renders-tfn",
      description: "Synthetic negative control. Never registered.",
      schema: {},
      handler: async () => ({
        content: [
          {
            type: "text" as const,
            text: `Employee TFN: ${PLANTED_PII.taxFileNumber}, BSB ${PLANTED_PII.bsb}`,
          },
        ],
      }),
    };

    const fake = createFakeXeroClient({ plantPii: true });
    const [driven] = await driveAllTools({
      client: fake.client,
      tools: [leakyTool as unknown as ReturnType<typeof enumerateRegisteredTools>[number]],
    });

    expect(driven.error).toBeNull();
    expect(
      PLANTED_PII_VALUES.some((v) => driven.renderedText.includes(v)),
    ).toBe(true);
    expect(findPii(driven.renderedText).length).toBeGreaterThan(0);
  });

  it("FR7d — the PII matcher is imported, never reimplemented", () => {
    // A second copy of the TFN checksum is the failure this clause exists to
    // stop: two implementations drift, and the one nobody is looking at is the
    // one that stops catching. Only pii-matcher.ts may define the algorithm.
    const matcherPath = join(SRC, "__guards__", "pii-matcher.ts");
    const others = collectSourceFiles(SRC).concat(
      readdirSync(join(SRC, "__guards__"))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(SRC, "__guards__", f)),
    );

    const reimplementations = others
      .filter((f) => f !== matcherPath)
      .filter((f) => {
        const code = stripCommentsAndStrings(readFileSync(f, "utf8"));
        // The ATO weight vector is the algorithm's fingerprint.
        return /1\s*,\s*4\s*,\s*3\s*,\s*7\s*,\s*5\s*,\s*8\s*,\s*6\s*,\s*9\s*,\s*10/.test(
          code,
        );
      })
      .map((f) => relative(REPO, f));

    // The matcher's own test legitimately restates the weights from the ATO
    // spec so a corrupted implementation constant cannot pass — that is
    // deliberate and is not a second implementation.
    const unexpected = reimplementations.filter(
      (f) => !f.endsWith("pii-matcher.test.ts"),
    );

    expect(unexpected).toEqual([]);
  });
});
