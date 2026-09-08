import { redactPii } from "./pii-matcher.js";
import type { PiiFinding } from "./pii-matcher.js";

/*
 * The runtime backstop for CLAUDE.md rule 2 — "No tool may return a tax file
 * number, a BSB, or a bank account number."
 *
 * ## Why a runtime filter exists at all
 *
 * Change 001 guarded rule 2 three ways, all of them at build time: no source
 * file reads a denied field, no tool serialises an unreviewed Xero-derived
 * value, and every tool driven against a fake client carrying planted PII
 * renders none of it. Those are good checks and they remain the primary
 * defence. They also share one blind spot, which 001's own spec recorded
 * rather than papered over: they cannot see a value that arrives in a *live*
 * response through a path no test exercised. Two concrete cases —
 *
 *   - a denied field reached through a computed key, which static analysis
 *     provably cannot follow
 *   - a value Xero places somewhere the fixtures never contained, including
 *     free text a person typed into a Xero field
 *
 * 001 deferred this filter deliberately, on the argument that a control with
 * no live client has no consumer. Change 002 is the change that constructs a
 * real client against a real organisation, so the objection expires here. This
 * closes HANDOFF open decision 6.
 *
 * ## Redact and warn, rather than refuse
 *
 * A match removes the value and lets the rest of the response through. The
 * alternative — failing the whole call — turns a PII sighting into an outage,
 * and would punish the occasional false positive the matcher will produce on a
 * nine-digit reference. This is a backstop behind three other checks, so the
 * proportionate response is to strip the value and make the event visible
 * (design D5).
 *
 * ## What the warning may contain
 *
 * The tool name and the field path. Never the value. Logging the thing we just
 * refused to return would defeat the point and violate rule 4 in the process,
 * which is why `redactPii` is the only code that ever sees the matched text.
 */

/** A redaction that happened, for the counter and for tests. */
export interface EgressRedaction {
  toolName: string;
  kind: PiiFinding["kind"];
  path: string;
}

const redactions: EgressRedaction[] = [];

/**
 * Every redaction this process has performed.
 *
 * Deliberately a plain in-memory list. There is no operator, no metrics
 * pipeline and no deployment yet, so a counter wired to a scrape endpoint
 * would be a knob paid for and never read. What this does buy today is
 * assertability: the negative controls check that a leak was caught, not just
 * that output looked clean. When something does consume it, it can grow.
 */
export function egressRedactions(): readonly EgressRedaction[] {
  return redactions;
}

/** Test seam. Resets the record between cases. */
export function resetEgressRedactions(): void {
  redactions.length = 0;
}

interface ContentEntry {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

interface ToolResultLike {
  content?: ContentEntry[];
  [key: string]: unknown;
}

/**
 * Scans and redacts one tool result.
 *
 * Every string in every content entry is scanned, not only `text` on entries
 * of type `text`. An entry can carry a value under any key — and a filter that
 * only inspected the obvious field would be a bypass advertised in its own
 * source.
 */
function filterResult(toolName: string, result: ToolResultLike): ToolResultLike {
  if (!result || !Array.isArray(result.content)) return result;

  const content = result.content.map((entry, position) => {
    if (!entry || typeof entry !== "object") return entry;

    let changed = false;
    const next: ContentEntry = { ...entry };

    for (const [key, value] of Object.entries(entry)) {
      if (typeof value !== "string") continue;

      const path = `content[${position}].${key}`;
      const { text, findings } = redactPii(value, path);
      if (findings.length === 0) continue;

      next[key] = text;
      changed = true;

      for (const finding of findings) {
        redactions.push({ toolName, kind: finding.kind, path: finding.path });
        // Tool name, kind and field path. Never the value (rule 4).
        console.warn(
          `[egress] ${toolName} attempted to return ${finding.kind} at ` +
            `${finding.path}; value redacted`,
        );
      }
    }

    return changed ? next : entry;
  });

  return { ...result, content };
}

/**
 * Wraps a tool handler so nothing leaves without being scanned.
 *
 * Applied in `CreateXeroTool`, which every tool in this server is constructed
 * through — so the whole surface is covered from one place, and every Payroll
 * AU tool added later inherits it without anyone remembering to. A tool that
 * bypassed that factory would also be invisible to Guard A's registry walk, so
 * the funnel is already the thing the guards assume exists (design D4).
 *
 * A throw inside the filter propagates. That is deliberate: a filter that
 * swallowed its own errors and returned the unscanned response would be
 * indistinguishable, from the outside, from a filter that worked.
 */
export function withEgressFilter<
  Handler extends (...args: never[]) => unknown,
>(toolName: string, handler: Handler): Handler {
  const wrapped = async (...args: never[]) => {
    const result = await handler(...args);
    return filterResult(toolName, result as ToolResultLike);
  };

  return wrapped as unknown as Handler;
}
