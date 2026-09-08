import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  createFakeXeroClient,
  MUTATING_METHOD_PATTERN,
} from "./fake-xero-client.js";
import { TOOL_ALLOWLIST, TOOL_ALLOWLIST_NAMES } from "./tool-allowlist.js";
import { driveTool } from "./tool-driver.js";
import { enumerateRegisteredTools } from "./tool-registry.js";

/*
 * GUARD A — the registered tool surface is read-only, by capability.
 *
 * CLAUDE.md hard rule 1: "Every tool is read-only. No writes, in any version."
 * Hard rule 3: "Both guards run over the entire registered surface, not per
 * tool. A guard you have to remember to apply is not a guard."
 *
 * ## Why this is a guard and not a review checklist
 *
 * From the build brief, and it is the whole reason this file exists rather
 * than a note in a contributing guide: a 35-tool surface will eventually gain
 * a tool nobody reviewed closely, and that is precisely the one that leaks.
 * Every assertion below is therefore quantified over the *whole* registry or
 * the *whole* source tree. None of them is something a contributor has to
 * remember to run, opt into, or apply to their own new tool.
 *
 * ## What Guard A proves, and what it does not
 *
 * `TOOL_ALLOWLIST` is a NEW-REGISTRATION TRIPWIRE, NOT evidence of read-only.
 * An entry there records only that somebody typed a string; an allowlisted
 * `list-invoices` whose handler is later edited to issue a POST would stay
 * green under a name check forever, and the string being checked is authored
 * by exactly the contributor the guard exists to stop. Clause (e) is worth
 * having — it forces a deliberate edit rather than a silent addition, in both
 * directions — but it is not proof of anything about behaviour.
 *
 * The *capability* clauses are the evidence: (b) no mutating Xero API member
 * is referenced anywhere in real source, (c) no module outside the client
 * binds a capable xero-node symbol, and (d) every registered tool, actually
 * invoked, reaches only reads. See design.md decision D1.
 *
 * ## NFR4 — no clause may be satisfied by an empty set
 *
 * "No file references a mutating API member" is trivially true when zero files
 * were read. "Every registered tool made no mutating call" is trivially true
 * of zero tools. That is the fail-open case that looks exactly like success in
 * CI output, so every universally quantified assertion below is paired with a
 * non-zero count assertion over the same set — and the count is asserted on
 * the set the universal claim actually ranged over, not on some other set that
 * happens to be non-empty.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const REPO_ROOT = resolve(SRC, "..");

/**
 * Spec FR4: the retained surface is exactly 18 accounting read tools. Asserted
 * as a literal so a tool arriving *and* being allowlisted in the same commit
 * still has to touch this line.
 */
const EXPECTED_TOOL_COUNT = 18;

/*
 * `src/__guards__/` is excluded from the source scans below, and the reason is
 * not convenience.
 *
 * This very file has to contain the strings it hunts for: clause (b) proves
 * its own detector fires by running it against a synthetic
 * `accountingApi.createInvoice(...)`, and clause (c) does the same with a
 * synthetic `XeroClient` import. `fake-xero-client.ts` carries the mutating
 * verb pattern itself, and the negative-control fixtures added in T12 exist
 * precisely to be violations. Scanning the guards would make every one of
 * those a self-inflicted failure, and the fix a contributor would reach for is
 * to weaken the detector.
 *
 * The exclusion is safe because nothing under `src/__guards__/` is registered,
 * shipped, or reachable from `src/index.ts` — it is test-only code. What the
 * exclusion costs is that a mutating call hidden in a guard file would not be
 * caught by clause (b); what makes that acceptable is clause (d), which drives
 * the real registry, and the fact that a guard file cannot register a tool
 * without clause (e) failing.
 */
const EXCLUDED_DIRS = new Set(["__guards__"]);

/** Every `.ts` file under `src/`, minus the guards. */
function scannedSourceFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (EXCLUDED_DIRS.has(entry)) continue;
        walk(full);
        continue;
      }
      if (entry.endsWith(".ts")) found.push(full);
    }
  };

  walk(SRC);
  return found;
}

function relativeToRepo(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join("/");
}

/**
 * A mutating member access on any `*Api` object.
 *
 * The verb alternation is lifted from `MUTATING_METHOD_PATTERN` in
 * `fake-xero-client.ts` rather than restated, so the static check in clause
 * (b) and the dynamic check in clause (d) cannot drift into disagreeing about
 * what "mutating" means — which is exactly the crack a write would slip
 * through.
 *
 * Bracket access is matched as well as dot access: a check that catches
 * `accountingApi.createInvoice` but not `accountingApi["createInvoice"]` is a
 * hole, and the same hole the spec's Edge Cases call out for Guard B.
 *
 * Returns a fresh regex per call. A `g`-flagged regex carries `lastIndex`
 * between `.test()` calls, and a stateful detector silently skipping every
 * second match is worse than no detector.
 */
function mutatingApiMemberRegex(): RegExp {
  const verbs = MUTATING_METHOD_PATTERN.source.replace(/^\^/, "");
  return new RegExp(
    String.raw`\b\w*Api\s*(?:\.\s*|\[\s*["'\`]\s*)` + verbs,
    "gi",
  );
}

/** Symbols from `xero-node` that confer the ability to talk to Xero. */
const SDK_CAPABILITY_SYMBOL = /^(?:I?XeroClient\w*|\w*Api|TokenSet)$/;

interface SdkImport {
  file: string;
  /** Named bindings, as imported (the left side of `X as Y`). */
  named: string[];
  /** Import forms that grant access to the whole module, not one symbol. */
  wholeModuleForms: string[];
}

function parseImportClause(clause: string): {
  named: string[];
  namespace: boolean;
  defaultImport: boolean;
} {
  let rest = clause.trim().replace(/^type\s+/, "");
  const named: string[] = [];

  const braces = rest.match(/\{([\s\S]*)\}/);
  if (braces) {
    for (const part of braces[1].split(",")) {
      const token = part.trim().replace(/^type\s+/, "");
      if (!token) continue;
      named.push(token.split(/\s+as\s+/)[0].trim());
    }
    rest = rest
      .replace(/\{[\s\S]*\}/, "")
      .replace(/,\s*$/, "")
      .trim();
  }

  return {
    named,
    namespace: /^\*\s+as\s+/.test(rest),
    defaultImport: rest.length > 0 && !/^\*\s+as\s+/.test(rest),
  };
}

/** Every way a scanned file reaches into `xero-node`. */
function sdkImports(files: readonly string[]): SdkImport[] {
  const results: SdkImport[] = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const named: string[] = [];
    const wholeModuleForms: string[] = [];

    for (const match of text.matchAll(
      /import\s+([\s\S]*?)\s+from\s+["']xero-node["']/g,
    )) {
      const parsed = parseImportClause(match[1]);
      named.push(...parsed.named);
      if (parsed.namespace) wholeModuleForms.push("namespace import");
      if (parsed.defaultImport) wholeModuleForms.push("default import");
    }

    // Forms that bypass the named-binding analysis entirely.
    if (/import\s+["']xero-node["']/.test(text)) {
      wholeModuleForms.push("side-effect import");
    }
    if (/import\s*\(\s*["']xero-node["']/.test(text)) {
      wholeModuleForms.push("dynamic import");
    }
    if (/require\s*\(\s*["']xero-node["']/.test(text)) {
      wholeModuleForms.push("require");
    }

    if (named.length > 0 || wholeModuleForms.length > 0) {
      results.push({ file: relativeToRepo(file), named, wholeModuleForms });
    }
  }

  return results;
}

const CLIENT_MODULE = "src/clients/xero-client.ts";

describe("Guard A — the registered surface is read-only", () => {
  it("FR6a — the create, update and delete tool directories do not exist", () => {
    const writeDirs = ["create", "update", "delete"];

    // NFR4 pairing. Three `existsSync === false` assertions are also satisfied
    // by a wrong `SRC`, a moved tree, or a typo in the join — all of which
    // would make this clause green while checking nothing at all. Proving the
    // sibling directory that *should* exist does exist is what makes the three
    // absences meaningful.
    expect(existsSync(join(SRC, "tools", "list"))).toBe(true);
    expect(existsSync(join(SRC, "tools", "tool-factory.ts"))).toBe(true);

    const present = writeDirs.filter((dir) =>
      existsSync(join(SRC, "tools", dir)),
    );
    expect(
      present,
      `Write tool directories were deleted in change 001, not merely ` +
        `unregistered (spec FR2/AC2). These are back: ${present.join(", ")}`,
    ).toEqual([]);

    // Their handlers went with them. Upstream's write handlers were all named
    // for their verb, so an absence check on the naming convention costs
    // nothing and catches a partial resurrection.
    const handlers = readdirSync(join(SRC, "handlers"));
    expect(handlers.length).toBeGreaterThan(0);
    expect(
      handlers.filter((f) => /^(create|update|delete)-/.test(f)),
    ).toEqual([]);
  });

  it("FR6b — no source file references a mutating Xero API member", () => {
    // The detector must be proven live before its silence is read as
    // evidence. If the regex were broken, the scan below would find nothing
    // and this clause would pass on a surface full of writes.
    const probe = mutatingApiMemberRegex();
    expect(probe.test('accountingApi.createInvoices(tenantId, payload)')).toBe(
      true,
    );
    expect(mutatingApiMemberRegex().test('payrollAUApi["updateEmployee"](x)')).toBe(
      true,
    );
    expect(mutatingApiMemberRegex().test("accountingApi.getInvoices(x)")).toBe(
      false,
    );

    const files = scannedSourceFiles();

    // NFR4 pairing: the universal claim ranges over `files`, so `files` is
    // what has to be non-empty.
    expect(
      files.length,
      `Scanned no source files under ${SRC}. "No file references a mutating ` +
        `API member" is trivially true of nothing.`,
    ).toBeGreaterThanOrEqual(EXPECTED_TOOL_COUNT);

    const offenders: string[] = [];
    for (const file of files) {
      const matches = readFileSync(file, "utf8").match(
        mutatingApiMemberRegex(),
      );
      if (matches) {
        offenders.push(`${relativeToRepo(file)}: ${matches.join(", ")}`);
      }
    }

    expect(
      offenders,
      `A mutating Xero API member is referenced in source. Every tool in ` +
        `this server is read-only (CLAUDE.md rule 1, spec FR6b):\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  /*
   * FR6c, stated precisely, because the loose reading is not achievable and
   * pretending otherwise would produce a guard that gets deleted.
   *
   * All 18 retained handlers import a *model type* from xero-node —
   * `import { Contact } from "xero-node"`, `ReportWithRow`, `Invoice`. Those
   * bindings confer no ability to reach Xero: to make a call you need a
   * client, and the only way to get one is `src/clients/xero-client.ts`. A
   * check that banned the literal string `from "xero-node"` in handlers would
   * fail on all 18 on day one and would be relaxed by lunchtime.
   *
   * So the enforceable form is a capability check: outside the client module,
   * no file may bind a xero-node symbol that can construct or authenticate a
   * client — `XeroClient`, any `*Api` class, `TokenSet` — and no file may take
   * the whole module (namespace, default, side-effect, dynamic import, or
   * require), because that reaches every capable symbol at once while naming
   * none of them.
   */
  it("FR6c — no module outside the client binds a capable xero-node symbol", () => {
    const imports = sdkImports(scannedSourceFiles());

    // NFR4 pairing, and a live check of the capability pattern in one. If the
    // import parser were broken, `imports` would be empty and this clause
    // would pass; if `SDK_CAPABILITY_SYMBOL` were broken, it would pass with
    // the parser working. Requiring that the real client module be found *and*
    // be recognised as capable falsifies both at once.
    const client = imports.find((i) => i.file === CLIENT_MODULE);
    expect(
      client,
      `${CLIENT_MODULE} does not appear to import xero-node. Either the ` +
        `import parser in this guard is broken or the client moved — in ` +
        `either case this clause is checking nothing.`,
    ).toBeDefined();
    expect(client?.named.some((s) => SDK_CAPABILITY_SYMBOL.test(s))).toBe(true);
    expect(imports.length).toBeGreaterThan(EXPECTED_TOOL_COUNT);

    const offenders: string[] = [];
    for (const entry of imports) {
      if (entry.file === CLIENT_MODULE) continue;

      const capable = entry.named.filter((s) => SDK_CAPABILITY_SYMBOL.test(s));
      if (capable.length > 0) {
        offenders.push(`${entry.file}: binds ${capable.join(", ")}`);
      }
      if (entry.wholeModuleForms.length > 0) {
        offenders.push(
          `${entry.file}: ${entry.wholeModuleForms.join(", ")} of xero-node`,
        );
      }
    }

    expect(
      offenders,
      `All Xero access must go through ${CLIENT_MODULE}, which is the one ` +
        `module the guards can replace with a read-only fake (spec FR6c). ` +
        `These reach the SDK directly:\n` + offenders.join("\n"),
    ).toEqual([]);
  });

  it("FR6d — every registered tool, driven, reaches only reads", async () => {
    const tools = enumerateRegisteredTools();

    // NFR4 pairing for the loop below.
    expect(tools.length).toBe(EXPECTED_TOOL_COUNT);

    const mutating: string[] = [];
    const unstubbed: string[] = [];
    const failed: string[] = [];
    const readless: string[] = [];
    let passes = 0;

    // Two passes over every tool, because several branch on whether an
    // optional filter was supplied and a single pass leaves the other branch
    // untouched: `list-contact-groups` reads `getContactGroup` with an id and
    // `getContactGroups` without one, and `list-manual-journals` splits the
    // same way. A write hiding in the branch nobody drove is exactly the tool
    // nobody reviewed closely.
    //
    // A fresh fake per tool per pass, so every finding is attributable to one
    // tool by name. One shared fake would prove the surface as a whole made no
    // mutating call and no more — and would let a tool that made no calls at
    // all hide behind seventeen that did.
    for (const optional of ["fill", "omit"] as const) {
      for (const tool of tools) {
        const fake = createFakeXeroClient();
        const driven = await driveTool(tool, fake.client, { optional });
        passes += 1;

        const where = `${tool.name} (optional: ${optional})`;

        if (fake.mutatingCalls.length > 0) {
          mutating.push(`${where} -> ${fake.mutatingCalls.join(", ")}`);
        }
        if (fake.unstubbedCalls.length > 0) {
          unstubbed.push(`${where} -> ${fake.unstubbedCalls.join(", ")}`);
        }
        if (driven.error) {
          failed.push(`${where}: ${driven.error}`);
        }
        if (fake.readCalls.length === 0) {
          readless.push(where);
        }
      }
    }

    // NFR4, again, one level down: the loop above has to have run.
    expect(passes).toBe(EXPECTED_TOOL_COUNT * 2);

    expect(
      mutating,
      `A registered tool called a mutating Xero method. This is the ` +
        `capability evidence behind CLAUDE.md rule 1 — a tool name proves ` +
        `nothing, this does:\n` + mutating.join("\n"),
    ).toEqual([]);

    // The per-tool NFR4 pairing, and the reason this clause is not satisfied
    // by a surface that does nothing. "Made no mutating call" is true of a
    // tool whose handler is `return {}`. Requiring at least one read per tool
    // means each tool had to actually reach the client to clear the bar.
    expect(
      readless,
      `These tools completed without reading anything from the fake client, ` +
        `so "they made no mutating call" is evidence of nothing about them ` +
        `(spec NFR4): ${readless.join(", ")}`,
    ).toEqual([]);

    // An error render is not a pass either: a tool that failed produced no
    // output and reached no conclusion. Separated from `unstubbed` because the
    // two have different fixes — a gap in the fake versus a broken tool.
    expect(
      failed,
      `These tools did not complete against the read-only fake, so they ` +
        `prove nothing about read-only behaviour:\n` + failed.join("\n"),
    ).toEqual([]);
    expect(
      unstubbed,
      `These tools reached a method the fake does not stub. That is a gap in ` +
        `src/__guards__/fake-xero-client.ts, not a read-only violation — but ` +
        `it means the tool was not really driven:\n` + unstubbed.join("\n"),
    ).toEqual([]);
  });

  it("FR6e — the registry and TOOL_ALLOWLIST match exactly, both ways", () => {
    const registryNames = enumerateRegisteredTools().map((t) => t.name);
    const allowlistNames = [...TOOL_ALLOWLIST_NAMES];

    expect(registryNames.length).toBe(EXPECTED_TOOL_COUNT);
    expect(allowlistNames.length).toBe(EXPECTED_TOOL_COUNT);

    // A duplicate registration has to read as a mismatch, not be laundered
    // into a match (spec Edge Cases). `tool-registry.ts` deliberately
    // preserves duplicates; a `Set` comparison here would throw that away, so
    // duplication is asserted against on both sides first, and the comparison
    // is then made on sorted arrays — which differ in length when either side
    // repeats itself.
    const duplicates = (names: readonly string[]): string[] =>
      names.filter((n, i) => names.indexOf(n) !== i);

    expect(
      duplicates(registryNames),
      `A tool is registered more than once: ` +
        `${duplicates(registryNames).join(", ")}`,
    ).toEqual([]);
    expect(
      duplicates(allowlistNames),
      `TOOL_ALLOWLIST lists a tool more than once: ` +
        `${duplicates(allowlistNames).join(", ")}`,
    ).toEqual([]);

    // Both directions, named separately, because the two failures mean
    // different things (spec AC11). Registered-but-unlisted is a tool that
    // arrived without anyone deciding it should exist. Listed-but-unregistered
    // is an approval outliving the thing it approved.
    const unlisted = registryNames.filter((n) => !allowlistNames.includes(n));
    const stale = allowlistNames.filter((n) => !registryNames.includes(n));

    expect(
      unlisted,
      `Registered but absent from TOOL_ALLOWLIST: ${unlisted.join(", ")}. ` +
        `The question to answer is whether the tool should exist at all — ` +
        `not how to make the build green (design D1).`,
    ).toEqual([]);
    expect(
      stale,
      `In TOOL_ALLOWLIST but not registered: ${stale.join(", ")}. A stale ` +
        `approval must not outlive the tool it approved.`,
    ).toEqual([]);

    expect([...registryNames].sort()).toEqual([...allowlistNames].sort());

    // The recorded handler path must resolve, so a rename is a visible edit
    // rather than a silent pass.
    const missingHandlers = TOOL_ALLOWLIST.filter(
      (t) => !existsSync(resolve(REPO_ROOT, t.handler)),
    ).map((t) => `${t.name} -> ${t.handler}`);

    expect(TOOL_ALLOWLIST.length).toBeGreaterThan(0);
    expect(
      missingHandlers,
      `TOOL_ALLOWLIST records a handler path that does not exist:\n` +
        missingHandlers.join("\n"),
    ).toEqual([]);
  });

  it("FR6f — TOOL_ALLOWLIST is non-empty", () => {
    // The clause that stops every other clause from being vacuous. An empty
    // allowlist would make FR6e's bidirectional match pass against an empty
    // registry, which is what a boot that silently failed looks like.
    expect(TOOL_ALLOWLIST.length).toBeGreaterThan(0);
    expect(TOOL_ALLOWLIST.length).toBe(EXPECTED_TOOL_COUNT);
    expect(TOOL_ALLOWLIST.every((t) => t.name.length > 0)).toBe(true);
    expect(TOOL_ALLOWLIST.every((t) => t.handler.length > 0)).toBe(true);
  });

  /*
   * FR6g runs last on purpose. It uses `vi.resetModules()` and a module mock,
   * which replaces the module graph for anything imported dynamically
   * afterwards; keeping it at the end means no other clause can be handed a
   * mocked registry.
   */
  it("FR6g — a registry boot failure fails the guard, and an empty boot cannot pass", async () => {
    // Simulated boot failure. `enumerateRegisteredTools()` has no try/catch by
    // design; this proves that design is intact, because a caught boot error
    // would return `[]` and every universally quantified clause above would
    // pass on zero tools — loudly, greenly, and indistinguishably from a clean
    // 18-tool surface.
    vi.resetModules();
    vi.doMock("../tools/tool-factory.js", () => ({
      ToolFactory: () => {
        throw new Error("simulated registry boot failure");
      },
    }));

    const throwing = await import("./tool-registry.js");
    expect(() => throwing.enumerateRegisteredTools()).toThrow(
      /simulated registry boot failure/,
    );

    // The other half of the same hole: a boot that throws nothing but
    // registers nothing. Enumeration is honest about that — it returns `[]` —
    // so what has to hold is that the count assertion the clauses above rely
    // on actually rejects it.
    vi.resetModules();
    vi.doMock("../tools/tool-factory.js", () => ({
      ToolFactory: () => {
        /* registers nothing */
      },
    }));

    const empty = await import("./tool-registry.js");
    const enumerated = empty.enumerateRegisteredTools();
    expect(enumerated).toEqual([]);
    expect(enumerated.length).not.toBe(EXPECTED_TOOL_COUNT);

    vi.doUnmock("../tools/tool-factory.js");
    vi.resetModules();
  });
});
