/*
 * Guard B's source scanners, extracted from the test file.
 *
 * They live here rather than in `guard-b-no-pii.test.ts` because the permanent
 * negative controls need to call them, and importing a `.test.ts` module
 * re-executes its suites inside the importing file. A checker that other checks
 * depend on is a module, not a test.
 */
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";


/*
 * GUARD B — no tax file number, BSB or bank account number reaches a caller.
 *
 * CLAUDE.md hard rule 2: "No tool may return a tax file number, a BSB, or a
 * bank account number. Live Xero payroll payloads carry all three. Every tool
 * returns a hand-defined shape; raw Xero response objects never pass through
 * to the caller."
 *
 * ## Why this guard is field-shaped, not object-shaped
 *
 * An earlier draft of this change proposed a single assertion: no tool returns
 * a raw Xero SDK response object. The adversarial review killed it, from three
 * directions at once, and the reasoning is worth keeping because it is the
 * difference between a guard and a decoration.
 *
 * A hand-written mapper containing `taxFileNumber: emp.TaxFileNumber` is not a
 * raw SDK object. It passes an object-provenance check cleanly while emitting
 * exactly the value rule 2 forbids. Hand-defining a shape establishes where an
 * object *came from*, not which fields it *contains*. So the draft's claim that
 * this made leakage "structurally impossible" was simply false, and that phrase
 * has been removed from every artifact in this change.
 *
 * Worse, on this codebase there is nothing to interrogate. Tools return MCP
 * text content, not typed objects — a deserialised Xero response and a
 * projection are both plain objects, and by the time output leaves a tool it is
 * a string. There is no runtime discriminator to check.
 *
 * Hence two layers, and neither is redundant:
 *
 *   FR7a  static — no source file *reads* a denied Xero field
 *   FR7b  static — no tool serialises an unreviewed Xero-derived value
 *   FR7c  dynamic — every tool, driven against a client whose payloads carry a
 *         checksum-valid TFN, a BSB and an account number, renders none of them
 *   FR7d  the matcher is imported, never reimplemented
 *
 * FR7a cannot see a field read through a computed key. FR7c can, because it
 * watches what actually comes out. The same asymmetry was demonstrated for
 * Guard A during AC10 verification: a mutating call assembled as
 * "cre"+"ate"+"Invoices" defeated the static scan and the runtime check caught
 * it anyway. Static and dynamic are covering for each other on purpose.
 *
 * ## What this guard does not cover, stated rather than implied
 *
 * A PII value that Xero places in *report cell text* still reaches the caller.
 * `formatReportRows` closed the unreviewed-passthrough channel — attributes and
 * undeclared row fields — but it deliberately does not redact cell content,
 * because that value is inside the data the caller asked Xero for and deciding
 * a digit run in a financial report is a TFN rather than an invoice number is a
 * redaction judgement, not a shape judgement. That belongs to the runtime
 * egress filter deferred in design D8. See spec.md, "Amendment during build".
 *
 * ## The reason this file exists at all
 *
 * From the build brief: a 35-tool surface will eventually gain a tool nobody
 * reviewed closely, and that is precisely the one that leaks. Every assertion
 * below is quantified over the whole registry or the whole source tree, and
 * every one is paired with a non-zero count so it cannot be satisfied by an
 * empty set (spec NFR4).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const SRC = resolve(HERE, "..");
export const REPO = resolve(SRC, "..");

/*
 * Field names that must never be read out of a Xero payload.
 *
 * `taxDeclaration` is here because Xero's AU employee tax declaration is the
 * object the TFN lives on — reading the container is how you end up rendering
 * the contents. The Payday Super field
 * `IncludeLeaveLoadingInQualifyingEarnings` also lives there and will be needed
 * by a later change, so whoever adds it must map that one field explicitly
 * rather than reach for the parent.
 */
export const DENIED_FIELDS = [
  "taxFileNumber",
  "bsb",
  "accountNumber",
  "bankAccountNumber",
  "bankAccountName",
  "bankAccountDetails",
  "bankAccountParticulars",
  "taxDeclaration",
] as const;

/*
 * Directories excluded from the static scans, and why.
 *
 * `__guards__` is test code. It never runs in the served process, and it has to
 * be able to contain denied field names and planted violations — a scanner that
 * flagged its own negative controls could never be shown to work. Guard A
 * excludes it for the same reason and states the same justification.
 */
const SCAN_EXCLUDED_DIRS = new Set(["__guards__", "__tests__"]);

export function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SCAN_EXCLUDED_DIRS.has(entry)) continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (entry.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

export const SOURCE_FILES = collectSourceFiles(SRC);

/**
 * Strips comments and string literals before a field-read scan.
 *
 * Without this the guard is unusable. Tool descriptions are long prose written
 * for an LLM and they legitimately say things like "bank account" — spec.md
 * records this as an edge case precisely because a naive scan would fire on
 * every one of them and the guard would be turned off within a day. What we
 * want is *property access*, so comments and string contents are blanked while
 * preserving line count so a report can cite a real line number.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  let state: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        out += "  ";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        out += "  ";
        i += 2;
        continue;
      }
      if (c === "'") {
        state = "sq";
        out += " ";
        i += 1;
        continue;
      }
      if (c === '"') {
        state = "dq";
        out += " ";
        i += 1;
        continue;
      }
      if (c === "`") {
        state = "tpl";
        out += " ";
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += "\n";
      } else {
        out += " ";
      }
      i += 1;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        out += "  ";
        i += 2;
        continue;
      }
      out += c === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }

    // Inside a string or template literal.
    const closer = state === "sq" ? "'" : state === "dq" ? '"' : "`";
    if (c === "\\") {
      out += "  ";
      i += 2;
      continue;
    }
    if (c === closer) {
      state = "code";
      out += " ";
      i += 1;
      continue;
    }
    out += c === "\n" ? "\n" : " ";
    i += 1;
  }

  return out;
}

interface FieldRead {
  file: string;
  line: number;
  field: string;
  form: "dot" | "bracket";
}

/**
 * Finds reads of a denied field, in both access forms.
 *
 * Bracket access matters as much as dot access: a check that catches
 * `emp.taxFileNumber` but misses `emp["taxFileNumber"]` is a hole a contributor
 * finds by accident. spec.md lists both.
 *
 * A computed key — `emp[fieldName]` — cannot be caught here at all. That is a
 * known and recorded static limitation, and it is exactly what FR7c's driven
 * check is for.
 */
export function findDeniedFieldReads(
  source: string,
  file = "<inline>",
): FieldRead[] {
  const found: FieldRead[] = [];
  const code = stripCommentsAndStrings(source);
  const lines = code.split("\n");
  const raw = source.split("\n");

  // Bracket access survives comment stripping only as the quote-blanked form,
  // so it is matched against the original line with a quoted key.
  for (const field of DENIED_FIELDS) {
    const dot = new RegExp(`\\.\\s*${field}\\b`, "i");
    const bracket = new RegExp(
      `\\[\\s*(['"\`])\\s*${field}\\s*\\1\\s*\\]`,
      "i",
    );

    lines.forEach((line, idx) => {
      if (dot.test(line)) {
        found.push({ file, line: idx + 1, field, form: "dot" });
      }
    });

    raw.forEach((line, idx) => {
      if (bracket.test(line)) {
        found.push({ file, line: idx + 1, field, form: "bracket" });
      }
    });
  }

  return found;
}

/**
 * Finds serialisation of an unreviewed Xero-derived value.
 *
 * FR7b was originally worded "no whole response or `.body` serialisation".
 * Five retained report tools rendered `JSON.stringify(report.rows, null, 2)`,
 * which passes that wording on a technicality — `.rows` is a field, not the
 * body — while a probe proved all five leaked a planted TFN and BSB verbatim.
 * The requirement was wrong, not the finding, so it now reads: no *unreviewed
 * Xero-derived value* may be serialised into output. See spec.md, "Amendment
 * during build".
 */
export function findUnreviewedSerialisation(
  source: string,
  file = "<inline>",
): { file: string; line: number; snippet: string }[] {
  const found: { file: string; line: number; snippet: string }[] = [];
  const code = stripCommentsAndStrings(source);

  code.split("\n").forEach((line, idx) => {
    const m = /JSON\s*\.\s*stringify\s*\(\s*([A-Za-z0-9_.[\]]+)/.exec(line);
    if (!m) return;
    const arg = m[1];
    // A mapped, locally-declared shape is reviewed by definition. What is
    // forbidden is serialising something that came off a Xero response.
    if (/response|\.body|\.rows|report|payslip|employee|contact|invoice/i.test(arg)) {
      found.push({ file, line: idx + 1, snippet: arg });
    }
  });

  return found;
}
