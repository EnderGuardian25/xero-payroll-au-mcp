import { z } from "zod";

import { resolveTenant } from "../clients/resolve-tenant.js";
import { formatError } from "./format-error.js";

/**
 * The `tenantId` parameter, defined once and shared by every tool.
 *
 * Shared deliberately. Eighteen hand-copied descriptions would drift, and the
 * description is the only thing telling an MCP client where to get the value —
 * a model that does not know about `list-tenants` cannot recover from the
 * "which organisation did you mean" error on its own.
 *
 * Optional, not required. With a single authorised organisation — the common
 * case, and the demo-company case — nothing changes for a caller and no
 * existing invocation breaks. With several, `resolveTenant` refuses rather
 * than guessing (design D3).
 */
export const tenantIdArg = {
  tenantId: z
    .string()
    .optional()
    .describe(
      "The Xero organisation to read, as a tenant id. Optional when the token " +
        "is authorised for exactly one organisation. Required when it is " +
        "authorised for several — call list-tenants to see them. This server " +
        "never picks an organisation for you.",
    ),
};

/**
 * Resolves the organisation for a tool call, or returns the error the tool
 * should hand back.
 *
 * Returns a discriminated union rather than throwing, because every tool in
 * this repo reports failure as text content rather than as an exception — an
 * MCP client shows the caller the message, and a thrown error would surface as
 * a protocol fault instead of something a model can read and act on.
 *
 * The resolution failure a caller will actually hit is "you are authorised for
 * several organisations, say which" — so it has to arrive as readable guidance
 * naming the candidates, not as a stack trace.
 */
export async function resolveTenantForTool(
  tenantId: string | undefined,
  subject: string,
) {
  try {
    return { ok: true as const, tenant: await resolveTenant(tenantId) };
  } catch (error) {
    /*
     * The content literal is built here rather than behind a declared
     * interface. A named return type collapses the tool's success and error
     * branches to that one shape, and MCP's CallToolResult is wider than it —
     * so the tool then fails to typecheck against the SDK. Inference keeps the
     * literal identical to the ones the other tools return inline.
     */
    return {
      ok: false as const,
      result: {
        content: [
          {
            type: "text" as const,
            text: `Error listing ${subject}: ${formatError(error)}`,
          },
        ],
      },
    };
  }
}
