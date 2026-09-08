import {
  getObjectShape,
  isSchemaOptional,
  objectFromShape,
  safeParse,
  type AnySchema,
  type ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";

import {
  setXeroClientForTesting,
  type MCPXeroClient,
} from "../clients/xero-client.js";

import {
  enumerateRegisteredTools,
  type RegisteredTool,
  type ToolCallContent,
  type ToolCallResult,
} from "./tool-registry.js";

/*
 * Drives the registered MCP tool surface against a fake Xero client.
 *
 * ## The contract, because two guards depend on it
 *
 * Guard A (spec FR6d) and Guard B (spec FR7c) both have to *invoke* every
 * registered tool — one to prove no tool reaches a mutating method, the other
 * to prove no tool renders a TFN, a BSB or a bank account number. Neither
 * question can be answered by reading source text, and both need the same
 * three awkward mechanics:
 *
 *   1. injecting a fake client through `setXeroClientForTesting()` and
 *      restoring it afterwards even when the handler explodes,
 *   2. synthesising *valid* arguments from each tool's Zod raw shape — several
 *      of the 18 retained tools have required params (`page: z.number()`,
 *      `contactId: z.string()`, YYYY-MM-DD date strings), so `{}` is not a
 *      usable stand-in,
 *   3. flattening MCP text content into one string a guard can assert over.
 *
 * Written twice, those mechanics would drift, and the two guards would end up
 * disagreeing about what "every registered tool" means. So they live here once.
 * Guard A imports `driveTool`; Guard B imports `driveAllTools`. Keep this
 * module general — it belongs to neither guard.
 *
 * ## An error render is NOT a pass
 *
 * Every one of the 18 handlers catches its own failures via `formatError` and
 * returns an error *render* — `{ content: [{ type: "text", text: "Error
 * listing accounts: ..." }] }` — rather than throwing. That matters enormously
 * to both guards, in opposite directions but for one reason: a tool that
 * errored produced no real output, so it is evidence of nothing.
 *
 *   - For Guard A, a tool that failed made no reads, so "it made no mutating
 *     call" is true of it the way it is true of a tool that does not exist.
 *   - For Guard B, a tool that failed rendered no payload, so "no TFN appears
 *     in its output" is true because there was no output.
 *
 * That is the empty-set fail-open of NFR4, arriving one tool at a time instead
 * of all at once, and it is the more dangerous shape because 17 tools still
 * pass loudly around it. So `DrivenTool.error` is populated for a thrown
 * error, for an error render, and for empty content alike, and both guards are
 * expected to assert it is `null` before drawing any conclusion from
 * `renderedText`.
 *
 * ## Injection is process-global
 *
 * `setXeroClientForTesting()` swaps a module-level singleton, so tools must be
 * driven sequentially and never from two concurrent tests. Everything below is
 * deliberately serial for that reason, not by oversight.
 */

/** Date-shaped params get this. Xero wants YYYY-MM-DD. */
export const SYNTHETIC_DATE = "2026-09-01";

/**
 * Identifier-shaped params get this.
 *
 * Chosen so it shares no digit run with `PLANTED_PII` in
 * `fake-xero-client.ts`. If a synthesised argument were echoed back into a
 * tool's output — several tools do echo their filters — and it happened to
 * contain the planted TFN, BSB or account number, Guard B would fail on an
 * input the driver invented. That failure would be indistinguishable from a
 * real leak and would be debugged for an afternoon.
 */
export const SYNTHETIC_GUID = "5eed0000-0000-4000-8000-000000000001";

/** Numeric params get this. `1` is a valid page number everywhere. */
export const SYNTHETIC_NUMBER = 1;

/** Guards against a self-referential schema turning synthesis into a hang. */
const MAX_SCHEMA_DEPTH = 8;

/**
 * Recognises the error renders the 18 handlers produce.
 *
 * A prefix match on the rendered text is a heuristic, and it is the only
 * signal available: the tools discard the `isError` flag their handlers set
 * and return plain text content. It is anchored to the *start* of the first
 * content entry so a tool legitimately rendering the word "error" further into
 * its output is not misread as having failed.
 */
const ERROR_RENDER_PATTERN = /^\s*Error\b/;

/** The result of invoking one registered tool. */
export interface DrivenTool {
  /** Registered tool name, as enumerated. */
  name: string;

  /** The arguments the driver synthesised and passed. */
  args: Record<string, unknown>;

  /** Raw handler result, or `null` when the handler threw. */
  result: ToolCallResult | null;

  /** `result.content`, or `[]` when the handler threw. */
  contents: ToolCallContent[];

  /**
   * Every content entry flattened into one string: `text` verbatim where
   * present, and the JSON of the whole entry where it is not, so a value
   * smuggled through a non-text content field is still visible to a guard.
   */
  renderedText: string;

  /**
   * Non-`null` when this tool produced no real output — it threw, it returned
   * an error render, or it returned no content at all. A guard must check this
   * before treating `renderedText` as evidence. See the module comment.
   */
  error: string | null;

  /** The thrown error, when the handler threw rather than returning a render. */
  threw: Error | null;
}

/**
 * Whether to fill optional parameters.
 *
 * This is not a style knob; it selects which *branch* of a tool runs, and
 * several of the 18 branch on exactly this. `list-contact-groups` reads
 * `getContactGroup` when `contactGroupId` is supplied and `getContactGroups`
 * when it is not; `list-manual-journals` splits the same way. Drive only the
 * filled variant and half the read paths on the surface are never touched — so
 * a guard asserting over "every registered tool" should drive both passes.
 */
export type OptionalArgPolicy = "fill" | "omit";

export interface DriveOptions {
  /**
   * Per-tool argument overrides, keyed by tool name. Merged over the
   * synthesised arguments. For the occasional tool whose required shape
   * synthesis cannot infer — not needed by any of the 18 today.
   */
  args?: Readonly<Record<string, Record<string, unknown>>>;

  /** Defaults to `"fill"`. See `OptionalArgPolicy`. */
  optional?: OptionalArgPolicy;
}

export interface DriveAllToolsOptions extends DriveOptions {
  /** The fake client to inject. Shared across every tool in the run. */
  client: MCPXeroClient;

  /**
   * Tools to drive. Defaults to the real registry. Overridable so the
   * negative-control fixtures can be driven through the same code path
   * without ever being registered into the real surface.
   */
  tools?: readonly RegisteredTool[];
}

/** Reads a Zod schema's kind in a way that works for both zod v3 and v4. */
function readDef(schema: AnySchema): {
  kind: string;
  def: Record<string, unknown>;
} {
  const v3 = (schema as { _def?: Record<string, unknown> })._def;
  if (v3 && typeof v3.typeName === "string") {
    return { kind: v3.typeName.replace(/^Zod/, "").toLowerCase(), def: v3 };
  }

  const v4 = (schema as { _zod?: { def?: Record<string, unknown> } })._zod?.def;
  if (v4 && typeof v4.type === "string") {
    return { kind: v4.type.toLowerCase(), def: v4 };
  }

  return { kind: "unknown", def: v3 ?? {} };
}

/**
 * A synthetic string, shaped by what the parameter name says it holds.
 *
 * Name-driven rather than type-driven because Zod cannot tell these apart:
 * `reportDate`, `modifiedAfter` and `searchTerm` are all `z.string()`, and two
 * of the three are rejected by Xero unless they are dates. Xero's
 * `If-Modified-Since` params are named `...After`/`...Since` rather than
 * `...Date`, hence the second alternative.
 */
function syntheticString(key: string): string {
  if (/(date|modified(after|since)|since)/i.test(key)) return SYNTHETIC_DATE;
  if (/(^|[^a-z])id(s)?$/i.test(key)) return SYNTHETIC_GUID;
  return `synthetic-${key}`;
}

function firstEnumValue(def: Record<string, unknown>): unknown {
  // zod v3: `_def.values` is an array of the members.
  if (Array.isArray(def.values) && def.values.length > 0) return def.values[0];

  // zod v4: `_zod.def.entries` is a name -> value record.
  const entries = def.entries;
  if (entries && typeof entries === "object") {
    const values = Object.values(entries as Record<string, unknown>);
    if (values.length > 0) return values[0];
  }

  throw new Error("enum schema exposes no members to choose from");
}

/**
 * Invents one value satisfying `schema`.
 *
 * Throws on a kind it does not understand rather than returning `undefined`.
 * A silent `undefined` for a required parameter would drive the tool into its
 * own error path, and an error render is exactly the non-evidence this module
 * exists to flag — so an unsupported kind has to be a loud, fixable failure
 * here instead of eighteen mysterious error renders downstream.
 */
function synthesiseValue(schema: AnySchema, key: string, depth: number): unknown {
  if (depth > MAX_SCHEMA_DEPTH) {
    throw new Error(`schema nests deeper than ${MAX_SCHEMA_DEPTH} levels`);
  }

  const { kind, def } = readDef(schema);

  switch (kind) {
    // Wrappers: synthesise the value the wrapper wraps. Optional params are
    // filled rather than omitted, deliberately — a filter or a paging param
    // left out means the branch that consumes it never runs, and an unexercised
    // branch is the one that leaks.
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "readonly":
    case "catch":
    case "nonoptional":
      return synthesiseValue(def.innerType as AnySchema, key, depth + 1);

    case "effects":
    case "transform":
    case "pipe":
      return synthesiseValue(
        (def.schema ?? def.in) as AnySchema,
        key,
        depth + 1,
      );

    case "string":
      return syntheticString(key);
    case "number":
      return SYNTHETIC_NUMBER;
    case "bigint":
      return BigInt(SYNTHETIC_NUMBER);
    case "boolean":
      return true;
    case "date":
      return new Date(`${SYNTHETIC_DATE}T00:00:00.000Z`);

    case "array":
      // v3 keeps the element schema at `_def.type`, v4 at `_zod.def.element`.
      return [
        synthesiseValue((def.type ?? def.element) as AnySchema, key, depth + 1),
      ];

    case "enum":
      return firstEnumValue(def);

    case "literal": {
      if ("value" in def) return def.value;
      if (Array.isArray(def.values) && def.values.length > 0) {
        return def.values[0];
      }
      throw new Error("literal schema exposes no value");
    }

    case "union": {
      const options = def.options;
      if (Array.isArray(options) && options.length > 0) {
        return synthesiseValue(options[0] as AnySchema, key, depth + 1);
      }
      throw new Error("union schema exposes no options");
    }

    case "object": {
      const shape = getObjectShape(schema);
      if (!shape) throw new Error("object schema exposes no shape");
      const out: Record<string, unknown> = {};
      for (const [field, fieldSchema] of Object.entries(shape)) {
        out[field] = synthesiseValue(fieldSchema, field, depth + 1);
      }
      return out;
    }

    default:
      throw new Error(
        `no synthesis rule for Zod kind "${kind}". Add one to ` +
          `src/__guards__/tool-driver.ts — do not leave the parameter unset, ` +
          `or the tool will be driven into its own error path and prove ` +
          `nothing.`,
      );
  }
}

/**
 * Invents a valid argument object for one tool's Zod raw shape.
 *
 * The synthesised object is parsed back through the same shape before it is
 * returned. That self-check is the point: without it, a synthesis bug would
 * hand every tool arguments a real MCP server would have rejected, all 18
 * tools would take their error path, and both guards would pass on eighteen
 * error renders. The check makes that failure land here, once, with the
 * offending tool named.
 *
 * An unsatisfiable *optional* parameter is dropped rather than fatal — the
 * tool still runs, just without that filter. A required one is fatal.
 */
export function synthesiseArgs(
  schema: ZodRawShapeCompat,
  toolName = "<unnamed tool>",
  optional: OptionalArgPolicy = "fill",
): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  for (const [key, fieldSchema] of Object.entries(schema ?? {})) {
    const isOptional = isSchemaOptional(fieldSchema);
    if (isOptional && optional === "omit") continue;

    try {
      args[key] = synthesiseValue(fieldSchema, key, 0);
    } catch (cause) {
      if (isOptional) continue;
      throw new Error(
        `Cannot synthesise the required parameter "${key}" of ${toolName}: ` +
          `${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  const parsed = safeParse(objectFromShape(schema ?? {}), args);
  if (!parsed.success) {
    throw new Error(
      `Synthesised arguments for ${toolName} do not satisfy its own schema, ` +
        `so driving it would only exercise its error path. Fix the synthesis ` +
        `rules in src/__guards__/tool-driver.ts. Args: ${JSON.stringify(args)}`,
    );
  }

  // The *parsed* object is returned, not the one built above, because that is
  // what a real MCP server hands the handler: `z.number().default(1)` arrives
  // as `1`, not as `undefined`. Under `optional: "omit"` that difference is
  // the whole point — omitting a defaulted param must exercise the default,
  // not a code path no caller can ever reach.
  return parsed.data as Record<string, unknown>;
}

/** Flattens MCP content into one string, hiding nothing. */
export function renderText(contents: readonly ToolCallContent[]): string {
  return contents
    .map((entry) =>
      typeof entry?.text === "string" ? entry.text : JSON.stringify(entry),
    )
    .join("\n");
}

function classifyResult(result: ToolCallResult | null): string | null {
  if (result === null || typeof result !== "object") {
    return `handler resolved to ${String(result)} rather than an MCP result`;
  }
  if (result.isError === true) return "handler returned isError: true";

  const contents = Array.isArray(result.content) ? result.content : [];
  if (contents.length === 0) return "handler returned no content";

  const first = contents[0];
  const text = typeof first?.text === "string" ? first.text : "";
  if (ERROR_RENDER_PATTERN.test(text)) return `error render: ${text}`;

  return null;
}

/**
 * Injects `client`, invokes one tool with synthesised arguments, restores the
 * previous client, and reports what came back.
 *
 * Never throws for a tool-side failure — it reports it on `DrivenTool.error`
 * so a guard can assert over the whole surface at once and name every tool
 * that failed, rather than stopping at the first. It *does* throw if arguments
 * cannot be synthesised, because that is a defect in this module.
 *
 * The restore runs in a `finally`. Without it, one tool's failure would leak a
 * fake client into every later test in the file.
 */
export async function driveTool(
  tool: RegisteredTool,
  client: MCPXeroClient,
  options: DriveOptions = {},
): Promise<DrivenTool> {
  const args = {
    ...synthesiseArgs(tool.schema, tool.name, options.optional ?? "fill"),
    ...(options.args?.[tool.name] ?? {}),
  };

  const restore = setXeroClientForTesting(client);
  let result: ToolCallResult | null = null;
  let threw: Error | null = null;

  try {
    result = await tool.handler(args, {});
  } catch (cause) {
    threw = cause instanceof Error ? cause : new Error(String(cause));
  } finally {
    restore();
  }

  const contents =
    result && Array.isArray(result.content) ? result.content : [];

  return {
    name: tool.name,
    args,
    result,
    contents,
    renderedText: renderText(contents),
    error: threw ? `handler threw: ${threw.message}` : classifyResult(result),
    threw,
  };
}

/**
 * Drives every registered tool, in registration order, against one client.
 *
 * Sequential on purpose: the injected client is a module-level singleton, so
 * two tools driven concurrently would see each other's client.
 */
export async function driveAllTools(
  options: DriveAllToolsOptions,
): Promise<DrivenTool[]> {
  const tools = options.tools ?? enumerateRegisteredTools();
  const driven: DrivenTool[] = [];

  for (const tool of tools) {
    driven.push(await driveTool(tool, options.client, options));
  }

  return driven;
}
