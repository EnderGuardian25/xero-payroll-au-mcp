import { describe, it, expect } from "vitest";
import { findPii, isValidTfn, type PiiFinding } from "../pii-matcher.js";

/**
 * Weights restated from the ATO specification rather than imported from the matcher. If the test
 * shared the implementation's constant, a corrupted constant would still pass.
 */
const ATO_WEIGHTS = [1, 4, 3, 7, 5, 8, 6, 9, 10];

/**
 * Derive a checksum-valid TFN from eight leading digits. Because the ninth weight is 10 and
 * 10 ≡ -1 (mod 11), the check digit is simply the weighted sum of the first eight modulo 11 — which
 * has no solution when that residue is 10.
 *
 * Every TFN in this file is generated, never copied from anywhere.
 */
function tfnFrom(first8: string): string | null {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(first8[i]) * ATO_WEIGHTS[i];
  const check = sum % 11;
  return check === 10 ? null : first8 + String(check);
}

function generateTfns(count: number): string[] {
  const tfns: string[] = [];
  for (let seed = 10_000_000; tfns.length < count; seed += 3_141_593) {
    const candidate = tfnFrom(String(seed % 100_000_000).padStart(8, "0"));
    if (candidate) tfns.push(candidate);
  }
  return tfns;
}

/** The eight nine-digit siblings of `tfn` that differ only in the check digit, all invalid. */
function checksumSiblings(tfn: string): string[] {
  return Array.from({ length: 10 }, (_, d) => tfn.slice(0, 8) + String(d)).filter(
    (candidate) => candidate !== tfn,
  );
}

const TFN = generateTfns(1)[0];
const kinds = (findings: PiiFinding[]): string[] => findings.map((f) => f.kind);

describe("isValidTfn", () => {
  it("accepts a generated checksum-valid TFN", () => {
    expect(isValidTfn(TFN)).toBe(true);
  });

  it("accepts every separator form a real payload carries", () => {
    const spaced = `${TFN.slice(0, 3)} ${TFN.slice(3, 6)} ${TFN.slice(6)}`;
    const hyphenated = `${TFN.slice(0, 3)}-${TFN.slice(3, 6)}-${TFN.slice(6)}`;
    expect(isValidTfn(spaced)).toBe(true);
    expect(isValidTfn(hyphenated)).toBe(true);
  });

  it("rejects every nine-digit sibling that differs only in the check digit", () => {
    for (const sibling of checksumSiblings(TFN)) {
      expect(isValidTfn(sibling), sibling).toBe(false);
    }
  });

  it("rejects digit strings that are not nine digits long", () => {
    expect(isValidTfn(TFN.slice(0, 8))).toBe(false);
    expect(isValidTfn(TFN + "1")).toBe(false);
    expect(isValidTfn("51824753556")).toBe(false); // ABN length
  });

  it("rejects all zeros, which satisfies the checksum but is padding", () => {
    expect(isValidTfn("000000000")).toBe(false);
  });
});

describe("findPii catches what it must", () => {
  it("flags a bare TFN handed in as a plain string", () => {
    expect(kinds(findPii(TFN))).toEqual(["tfn"]);
  });

  it("flags space- and hyphen-separated TFNs", () => {
    const spaced = `${TFN.slice(0, 3)} ${TFN.slice(3, 6)} ${TFN.slice(6)}`;
    const hyphenated = `${TFN.slice(0, 3)}-${TFN.slice(3, 6)}-${TFN.slice(6)}`;
    expect(kinds(findPii(spaced))).toEqual(["tfn"]);
    expect(kinds(findPii(hyphenated))).toEqual(["tfn"]);
  });

  it("flags a TFN nested in an object and reports its field path", () => {
    const payload = { Employee: { TaxDeclaration: { TaxFileNumber: TFN } } };
    expect(findPii(payload)).toEqual([
      { kind: "tfn", path: "Employee.TaxDeclaration.TaxFileNumber" },
    ]);
  });

  it("flags a TFN inside an array and reports an indexed path", () => {
    const payload = { Payslips: [{ Notes: "clean" }, { Notes: `TFN ${TFN}` }] };
    expect(findPii(payload)).toEqual([
      { kind: "tfn", path: "Payslips[1].Notes" },
    ]);
  });

  it("flags a TFN embedded in free text", () => {
    const rendered = `Employee: Jane Doe\nTax file number is ${TFN} (verified).`;
    expect(kinds(findPii(rendered))).toEqual(["tfn"]);
  });

  it("flags every generated TFN, not just one lucky seed", () => {
    for (const tfn of generateTfns(25)) {
      expect(kinds(findPii(`value ${tfn} end`)), tfn).toEqual(["tfn"]);
    }
  });

  it("flags a canonically printed BSB with no surrounding context", () => {
    expect(kinds(findPii("062-000"))).toEqual(["bsb"]);
  });

  it("flags a bare BSB under a bank-ish field name", () => {
    expect(findPii({ BankAccountDetails: "062000" })).toEqual([
      { kind: "bsb", path: "BankAccountDetails" },
    ]);
  });

  it("flags a bank account number under a bank-ish field name", () => {
    expect(findPii({ Employee: { bankAccountNumber: "12345678" } })).toEqual([
      { kind: "bank-account", path: "Employee.bankAccountNumber" },
    ]);
  });

  it("flags an account number in rendered text carrying a bank cue", () => {
    expect(kinds(findPii("Bank Account: 12345678"))).toEqual(["bank-account"]);
    expect(kinds(findPii("Account Number 987654321"))).toEqual(["bank-account"]);
  });

  it("never echoes the matched value in a finding", () => {
    const findings = findPii({ TaxFileNumber: TFN, BankAccountNumber: "12345678" });
    expect(findings.length).toBe(2);
    for (const finding of findings) {
      expect(Object.keys(finding).sort()).toEqual(["kind", "path"]);
    }
    expect(JSON.stringify(findings)).not.toContain(TFN);
    expect(JSON.stringify(findings)).not.toContain("12345678");
  });
});

describe("findPii does not flag values this surface must emit", () => {
  it("does not flag nine-digit numbers that fail the TFN checksum", () => {
    // The load-bearing negative. A matcher that trips on arbitrary nine-digit runs is unusable on
    // payroll data, and narrowing it to quieten that noise is how the check would go fail-open.
    for (const sibling of checksumSiblings(TFN)) {
      expect(findPii(sibling), sibling).toEqual([]);
      expect(findPii({ SomeIdentifier: sibling }), sibling).toEqual([]);
    }
  });

  it("does not flag ABNs, in either printed form", () => {
    expect(findPii({ SuperFund: { ABN: "51824753556" } })).toEqual([]);
    expect(findPii({ SuperFund: { ABN: "51 824 753 556" } })).toEqual([]);
  });

  it("does not flag USIs", () => {
    expect(findPii({ SuperFund: { USI: "STA0100AU" } })).toEqual([]);
    expect(findPii({ SuperFund: { USI: "51824753556001" } })).toEqual([]);
  });

  it("does not flag GUID-style SuperMembershipIDs", () => {
    const guids = [
      "d7f0e5a2-3b41-4c8e-9a06-5f2b1c7d8e93",
      "12345678-1234-5678-9012-345678901234",
      "00000000-0000-0000-0000-000000000000",
    ];
    for (const guid of guids) {
      expect(findPii({ SuperMembershipID: guid }), guid).toEqual([]);
    }
  });

  it("does not flag monetary amounts", () => {
    expect(findPii({ Amount: "1234.56", Super: "0.00" })).toEqual([]);
    // Cents, nine digits wide, checksum-invalid.
    const cents = checksumSiblings(TFN)[0];
    expect(findPii({ AmountInCents: cents })).toEqual([]);
    // Both halves of a decimal are discarded, so even TFN-shaped digits before a decimal point are
    // treated as an amount. Accepted: amounts are the dominant digit source in rendered output.
    expect(findPii({ Amount: `${TFN}.00` })).toEqual([]);
  });

  it("does not flag dates", () => {
    expect(findPii({ PaymentDate: "20260908" })).toEqual([]);
    expect(findPii({ PaymentDate: "2026-09-08" })).toEqual([]);
    expect(findPii({ PeriodEndDate: "2026-09-30T00:00:00" })).toEqual([]);
  });

  it("does not flag a TFN-shaped run welded into a reference code", () => {
    expect(findPii({ Reference: `REF${TFN}X` })).toEqual([]);
    expect(findPii({ Reference: `INVOICE_${TFN}` })).toEqual([]);
  });

  it("does not flag six-to-ten digit runs outside a bank context", () => {
    expect(findPii({ MemberNumber: "12345678" })).toEqual([]);
    expect(findPii("Employee count 12345678")).toEqual([]);
    expect(findPii({ Report: "Accounts Payable total 12345678" })).toEqual([]);
  });

  it("does not scan numbers, booleans or nullish values", () => {
    expect(findPii({ Amount: Number(TFN), Posted: true, Note: null })).toEqual([]);
    expect(findPii(null)).toEqual([]);
    expect(findPii(undefined)).toEqual([]);
    expect(findPii("")).toEqual([]);
    expect(findPii({})).toEqual([]);
  });

  it("terminates on a self-referencing payload", () => {
    const payload: Record<string, unknown> = { TaxFileNumber: TFN };
    payload.self = payload;
    expect(findPii(payload)).toEqual([{ kind: "tfn", path: "TaxFileNumber" }]);
  });

  /*
   * Regression: an ISO date beside a bank cue was reported as an account number.
   *
   * Found by Guard B failing on a clean surface, not by review. `list-bank-transactions` renders
   * "Bank Account: ..." and "Date: 2026-08-14" in the same text; because a candidate run absorbs
   * single hyphens, that date normalises to the 8-digit 20260814, which sits inside the 6-10
   * account-number band with a bank cue present.
   *
   * These four tests are a matched pair on purpose. Narrowing a PII matcher to silence a false
   * positive is exactly how it drifts fail-open, so the exclusion is pinned in both directions: the
   * date must not fire, and a genuine 8-digit account number under the same cue must still fire.
   */
  describe("date-shaped runs beside a bank cue", () => {
    it("does not report an ISO date as a bank account number", () => {
      expect(findPii("Bank Account: Cheque\nDate: 2026-08-14")).toEqual([]);
      expect(findPii("Account Number listed\nDate: 14-08-2026")).toEqual([]);
    });

    it("still reports a real account number under the same cue", () => {
      expect(findPii("Bank Account Number: 12345678")).toEqual([
        { kind: "bank-account", path: "" },
      ]);
      expect(findPii({ bankAccountNumber: "12345678" })).toEqual([
        { kind: "bank-account", path: "bankAccountNumber" },
      ]);
    });

    it("still reports a TFN that happens to sit beside a date", () => {
      // The exclusion must never reach the checksum rule. This is the assertion
      // that would fail if someone moved the date check above the TFN check.
      expect(findPii(`Date: 2026-08-14\nTFN ${TFN}`)).toEqual([
        { kind: "tfn", path: "" },
      ]);
    });
  });

  /*
   * Change 002 makes tenant GUIDs a routine part of every tool's output — a
   * caller passes one in and each response names the organisation it read. So
   * the matcher now sees them constantly, and a false positive here would fire
   * on the whole surface rather than in some corner.
   *
   * This is asserted rather than assumed. Candidate extraction already rejects
   * digit runs welded into identifiers, which is why a GUID's segments stay
   * separate, but "should be fine by construction" is exactly the reasoning
   * these tests exist to replace. Spec 002 AC11.
   */
  describe("tenant identifiers (change 002)", () => {
    const TENANT = "5eed0000-1111-4aaa-8bbb-ccccdddd0002";

    it("does not flag a tenant GUID, bare or labelled", () => {
      expect(findPii(TENANT)).toEqual([]);
      expect(findPii(`Organisation: Wattle Street Pty Ltd (${TENANT})`)).toEqual(
        [],
      );
      expect(findPii({ tenantId: TENANT, tenantName: "Demo Company (AU)" })).toEqual(
        [],
      );
    });

    it("does not flag a tenant GUID even beside a bank cue", () => {
      // list-bank-transactions renders both a tenant id and "Bank Account:",
      // which is the combination that produced the date false positive above.
      expect(
        findPii(`Bank Account: Cheque\nOrganisation: Demo (${TENANT})`),
      ).toEqual([]);
    });

    it("still flags a real TFN sitting beside a tenant GUID", () => {
      // The exclusion must not become a blanket amnesty for anything near a
      // GUID. This is the assertion that fails if someone widens it.
      expect(findPii(`Org ${TENANT}\nTFN ${TFN}`)).toEqual([
        { kind: "tfn", path: "" },
      ]);
    });
  });
});
