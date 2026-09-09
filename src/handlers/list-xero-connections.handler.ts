import { listAuthorisedTenants } from "../clients/resolve-tenant.js";
import type { AuthorisedTenant } from "../clients/resolve-tenant.js";
import { formatError } from "../helpers/format-error.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Lists the Xero organisations the current token is authorised for.
 *
 * This is the discovery step every other tool's `tenantId` argument depends
 * on: a caller cannot pass an organisation id it has no way to learn.
 *
 * Deliberately delegates to `listAuthorisedTenants()` rather than calling
 * `GET /connections` itself. One reader of that endpoint means the tool
 * surface and tenant resolution can never disagree about which organisations
 * a token can reach — and it inherits the `fullOrgDetails: false` decision,
 * which avoids a `getOrganisations` call per authorised organisation against a
 * 60/minute per-tenant rate limit.
 */
export async function listXeroConnections(): Promise<
  XeroClientResponse<AuthorisedTenant[]>
> {
  try {
    const tenants = await listAuthorisedTenants();

    return {
      result: tenants,
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
