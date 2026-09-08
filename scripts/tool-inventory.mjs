#!/usr/bin/env node
/**
 * Prints the MCP tool names this server actually registers, read from the
 * registry rather than from a hand-kept list.
 *
 * Why this exists: change 001 has to prove which tools were removed, and a
 * count narrated in a commit message is not evidence. `ToolFactory` is booted
 * against a stub server that records every `server.tool(...)` call, so the
 * output is the real registered surface.
 *
 * Usage:
 *   node scripts/tool-inventory.mjs          # one name per line, sorted
 *   node scripts/tool-inventory.mjs --count  # just the count
 *
 * Requires `npm run build` first — it reads dist/, not src/.
 */

const args = process.argv.slice(2);
const countOnly = args.includes("--count");

/**
 * Minimal stand-in for McpServer. ToolFactory only calls `.tool(...)`, so
 * that is all this needs to implement.
 */
class RecordingServer {
  constructor() {
    this.names = [];
  }
  tool(name) {
    this.names.push(name);
  }
}

const { ToolFactory } = await import("../dist/tools/tool-factory.js");

const server = new RecordingServer();
ToolFactory(server);

const names = [...server.names].sort();

if (countOnly) {
  console.log(String(names.length));
} else {
  for (const name of names) console.log(name);
  console.log(`\n${names.length} tools registered`);
}
