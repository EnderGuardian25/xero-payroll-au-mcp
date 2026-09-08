import { getXeroClient } from "./xero-client.js";

/**
 * Which Xero organisation a call should read, and its name.
 *
 * The name travels with the id so a tool can say which organisation it read
 * without a second API call (spec FR4). A consumer must never have to infer
 * that from context.
 */
export interface ResolvedTenant {
  tenantId: string;
  tenantName: string;
}

/** An organisation the current token is authorised for. */
export interface AuthorisedTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

/**
 * Reads the organisations the current token can access, from GET /connections.
 *
 * `updateTenants(false)` on purpose. The SDK defaults `fullOrgDetails` to
 * true, which fans out one `getOrganisations` call per authorised tenant — so
 * a token on twelve organisations costs thirteen requests against a 60/minute
 * per-tenant limit, to fetch `orgData` nothing in this repo reads. The
 * connections payload already carries the id, name and type we need.
 */
export async function listAuthorisedTenants(): Promise<AuthorisedTenant[]> {
  const client = getXeroClient();
  await client.authenticate();

  const connections = await client.updateTenants(false);

  return (connections ?? []).map((connection) => ({
    tenantId: String(connection.tenantId ?? ""),
    tenantName: String(connection.tenantName ?? "(unnamed organisation)"),
    tenantType: String(connection.tenantType ?? "ORGANISATION"),
  }));
}

/** Renders the authorised set for an error message: id first, name after. */
function describe(tenants: readonly AuthorisedTenant[]): string {
  return tenants.map((t) => `  ${t.tenantId}  ${t.tenantName}`).join("\n");
}

/**
 * Decides which organisation a call reads, and refuses to guess.
 *
 * ## Why this exists
 *
 * Before change 002 the answer was simply the first connection. Two things made that
 * indefensible rather than merely untidy:
 *
 *   - The SDK sorts connections by `updatedDateUtc` descending, so "first" is
 *     whichever organisation was touched most recently. It changes underneath
 *     you, without any change to the call.
 *   - Nothing in the response said which organisation had been read.
 *
 * For accounting reads that is sloppy. For the superannuation data this repo
 * exists to expose, it means handing a consumer one client's payroll while
 * they believe it is another's — a confidentiality failure that looks exactly
 * like a correct answer.
 *
 * So the rule is: use what you were told, use the only option if there is one,
 * and otherwise fail loudly naming the candidates. Choosing *deterministically*
 * would still be choosing (design D2).
 *
 * Errors carry the organisation name alongside the id, because a bare GUID is
 * useless to whoever has to correct the call.
 */
export async function resolveTenant(
  requestedTenantId?: string,
): Promise<ResolvedTenant> {
  const tenants = await listAuthorisedTenants();

  if (tenants.length === 0) {
    throw new Error(
      "This token is not authorised for any Xero organisation. " +
        "Authorise the app against an organisation, then try again.",
    );
  }

  const requested = requestedTenantId?.trim();

  if (requested) {
    const match = tenants.find((t) => t.tenantId === requested);
    if (!match) {
      throw new Error(
        `This token is not authorised for tenantId ${requested}. ` +
          `Authorised organisations:\n${describe(tenants)}`,
      );
    }
    return { tenantId: match.tenantId, tenantName: match.tenantName };
  }

  if (tenants.length === 1) {
    // Destructured rather than indexed so that spec AC2 can stay a blunt
    // one-line grep for a positional tenant pick. Here there is exactly one
    // authorised organisation, so taking it is not a guess — but a reader
    // scanning for the old defect should not have to make that distinction.
    const [only] = tenants;
    return { tenantId: only.tenantId, tenantName: only.tenantName };
  }

  throw new Error(
    `This token is authorised for ${tenants.length} organisations, so tenantId ` +
      `is required. Pass one of:\n${describe(tenants)}\n` +
      "Use the list-tenants tool to see these at any time.",
  );
}
