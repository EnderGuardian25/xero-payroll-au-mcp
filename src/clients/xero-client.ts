import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
import {
  IXeroClientConfig,
  Organisation,
  TokenSet,
  XeroClient,
} from "xero-node";

import { ensureError } from "../helpers/ensure-error.js";

dotenv.config();

const grant_type = "client_credentials";

export abstract class MCPXeroClient extends XeroClient {
  public tenantId: string;
  private shortCode: string;

  protected constructor(config?: IXeroClientConfig) {
    super(config);
    this.tenantId = "";
    this.shortCode = "";
  }

  public abstract authenticate(): Promise<void>;

  /*
   * Deliberately does NOT choose a tenant any more.
   *
   * Upstream assigned the first connection to `this.tenantId` here. Two problems,
   * and the second is the serious one:
   *
   *   - The SDK sorts connections by `updatedDateUtc` descending, so "first" is
   *     whichever organisation was touched most recently. It moves on its own.
   *   - `tenantId` is a public mutable field on a process-wide singleton. Once
   *     tools can target different organisations, assigning it per call is a
   *     data race: two in-flight calls read each other's tenant, intermittently,
   *     and the wrong answer looks exactly like the right one.
   *
   * So the tenant is now resolved per call by `resolve-tenant.ts` and threaded
   * through as an argument. No handler reads this field (spec FR5, design D1).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async updateTenants(fullOrgDetails?: boolean): Promise<any[]> {
    await super.updateTenants(fullOrgDetails);
    return this.tenants;
  }

  private async getOrganisation(): Promise<Organisation> {
    await this.authenticate();

    const organisationResponse = await this.accountingApi.getOrganisations(
      this.tenantId || "",
    );

    const organisation = organisationResponse.body.organisations?.[0];

    if (!organisation) {
      throw new Error("Failed to retrieve organisation");
    }

    return organisation;
  }

  public async getShortCode(): Promise<string | undefined> {
    if (!this.shortCode) {
      try {
        const organisation = await this.getOrganisation();
        this.shortCode = organisation.shortCode ?? "";
      } catch (error: unknown) {
        const err = ensureError(error);

        throw new Error(
          `Failed to get Organisation short code: ${err.message}`,
        );
      }
    }
    return this.shortCode;
  }
}

class CustomConnectionsXeroClient extends MCPXeroClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  // Legacy scopes (deprecated but still supported for existing apps)
  private readonly XERO_DEFAULT_AUTH_SCOPES_V1 = [
    "accounting.transactions",
    "accounting.contacts",
    "accounting.settings",
    "accounting.reports.read",
    "payroll.settings",
    "payroll.employees",
    "payroll.timesheets",
  ].join(" ");

  // Granular scopes (required for new apps)
  private readonly XERO_DEFAULT_AUTH_SCOPES_V2 = [
    "accounting.invoices",
    "accounting.payments",
    "accounting.banktransactions",
    "accounting.manualjournals",
    "accounting.reports.aged.read",
    "accounting.reports.balancesheet.read",
    "accounting.reports.profitandloss.read",
    "accounting.reports.trialbalance.read",
    "accounting.contacts",
    "accounting.settings",
    "payroll.settings",
    "payroll.employees",
    "payroll.timesheets",
  ].join(" ");

  constructor(config: {
    clientId: string;
    clientSecret: string;
    grantType: string;
  }) {
    super(config);
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  private formatTokenError(error: unknown, context: string): Error {
    const axiosError = error as AxiosError;
    const data = axiosError.response?.data;
    const message =
      typeof data === "object" ? JSON.stringify(data) : data || axiosError.message;
    return new Error(`Failed to get Xero token${context}: ${message}`);
  }

  public async getClientCredentialsToken(): Promise<TokenSet> {
    // If XERO_SCOPES is set, use that
    if (process.env.XERO_SCOPES) {                                                                                                                                                     
      try {
        return await this.requestToken(process.env.XERO_SCOPES);
      } catch (envError) {
        throw this.formatTokenError(envError, " with XERO_SCOPES");
      }
    }

    // Else if XERO_SCOPES is not set, try V1 scopes first (for existing apps), fallback to V2 scopes (for new apps) only on invalid_scope error
    try {
      return await this.requestToken(this.XERO_DEFAULT_AUTH_SCOPES_V1);
    } catch (error) {
      const axiosError = error as AxiosError;
      const isInvalidScope =
        axiosError.response?.status === 400 &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (axiosError.response?.data as any)?.error === "invalid_scope";

      if (!isInvalidScope) {
        throw this.formatTokenError(error, " with V1 scopes");
      }

      try {
        return await this.requestToken(this.XERO_DEFAULT_AUTH_SCOPES_V2);
      } catch (v2Error) {
        throw this.formatTokenError(v2Error, " with V2 scopes");
      }
    }
  }

  private async requestToken(scope: string): Promise<TokenSet> {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    const response = await axios.post(
      "https://identity.xero.com/connect/token",
      `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    /*
     * The second copy of the same defect, removed.
     *
     * Upstream fetched /connections here purely to assign the first
     * connection to `this.tenantId` — the identical "read whichever
     * organisation is first" bug as in `updateTenants`, but written against a
     * different variable, which is why a grep that found one would have
     * missed the other.
     *
     * Tenant selection now belongs to `resolve-tenant.ts` for both auth modes,
     * so the call was doing nothing but cost a request on every authenticate.
     */
    return response.data;
  }

  public async authenticate() {
    const tokenResponse = await this.getClientCredentialsToken();

    this.setTokenSet({
      access_token: tokenResponse.access_token,
      expires_in: tokenResponse.expires_in,
      token_type: tokenResponse.token_type,
    });
  }
}

class BearerTokenXeroClient extends MCPXeroClient {
  private readonly bearerToken: string;

  constructor(config: { bearerToken: string }) {
    super();
    this.bearerToken = config.bearerToken;
  }

  async authenticate(): Promise<void> {
    this.setTokenSet({
      access_token: this.bearerToken,
    });

    /*
     * `false` matters. The SDK defaults `fullOrgDetails` to true, which fans
     * out one `getOrganisations` call per authorised organisation — so a token
     * on twelve orgs spends thirteen requests here, against a 60/minute
     * per-tenant limit, to populate an `orgData` field nothing in this repo
     * reads. The connections payload already carries tenant id, name and type,
     * which is all `resolve-tenant.ts` needs.
     */
    await this.updateTenants(false);
  }
}

/*
 * Lazy client construction.
 *
 * Upstream read XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_CLIENT_BEARER_TOKEN
 * at module scope, threw there when none were set, and exported an eagerly
 * constructed singleton. Every handler imports this module and every tool
 * imports a handler, so `import { ToolFactory }` threw unless credentials were
 * present — which made it impossible to enumerate the tool registry in CI.
 *
 * That matters more than convenience. Both guards assert properties over the
 * whole registered surface, and every one of those assertions is trivially
 * true of an empty set. A guard that cannot boot is either skipped or passes
 * on zero tools, and in CI output that is indistinguishable from a guard that
 * passed on a clean surface. See spec FR5 and FR6f/FR6g.
 *
 * So construction moves to first use and the missing-credential error is
 * raised there. Credentials are still read from the process environment only —
 * nothing is stored, per CLAUDE.md's "prefer to hold nothing".
 *
 * The `xeroClient` export keeps its name and behaves as before on first
 * property access, so none of the 18 retained handlers changed. Keeping
 * divergence out of inherited files is a repo convention, and it also keeps
 * this commit reviewable.
 */

let instance: MCPXeroClient | null = null;

/**
 * Returns the process-wide Xero client, constructing it on first call.
 *
 * Throws if no credentials are configured. Bearer token takes precedence over
 * client credentials, exactly as upstream behaved — this change moves *when*
 * the client is built, not *how*.
 */
export function getXeroClient(): MCPXeroClient {
  if (instance) return instance;

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const bearerToken = process.env.XERO_CLIENT_BEARER_TOKEN;

  if (bearerToken) {
    instance = new BearerTokenXeroClient({ bearerToken });
  } else if (clientId && clientSecret) {
    instance = new CustomConnectionsXeroClient({
      clientId,
      clientSecret,
      grantType: grant_type,
    });
  } else {
    throw Error("Environment Variables not set - please check your .env file");
  }

  return instance;
}

/**
 * Replaces the client for the duration of a test, and returns a restore
 * function.
 *
 * This is what lets the guards drive every registered tool against a fake
 * client that throws on any non-read call, and against payloads seeded with
 * synthetic PII — the capability evidence behind Guard A and the rendered
 * output check behind Guard B (spec FR6d, FR7c). Without an injection point
 * those guards could only inspect source text.
 */
export function setXeroClientForTesting(
  fake: MCPXeroClient | null,
): () => void {
  const previous = instance;
  instance = fake;
  return () => {
    instance = previous;
  };
}

/**
 * The client, as inherited handlers consume it.
 *
 * A proxy rather than a value, so that importing this module never constructs
 * anything and never throws. Property access forwards to `getXeroClient()`,
 * which is where a missing credential surfaces.
 */
export const xeroClient: MCPXeroClient = new Proxy({} as MCPXeroClient, {
  get(_target, property) {
    const client = getXeroClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getXeroClient(), property, value);
  },
  has(_target, property) {
    return Reflect.has(getXeroClient(), property);
  },
});
