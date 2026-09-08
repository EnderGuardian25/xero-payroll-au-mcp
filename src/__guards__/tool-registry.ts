import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";

import { ToolFactory } from "../tools/tool-factory.js";

/*
 * Headless enumeration of the registered MCP tool surface.
 *
 * WHY THIS IS ITS OWN MODULE, AND WHY IT HAS NO try/catch
 * ------------------------------------------------------
 * Both guards assert universally quantified properties over the registered
 * surface: *every* tool is read-only, *no* tool renders a TFN. Every one of
 * those assertions is trivially true of the empty set. So a boot failure that
 * got swallowed into `[]` would make both guards pass — loudly, greenly, on
 * zero tools — and in CI output that is indistinguishable from a clean
 * 18-tool surface. That is the fail-open case that looks exactly like success
 * (spec FR6g, and the "Registry boot throws" edge case).
 *
 * The defence is the deliberate *absence* of error handling below. Nothing
 * here catches, nothing here defaults, nothing here degrades. An import error,
 * a missing credential, a throwing tool constructor — all of it propagates out
 * of `enumerateRegisteredTools()` and fails the calling guard with a real
 * stack trace. Do not add a try/catch to "make the guard more robust": that
 * would invert the whole point of the module. The non-empty count assertion
 * lives in Guard A (FR6f) as a second, independent line of defence.
 *
 * It is a separate module rather than a helper inlined into each guard so that
 * reasoning has one place to live and one place to be reviewed, rather than
 * being re-derived — and possibly re-derived wrongly — in Guard A, Guard B and
 * Guard C.
 *
 * Enumeration is also deliberately faithful rather than tidy: registration
 * order is preserved and duplicates are NOT collapsed. FR6e compares the
 * registry against the checked-in tool list in both directions, and a tool
 * registered twice has to read as a mismatch. A `Set` or a `.sort()` here
 * would silently launder exactly the defect that check exists to catch.
 *
 * Booting this requires no credentials. `src/clients/xero-client.ts` was
 * refactored in T5 so that importing it constructs nothing and throws nothing;
 * the missing-credential error now surfaces on first client *use*. That is what
 * makes credential-free CI (spec FR5 / AC5) possible.
 */

/** One entry of MCP tool output. Loose by design — `type` may not be "text". */
export interface ToolCallContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/** What an MCP tool handler resolves to. */
export interface ToolCallResult {
  content: ToolCallContent[];
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * A registered handler, typed so a guard can actually invoke it.
 *
 * The SDK's `ToolCallback<Args>` signature is parameterised by each tool's own
 * Zod shape, which makes it useless for driving 18 differently shaped tools in
 * one loop. Every tool in this repo is registered through the 4-argument
 * `server.tool(name, description, schema, handler)` overload, so every handler
 * is uniformly `(args, extra)` — even the ones whose schema is `{}` and whose
 * body ignores both.
 */
export type RegisteredToolHandler = (
  args: Record<string, unknown>,
  extra: Record<string, unknown>,
) => Promise<ToolCallResult>;

export interface RegisteredTool {
  name: string;
  description: string;
  schema: ZodRawShapeCompat;
  handler: RegisteredToolHandler;
}

/**
 * Stand-in for `McpServer` that records registrations instead of serving them.
 *
 * `ToolFactory` calls only `.tool(...)`, so that is the entire surface needed.
 * `scripts/tool-inventory.mjs` does the same thing against `dist/` for the
 * human-readable inventory; this is the typed, in-process version the guards
 * use, and it keeps the handler reference so the surface can be *driven*, not
 * merely counted.
 */
class RecordingServer {
  readonly registered: RegisteredTool[] = [];

  tool(
    name: string,
    description: string,
    schema: ZodRawShapeCompat,
    handler: unknown,
  ): void {
    this.registered.push({
      name,
      description,
      schema,
      handler: handler as RegisteredToolHandler,
    });
  }
}

/**
 * Boots `ToolFactory` and returns every tool it registered, in registration
 * order, duplicates included.
 *
 * Throws if registration throws. That is the contract — see the module comment.
 */
export function enumerateRegisteredTools(): RegisteredTool[] {
  const server = new RecordingServer();

  ToolFactory(server as unknown as McpServer);

  return server.registered;
}
