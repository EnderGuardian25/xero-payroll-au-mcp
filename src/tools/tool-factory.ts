import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ListTools } from "./list/index.js";

/**
 * Registers every tool this server exposes.
 *
 * This fork is read-only and cannot become otherwise: upstream's create,
 * update and delete tool directories were deleted in change 001, not merely
 * left unregistered, so there is nothing here to accidentally re-register.
 * Guard A asserts that over the whole registry on every CI run — by
 * capability, not by tool name, because a name records only what someone
 * typed.
 *
 * Registration must stay a pure function of nothing: no credentials, no
 * environment variables, no Xero client. The guards boot this factory
 * headless, and a factory that cannot boot without a secret yields a guard
 * that either gets skipped or passes on an empty set — indistinguishable in
 * CI from success. See spec FR5/FR6g.
 */
export function ToolFactory(server: McpServer) {
  ListTools.map((tool) => tool()).forEach((tool) =>
    server.tool(tool.name, tool.description, tool.schema, tool.handler),
  );
}
