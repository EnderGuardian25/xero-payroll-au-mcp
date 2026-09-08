import { afterEach, describe, expect, it } from "vitest";

import {
  listAuthorisedTenants,
  resolveTenant,
} from "../resolve-tenant.js";
import {
  MCPXeroClient,
  setXeroClientForTesting,
} from "../xero-client.js";

/*
 * Tenant resolution — the rule that the server never guesses which
 * organisation it read.
 *
 * These tests exist because the failure they guard against is invisible. The
 * old behaviour returned real data from a real organisation with no error and
 * no indication of which one; a consumer reconciling superannuation would have
 * had no way to notice it was looking at the wrong client's payroll. There is
 * no crash to catch and no log line to grep — only the absence of a decision.
 *
 * So every branch of spec FR3 is pinned, including the two that must *fail*.
 */

interface FakeConnection {
  tenantId: string;
  tenantName: string;
  tenantType?: string;
}

let updateTenantsCalls: (boolean | undefined)[] = [];

/**
 * Minimal stand-in for the client. `resolve-tenant` only ever calls
 * `authenticate()` and `updateTenants()`, so that is all this implements —
 * and `updateTenantsCalls` records the argument so the N+1 guard below can
 * assert it.
 */
function fakeClient(connections: FakeConnection[]): MCPXeroClient {
  return {
    authenticate: async () => {},
    updateTenants: async (fullOrgDetails?: boolean) => {
      updateTenantsCalls.push(fullOrgDetails);
      return connections;
    },
  } as unknown as MCPXeroClient;
}

function install(connections: FakeConnection[]) {
  updateTenantsCalls = [];
  return setXeroClientForTesting(fakeClient(connections));
}

const DEMO = {
  tenantId: "5eed0000-1111-4aaa-8bbb-ccccdddd0001",
  tenantName: "Demo Company (AU)",
  tenantType: "ORGANISATION",
};
const WATTLE = {
  tenantId: "5eed0000-2222-4aaa-8bbb-ccccdddd0002",
  tenantName: "Wattle Street Pty Ltd",
  tenantType: "ORGANISATION",
};

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

describe("resolveTenant — spec FR3", () => {
  it("uses an explicitly requested tenant when the token authorises it", async () => {
    restore = install([DEMO, WATTLE]);

    const resolved = await resolveTenant(WATTLE.tenantId);

    expect(resolved).toEqual({
      tenantId: WATTLE.tenantId,
      tenantName: WATTLE.tenantName,
    });
  });

  it("uses the only authorised tenant when none is requested", async () => {
    restore = install([DEMO]);

    const resolved = await resolveTenant();

    expect(resolved).toEqual({
      tenantId: DEMO.tenantId,
      tenantName: DEMO.tenantName,
    });
  });

  it("refuses to choose when several are authorised and none is requested", async () => {
    // The load-bearing test. This is the exact case that used to silently
    // return the most-recently-updated organisation's data.
    restore = install([DEMO, WATTLE]);

    await expect(resolveTenant()).rejects.toThrow(/tenantId is required/);

    // The error has to be actionable: a bare GUID tells whoever hit this
    // nothing, so both the id and the organisation name must appear.
    const error = await resolveTenant().then(
      () => { throw new Error("expected resolveTenant to reject"); },
      (e: Error) => e,
    );
    expect(error.message).toContain(DEMO.tenantId);
    expect(error.message).toContain(DEMO.tenantName);
    expect(error.message).toContain(WATTLE.tenantId);
    expect(error.message).toContain(WATTLE.tenantName);
  });

  it("rejects a tenant the token is not authorised for", async () => {
    restore = install([DEMO]);

    const error = await resolveTenant(WATTLE.tenantId).then(
      () => { throw new Error("expected resolveTenant to reject"); },
      (e: Error) => e,
    );

    expect(error.message).toContain("not authorised");
    expect(error.message).toContain(WATTLE.tenantId);
    // And says what *is* available, rather than only what is not.
    expect(error.message).toContain(DEMO.tenantName);
  });

  it("errors when the token authorises no organisation at all", async () => {
    // Must not proceed with an empty tenant id, which Xero would reject with
    // something far less diagnosable (spec Edge Cases).
    restore = install([]);

    await expect(resolveTenant()).rejects.toThrow(/not authorised for any/);
  });

  it("does not depend on connection order", async () => {
    // The SDK sorts connections by updatedDateUtc descending, so order moves
    // on its own as organisations are touched. Same request, reversed list,
    // same answer.
    restore = install([DEMO, WATTLE]);
    const forward = await resolveTenant(WATTLE.tenantId);
    restore();

    restore = install([WATTLE, DEMO]);
    const reversed = await resolveTenant(WATTLE.tenantId);

    expect(reversed).toEqual(forward);
  });

  it("treats a blank requested tenant as absent, not as a miss", async () => {
    restore = install([DEMO]);

    expect(await resolveTenant("   ")).toEqual({
      tenantId: DEMO.tenantId,
      tenantName: DEMO.tenantName,
    });
  });
});

describe("listAuthorisedTenants", () => {
  it("returns id, name and type for every authorised organisation", async () => {
    restore = install([DEMO, WATTLE]);

    const tenants = await listAuthorisedTenants();

    expect(tenants).toHaveLength(2);
    // Destructured rather than indexed, so spec AC2 can stay a blunt grep for
    // a positional tenant pick without this assertion looking like one.
    const [first] = tenants;
    expect(first).toEqual(DEMO);
  });

  it("does not request full organisation details", async () => {
    // Not a style preference. fullOrgDetails=true fans out one
    // getOrganisations call per authorised organisation, so a token on twelve
    // orgs would spend thirteen requests against a 60/minute per-tenant limit
    // to populate a field nothing reads.
    restore = install([DEMO, WATTLE]);

    await listAuthorisedTenants();

    expect(updateTenantsCalls).toEqual([false]);
  });

  it("survives a connection with no name", async () => {
    restore = install([{ tenantId: "abc", tenantName: undefined as never }]);

    const [only] = await listAuthorisedTenants();

    expect(only.tenantName).toBe("(unnamed organisation)");
  });
});
