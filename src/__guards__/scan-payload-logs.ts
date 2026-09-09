/*
 * Guard C's scanner, extracted from the test file.
 *
 * It lives here rather than in `guard-c-no-payload-logs.test.ts` because the
 * permanent negative controls need to call it, and importing a `.test.ts`
 * module re-executes its suites inside the importing file — Guard C's tests ran
 * twice per suite before this split. A checker that other checks depend on is a
 * module, not a test.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/*
 * GUARD C — no payload logging, over the whole source tree (spec FR9 / AC12).
 *
 * CLAUDE.md hard rule 4: "Never log a payload. Log tool names, tenant
 * identifiers and durations. Not response bodies."
 *
 * WHY THIS IS A MECHANISM AND NOT A ONE-TIME SWEEP
 * ------------------------------------------------
 * Rule 4 was originally going to be discharged by reading the two inherited
 * `console` calls once and declaring them fine. The review panel rejected that,
 * and the reason is structural rather than fussy: this repo commits to ongoing
 * `git merge upstream` (CLAUDE.md conventions, spec NFR2). An upstream commit
 * that adds `logger.debug(response)` to an inherited handler would land through
 * that merge and reintroduce payload logging with nothing to catch it. A leak
 * into a log is worse than a leak into a tool response, too: it is silent, it
 * is persistent, and it sits outside the process boundary an operator can clean.
 *
 * WHY A POSITIVE ALLOWLIST RATHER THAN A DENY-LIST
 * ------------------------------------------------
 * "Never log a response body" names no syntactic target — there is nothing to
 * grep for in "a body". "Log only the tool name, the tenant id and the
 * duration" does. So the falsifiable form of the prohibition is a positive
 * allowlist of what may appear in a log call, and anything unrecognised fails.
 * That is what makes this guard catch `logger.debug(payslip)` — `payslip` is on
 * no deny-list anywhere, and it is exactly the argument that would leak a
 * superannuation payload. The deny-list below still exists, but only as a
 * second, sharper signal for the argument shapes the brief names explicitly
 * (`response`, `res`, `body`, `.body`, `result`, the Xero client) and for
 * `JSON.stringify` anywhere inside a log call.
 *
 * AN `Error` IS NOT A PAYLOAD
 * ---------------------------
 * Both inherited call sites log a caught error, and both stay. An `Error`
 * carries a message and a stack raised by our own code or by the HTTP layer; it
 * is not a Xero response object and it is not reachable from the Xero client.
 * Diagnosing a failure with no error text at all would be a real cost paid for
 * no privacy gain, so `error` / `err` / `.message` / `.stack` are allowlisted
 * deliberately. Note the limit of that: this guard permits logging the error
 * *value*, and does not attempt to prove that no HTTP error object anywhere
 * embeds a response body. The runtime egress filter (design D8) is where that
 * eventually belongs; `src/helpers/format-error.ts` is what keeps it narrow now.
 *
 * WHY `src/__guards__/` IS EXCLUDED FROM THE SCAN
 * -----------------------------------------------
 * Everything under `src/__guards__/` is test code: it never runs in the served
 * MCP process, so nothing it prints can reach an operator's log file. It also
 * has to be able to *talk about* violations — this very file contains the
 * planted `console.log(response)` fixture below — and a scanner that flagged
 * its own negative controls could never be shown to work. The exclusion is
 * therefore load-bearing, and it is narrow: one directory, all of it test code.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(HERE, "..");
const EXCLUDED_DIRS = new Set(["__guards__"]);
const SCANNED_EXTENSIONS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];

/**
 * Method names that make an object a logger, for the object-name heuristic
 * below. `console.*` is matched on the object alone, so every `console` method
 * — including ones added later — is covered without listing them.
 */
const LOG_METHODS = new Set([
  "log",
  "info",
  "warn",
  "error",
  "debug",
  "trace",
  "verbose",
  "fatal",
  "silly",
  "write",
]);

/** Bare calls that are logging by name, e.g. `debug(...)` from the `debug` package. */
const BARE_LOG_CALLEES = new Set(["log", "logger", "debug", "trace"]);

/**
 * The positive allowlist: the only words that may appear in a non-literal log
 * argument. Rule 4's three permitted subjects (tool name, tenant identifier,
 * duration) plus the error case argued above, plus the small vocabulary those
 * are spelled with in practice.
 *
 * Widening this set widens what may be logged, so it is the one thing in this
 * file to review carefully. Anything here must be a value whose *content* is
 * bounded by our own code, never a value handed to us by Xero.
 */
const PERMITTED_LOG_WORDS = new Set([
  // identity of the call
  "tool",
  "tools",
  "name",
  "names",
  "method",
  "operation",
  "action",
  // the tenant
  "tenant",
  "id",
  "org",
  "organisation",
  "short",
  "code",
  // timing
  "duration",
  "elapsed",
  "took",
  "ms",
  "millis",
  "milliseconds",
  "seconds",
  "start",
  "end",
  "time",
  // the error case
  "error",
  "err",
  "e",
  "message",
  "stack",
  // small scalars that are ours, not Xero's
  "count",
  "version",
  "status",
  "index",
  "i",
  "n",
  "arg",
  "args",
  "label",
  "prefix",
  "reason",
  /*
   * Added by change 002 for the runtime egress filter, and worth being
   * explicit about because it extends what rule 4 permits.
   *
   * Rule 4 names three loggable things — tool names, tenant identifiers,
   * durations. The filter needs a fourth: *where* it found something, so a
   * redaction is diagnosable at all. It logs the kind of match ("tfn") and the
   * field path ("content[0].text"), and never the matched value — `redactPii`
   * is the only code that ever sees that, precisely so no caller can log it.
   *
   * A field path is metadata about a response, not the response. That is the
   * distinction this addition rests on, and it is the one to re-examine if
   * anyone widens this list further.
   */
  "kind",
  "path",
  "finding",
]);

/**
 * Words that mark an argument as a payload outright. Every one of these is a
 * shape the brief names: a Xero response, its `.body`, a handler `result`, or a
 * value reachable from the Xero client. Matched on camelCase word boundaries,
 * so `tokenResponse`, `connectionsResponse` and `organisationResponse` — the
 * names upstream actually uses — are all caught.
 */
const DENIED_WORDS = new Set([
  "response",
  "responses",
  "res",
  "body",
  "bodies",
  "result",
  "results",
  "payload",
  "payloads",
  "data",
  "datum",
  "row",
  "rows",
]);

/**
 * Whole identifiers denied by name rather than by word, because their words are
 * individually innocuous. Anything reachable from the Xero client is a payload
 * source even before a call is made.
 */
const DENIED_NAMES = new Set([
  "xeroclient",
  "getxeroclient",
  "accountingapi",
  "payrollauapi",
  "payrollnzapi",
]);

export type ViolationReason =
  | "json-stringify"
  | "denied-identifier"
  | "not-allowlisted";

export interface LogCallSite {
  /** POSIX-style path relative to `src/`. */
  file: string;
  line: number;
  /** Rendered callee, e.g. `console.warn`. */
  callee: string;
  /** Rendered arguments, one entry per argument. */
  args: string[];
}

export interface LogViolation extends LogCallSite {
  reason: ViolationReason;
  /** The offending argument as written. */
  argument: string;
  /** The identifier or expression that tripped the check. */
  offender: string;
}

export interface ScanResult {
  filesScanned: string[];
  logCalls: LogCallSite[];
  violations: LogViolation[];
}

/** Split an identifier into lowercase words on camelCase and separators. */
function words(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_$\-.]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

function normaliseName(identifier: string): string {
  return identifier.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isJsonStringify(node: ts.CallExpression): boolean {
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "JSON" &&
    callee.name.text === "stringify"
  );
}

/**
 * Leftmost identifier of a property-access chain, so `this.logger.debug` and
 * `logger.debug` both report `logger` as the object being called on.
 */
function calleeObjectName(expression: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(expression)) {
    if (ts.isIdentifier(expression.expression)) return expression.expression.text;
    // `this.logger.debug(...)` — report `logger`, the nearest named object.
    // (`ts.isThisExpression` is not part of the public API; the kind check is.)
    if (expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
      return expression.name.text;
    }
    return calleeObjectName(expression.expression);
  }
  if (ts.isIdentifier(expression)) return expression.text;
  return null;
}

/** Is this call expression a logging call? */
function isLogCall(node: ts.CallExpression): boolean {
  const callee = node.expression;

  if (ts.isPropertyAccessExpression(callee)) {
    const method = callee.name.text;
    const object = calleeObjectName(callee) ?? "";

    // `console.*` — every method, including any added later.
    if (object === "console") return true;

    // `logger.debug`, `log.warn`, `this.logger.info`, `pino.error`, ...
    if (LOG_METHODS.has(method) && /log|pino|winston|bunyan|consola/i.test(object)) {
      return true;
    }
    return false;
  }

  if (ts.isIdentifier(callee)) {
    return BARE_LOG_CALLEES.has(callee.text.toLowerCase());
  }

  return false;
}

interface ArgumentFinding {
  reason: ViolationReason;
  offender: string;
}

interface SeenIdentifier {
  identifier: string;
  parts: string[];
  /**
   * True for names that only appear as the *callee* of a nested call —
   * `JSON.stringify`, `formatDuration`, `xeroClient.accountingApi.getAccounts`.
   * A helper's name is not itself a payload, so those are checked against the
   * deny-list only and never against the allowlist. The deny-list half still
   * matters: `console.log(xeroClient.accountingApi.getAccounts())` must fail on
   * `xeroClient`, and it does.
   */
  calleeOnly: boolean;
}

/**
 * Classify one log argument against the allowlist, then the deny-list.
 *
 * Returns every finding rather than the first, so a single argument that is
 * both unrecognised and explicitly denied reports the sharper reason too.
 */
function inspectArgument(argument: ts.Expression): ArgumentFinding[] {
  const findings: ArgumentFinding[] = [];
  const seen: SeenIdentifier[] = [];

  const visit = (node: ts.Node, calleeOnly: boolean): void => {
    if (ts.isCallExpression(node)) {
      if (isJsonStringify(node)) {
        // Unconditional: serialising anything into a log line is how a whole
        // response body reaches a log file, and `JSON.stringify(toolName)` is
        // never the clearer way to write it.
        findings.push({
          reason: "json-stringify",
          offender: "JSON.stringify(...)",
        });
      }
      visit(node.expression, /* calleeOnly */ true);
      for (const nested of node.arguments) visit(nested, calleeOnly);
      return;
    }

    if (ts.isPropertyAccessExpression(node)) {
      seen.push({
        identifier: node.name.text,
        parts: words(node.name.text),
        calleeOnly,
      });
    } else if (ts.isElementAccessExpression(node)) {
      const key = node.argumentExpression;
      if (key !== undefined && ts.isStringLiteralLike(key)) {
        seen.push({ identifier: key.text, parts: words(key.text), calleeOnly });
      }
    } else if (ts.isIdentifier(node)) {
      seen.push({ identifier: node.text, parts: words(node.text), calleeOnly });
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      seen.push({
        identifier: node.name.text,
        parts: words(node.name.text),
        calleeOnly,
      });
    }

    ts.forEachChild(node, (child) => visit(child, calleeOnly));
  };

  visit(argument, /* calleeOnly */ false);

  for (const { identifier, parts, calleeOnly } of seen) {
    const normalised = normaliseName(identifier);

    if (DENIED_NAMES.has(normalised) || parts.some((part) => DENIED_WORDS.has(part))) {
      findings.push({ reason: "denied-identifier", offender: identifier });
      continue;
    }

    if (calleeOnly) continue;

    if (!parts.every((part) => PERMITTED_LOG_WORDS.has(part))) {
      findings.push({ reason: "not-allowlisted", offender: identifier });
    }
  }

  return findings;
}

/** Scan one source text. `file` is only used for reporting. */
export function scanSource(file: string, text: string): Omit<ScanResult, "filesScanned"> {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  const logCalls: LogCallSite[] = [];
  const violations: LogViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isLogCall(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      const site: LogCallSite = {
        file,
        line: line + 1,
        callee: node.expression.getText(source),
        args: node.arguments.map((argument) => argument.getText(source)),
      };
      logCalls.push(site);

      for (const argument of node.arguments) {
        // A bare string or template literal is a message, not a payload — but
        // its interpolations are still arguments, and `inspectArgument`
        // recurses into them.
        for (const finding of inspectArgument(argument)) {
          violations.push({
            ...site,
            argument: argument.getText(source),
            reason: finding.reason,
            offender: finding.offender,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return { logCalls, violations };
}

function collectSourceFiles(directory: string, out: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectSourceFiles(full, out);
    } else if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      out.push(full);
    }
  }
}

/** Scan every source file under `src/`, excluding `src/__guards__/`. */
export function scanSourceTree(): ScanResult {
  const absolute: string[] = [];
  collectSourceFiles(SRC_ROOT, absolute);

  const filesScanned: string[] = [];
  const logCalls: LogCallSite[] = [];
  const violations: LogViolation[] = [];

  for (const path of absolute) {
    const file = relative(SRC_ROOT, path).split("\\").join("/");
    filesScanned.push(file);
    const result = scanSource(file, readFileSync(path, "utf-8"));
    logCalls.push(...result.logCalls);
    violations.push(...result.violations);
  }

  return { filesScanned, logCalls, violations };
}

/*
 * The known-clean baseline.
 *
 * Asserting the exact call sites — not merely "no violations" — is what makes a
 * *new* log call a deliberate, visible change. Without the count, an upstream
 * merge could add twenty compliant-looking log calls and this guard would stay
 * green while nobody ever looked at them; with it, the merge fails and someone
 * has to read them and update this list. That is the intended cost.
 */
export const KNOWN_LOG_CALLS = [
  {
    file: "helpers/get-package-version.ts",
    callee: "console.warn",
    args: ["'Failed to read package version:'", "error"],
  },
  {
    file: "index.ts",
    callee: "console.error",
    args: ['"Error:"', "error"],
  },
  {
    /*
     * Added by change 002, and the first log site in this repo that is not an
     * error report.
     *
     * The runtime egress filter warns when it strips a TFN, BSB or bank
     * account number from a response. It logs the tool name, the kind of match
     * and the field path — and never the matched value, which only
     * `redactPii` ever sees. A redaction that produced no record would be
     * indistinguishable from no redaction, which defeats the point of having a
     * backstop.
     *
     * Registered here on purpose rather than allowed through by a looser rule.
     * This inventory is what makes a new log call a decision: CI goes red, and
     * somebody has to read the call and add it. That is the mechanism, so
     * adding an entry has to come with the reason, as this one does.
     */
    file: "security/egress-filter.ts",
    callee: "console.warn",
    args: [
      "`[egress] ${toolName} attempted to return ${finding.kind} at ` +\n" +
        "            `${finding.path}; value redacted`",
    ],
  },
];

/*
 * Negative controls. Planted violations, parsed through exactly the checker the
 * real scan uses. A guard never shown to fail is a guard nobody knows works.
 *
 * `logger.debug(response)` is the concrete upstream-merge scenario from the
 * module comment; `payslip` is the allowlist case a deny-list would miss.
 */
export const PLANTED_VIOLATIONS: Array<{
  label: string;
  source: string;
  expected: ViolationReason[];
}> = [
  {
    label: "console.log of a bare response",
    source: "const response = await getAccounts();\nconsole.log(response);\n",
    expected: ["denied-identifier"],
  },
  {
    label: "console.log of a stringified response body",
    source: "console.log(JSON.stringify(res.body));\n",
    expected: ["json-stringify", "denied-identifier"],
  },
  {
    label: "logger.debug of a response — the upstream-merge scenario",
    source: "logger.debug(response);\n",
    expected: ["denied-identifier"],
  },
  {
    label: "console.error of a response body with a message prefix",
    source: 'console.error("failed:", response.body);\n',
    expected: ["denied-identifier"],
  },
  {
    label: "console.info of a spread response",
    source: "console.info({ ...response });\n",
    expected: ["denied-identifier"],
  },
  {
    label: "console.log of a value reachable from the Xero client",
    source: "console.log(xeroClient.tenants);\n",
    expected: ["denied-identifier", "not-allowlisted"],
  },
  {
    label: "console.log of a payload no deny-list would name",
    source: "console.log(payslip);\n",
    expected: ["not-allowlisted"],
  },
  {
    label: "template interpolation of a response body",
    source: "console.warn(`got ${response.body}`);\n",
    expected: ["denied-identifier"],
  },
  {
    // `tenant` on its own is allowlisted, so this fixture fails *only* if the
    // bracket key was actually read — which is what it exists to prove.
    label: "bracket-notation access into a response body",
    source: 'console.log(tenant["body"]);\n',
    expected: ["denied-identifier"],
  },
  {
    label: "a payload reached through the Xero client's API member",
    source: "console.log(await xeroClient.accountingApi.getAccounts());\n",
    expected: ["denied-identifier"],
  },
  {
    label: "stringify of an allowlisted value is still a violation",
    source: "console.log(JSON.stringify(tenantId));\n",
    expected: ["json-stringify"],
  },
];

/** Compliant shapes, to prove the checker is not simply failing everything. */
export const COMPLIANT_SOURCES: Array<{ label: string; source: string }> = [
  {
    label: "rule 4's own example: tool name, tenant id, duration",
    source: 'console.log("tool call", toolName, tenantId, durationMs);\n',
  },
  {
    label: "a caught error — an Error is not a payload",
    source: 'console.error("Error:", error);\n',
  },
  {
    label: "an error message field",
    source: "console.warn(err.message);\n",
  },
  {
    label: "a structured line of allowlisted fields",
    source: "logger.info({ tool: name, tenantId, durationMs: elapsed });\n",
  },
  {
    label: "a message with no arguments at all",
    source: 'console.error("Failed to read package version:");\n',
  },
  {
    label: "a non-log call that happens to take a response",
    source: "formatError(response.body);\n",
  },
];
