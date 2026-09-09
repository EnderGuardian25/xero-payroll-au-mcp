import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";

import { withEgressFilter } from "../security/egress-filter.js";

/*
 * Every tool in this server is constructed here, which makes this the one
 * place a response can be inspected on its way out.
 *
 * That is why the egress filter is applied at this seam rather than in each
 * tool: the whole surface is covered from a single file, and a Payroll AU tool
 * added in a later change inherits the protection without anyone having to
 * remember it. A guard you have to remember to apply is not a guard
 * (CLAUDE.md rule 3).
 *
 * A tool that bypassed this factory would also be invisible to Guard A's
 * registry walk, so this funnel is already the structure the guards assume
 * exists — the filter is not adding a new assumption, it is using one that was
 * already load-bearing (design D4).
 */
export const CreateXeroTool =
  <Args extends ZodRawShapeCompat>(
    name: string,
    description: string,
    schema: Args,
    handler: ToolCallback<Args>,
  ): (() => ToolDefinition<ZodRawShapeCompat>) =>
  () => ({
    name: name,
    description: description,
    schema: schema,
    handler: withEgressFilter(name, handler),
  });
