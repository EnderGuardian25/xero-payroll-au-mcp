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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async updateTenants(fullOrgDetails?: boolean): Promise<any[]> {
    await super.updateTenants(fullOrgDetails);
    if (this.tenants && this.tenants.length > 0) {
      this.tenantId = this.tenants[0].tenantId;
    }
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

    // Get the tenant ID from the connections endpoint
    const token = response.data.access_token;
    const connectionsResponse = await axios.get(
      "https://api.xero.com/connections",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );

    if (connectionsResponse.data && connectionsResponse.data.length > 0) {
      this.tenantId = connectionsResponse.data[0].tenantId;
    }

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

    await this.updateTenants();
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
