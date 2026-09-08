import { beforeEach, describe, expect, it } from "vitest";

import {
  egressRedactions,
  resetEgressRedactions,
  withEgressFilter,
} from "../security/egress-filter.js";
import { findPii } from "../security/pii-matcher.js";
import {
  AUTHORISED_CONNECTIONS,
  PLANTED_PII,
  PLANTED_PII_VALUES,
} from "./fake-xero-client.js";
import { SYNTHETIC_GUID } from "./tool-driver.js";

/*
 * The runtime egress filter — the last thing between a live Xero response and
 * a caller.
 *
 * ## Why it needs its own permanent controls
 *
 * Change 001's guards are static analysis plus a driven check against a fake
 * client. Their shared blind spot, recorded in 001's own spec rather than
 * glossed, is a value that arrives at run time through a path no test
 * exercised. This filter covers that, and the same argument 001 made about its
 * own guards applies here: a filter demonstrated once and trusted afterwards is
 * indistinguishable, in CI output, from a filter that has stopped seeing
 * anything.
 *
 * So the leak is planted and asserted on every run, not checked by hand at
 * merge time.
 *
 * ## The two failure directions
 *
 * A filter that misses PII is the obvious failure. A filter that mangles clean
 * output is the one that gets it switched off — these are financial reads, and
 * a report full of `[redacted]` where the figures should be is worse than
 * useless. Both directions are asserted.
 */

beforeEach(() => {
  resetEgressRedactions();
});

/** Runs a handler through the filter, as `CreateXeroTool` would. */
async function throughFilter(
  toolName: string,
  result: unknown,
): Promise<{ rendered: string; entries: Record<string, unknown>[] }> {
  const handler = withEgressFilter(toolName, (async () => result) as never);
  const filtered = (await (handler as unknown as () => Promise<{
    content: Record<string, unknown>[];
  }>)()) as { content: Record<string, unknown>[] };

  const entries = filtered.content ?? [];
  return {
    rendered: entries
      .map((entry) =>
        Object.values(entry)
          .filter((v): v is string => typeof v === "string")
          .join(" "),
      )
      .join("\n"),
    entries,
  };
}

describe("egress filter — spec FR7", () => {
  it("strips a TFN, BSB and account number, and records each", async () => {
    const { rendered } = await throughFilter("probe", {
      content: [
        { type: "text", text: `TFN ${PLANTED_PII.taxFileNumber}` },
        {
          type: "text",
          text: `Bank account number ${PLANTED_PII.bankAccountNumber}, BSB ${PLANTED_PII.bsb}`,
        },
      ],
    });

    for (const planted of PLANTED_PII_VALUES) {
      expect(rendered, `${planted} survived the filter`).not.toContain(planted);
    }
    // Second detector, as Guard B does: exact-substring only sees what was
    // planted, the matcher also catches a re-formatted one.
    expect(findPii(rendered)).toEqual([]);

    expect(egressRedactions().length).toBeGreaterThan(0);
  });

  it("records the tool, the kind and the path — and never the value", async () => {
    await throughFilter("probe-tool", {
      content: [{ type: "text", text: `TFN ${PLANTED_PII.taxFileNumber}` }],
    });

    const [record] = egressRedactions();
    expect(record.toolName).toBe("probe-tool");
    expect(record.kind).toBe("tfn");
    expect(record.path).toContain("content[0]");

    // Rule 4. The record is what an operator would see; the value we just
    // refused to return must not be in it.
    expect(JSON.stringify(egressRedactions())).not.toContain(
      PLANTED_PII.taxFileNumber,
    );
  });

  it("leaves a clean response byte-identical (spec NFR5 / AC10)", async () => {
    // The failure that gets a filter disabled. These are financial reads: a
    // report rendered as [redacted] where the figures belong is worse than no
    // filter at all.
    const clean = {
      content: [
        { type: "text", text: "Found 3 invoices in Wattle Street Pty Ltd:" },
        {
          type: "text",
          text: [
            "Invoice: INV-0042",
            "Total: 1234.56",
            "Date: 2026-08-14",
            "ABN: 53 004 085 616",
            `Organisation: Demo (${SYNTHETIC_GUID})`,
          ].join("\n"),
        },
      ],
    };

    const { entries } = await throughFilter("probe", structuredClone(clean));

    expect(entries).toEqual(clean.content);
    expect(egressRedactions()).toEqual([]);
  });

  it("inspects keys other than `text`, and entries other than type text", async () => {
    // A value can hide under any key. A filter that only checked `text` on
    // text-typed entries would be a bypass documented in its own source.
    const { rendered } = await throughFilter("probe", {
      content: [
        { type: "resource", note: `TFN ${PLANTED_PII.taxFileNumber}` },
      ],
    });

    expect(rendered).not.toContain(PLANTED_PII.taxFileNumber);
    expect(egressRedactions().length).toBe(1);
  });

  it("propagates a handler error rather than swallowing it", async () => {
    // A filter that returned something on failure would be indistinguishable
    // from one that worked.
    const handler = withEgressFilter("probe", (async () => {
      throw new Error("handler exploded");
    }) as never);

    await expect(
      (handler as unknown as () => Promise<unknown>)(),
    ).rejects.toThrow(/handler exploded/);
  });

  it("passes through a result with no content array untouched", async () => {
    const odd = { isError: true } as unknown;
    const handler = withEgressFilter("probe", (async () => odd) as never);
    const out = await (handler as unknown as () => Promise<unknown>)();

    expect(out).toEqual({ isError: true });
  });
});

describe("the negative control is actually wired to the real factory", () => {
  it("a registered-shaped tool built by CreateXeroTool has PII stripped", async () => {
    // Imported through the same factory every real tool uses, so this proves
    // the filter is applied where it claims to be — not merely that the filter
    // function works when called directly.
    const { default: ViolationEgressTfnTool } = await import(
      "./fixtures/violation-egress-tfn.js"
    );

    const tool = ViolationEgressTfnTool() as unknown as {
      name: string;
      handler: (...args: never[]) => Promise<{
        content: Record<string, unknown>[];
      }>;
    };

    const result = await tool.handler(...([{}, {}] as never[]));
    const rendered = (result.content ?? [])
      .map((entry) =>
        Object.values(entry)
          .filter((v): v is string => typeof v === "string")
          .join(" "),
      )
      .join("\n");

    expect(rendered.length).toBeGreaterThan(0);
    for (const planted of PLANTED_PII_VALUES) {
      expect(rendered, `${planted} reached a caller`).not.toContain(planted);
    }
    expect(findPii(rendered)).toEqual([]);
    expect(egressRedactions().length).toBeGreaterThan(0);
  });
});

describe("guard infrastructure invariants", () => {
  it("the fake's authorised tenant matches the driver's synthesised id", async () => {
    /*
     * Not a tautology, and not cosmetic. `tool-driver` synthesises
     * SYNTHETIC_GUID for any argument whose name ends in `Id`, and the fake
     * authorises exactly that organisation. If the two drift apart, every
     * driven tool starts returning a tenant-resolution error instead of data
     * — and a tool that rendered nothing trivially renders no PII, so Guard B
     * would report green while checking nothing.
     *
     * That exact failure happened while building 002, which is why it is
     * pinned here rather than left to be rediscovered.
     */
    expect(AUTHORISED_CONNECTIONS.map((c) => c.tenantId)).toContain(
      SYNTHETIC_GUID,
    );
    expect(AUTHORISED_CONNECTIONS.length).toBe(1);
  });
});
