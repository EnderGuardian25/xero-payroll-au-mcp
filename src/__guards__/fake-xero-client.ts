import type { MCPXeroClient } from "../clients/xero-client.js";

import { isValidTfn } from "./pii-matcher.js";

/*
 * A stand-in Xero client for the guards, injected via
 * `setXeroClientForTesting()`.
 *
 * It serves two jobs that look unrelated and are not:
 *
 *  - Guard A's capability evidence (spec FR6d). Every read the 18 retained
 *    handlers make is stubbed; every other method throws, naming itself. A
 *    handler that has quietly grown a write cannot complete against this
 *    client, and the failure message says which method it reached for.
 *
 *  - Guard B's rendered-output check (spec FR7c). With `plantPii: true` the
 *    payloads carry a checksum-valid synthetic TFN, a BSB and a bank account
 *    number in the fields Xero really carries them in, so a guard can drive
 *    every tool and assert none of those values reach the rendered text. This
 *    is what makes rule 2 falsifiable today, with no Xero organisation and no
 *    recorded fixture (design D2).
 *
 * The same object serves both because the question is the same question:
 * what does the registered surface actually *do* when a Xero response arrives.
 *
 * SCOPE: this models the minimum that lets the 18 handlers run — roughly
 * twenty `accountingApi` reads, `authenticate()`, `tenantId` and the response
 * envelope's `.body.<collection>` shape. It is not a model of the xero-node
 * SDK, and it should not grow into one. Payroll AU reads join it in change 003
 * when the first payroll tool lands.
 */

/**
 * The mutating-verb pattern from spec FR6b, reused here so the static check
 * and the dynamic check cannot disagree about what "mutating" means.
 *
 * Note this deliberately catches `updateTenants` on the client itself, which
 * is a GET under the hood. No retained handler calls it, and being strict
 * about a method whose *name* announces a write is the right default for a
 * guard: a fake that quietly permits `update*` is a fake that will one day
 * permit a real one.
 */
export const MUTATING_METHOD_PATTERN =
  /^(create|update|delete|post|put|patch|approve|revert|archive|void|email)/i;

/**
 * Synthetic PII planted into responses when `plantPii` is set.
 *
 * `123456782` is the ATO's published test TFN and is checksum-valid, which
 * matters: `pii-matcher.ts` (T7) validates the ATO weighted checksum rather
 * than matching any nine digits, because a bare digit-run rule collides with
 * ABNs, USIs, `SuperMembershipID`s and amounts in cents — values this surface
 * is required to emit. A planted value that failed the checksum would make
 * Guard B pass for the wrong reason.
 *
 * The arithmetic, so it can be checked without running anything. Weights
 * 1,4,3,7,5,8,6,9,10 against digits 1,2,3,4,5,6,7,8,2:
 *
 *   1x1 + 2x4 + 3x3 + 4x7 + 5x5 + 6x8 + 7x6 + 8x9 + 2x10
 *   =  1 +   8 +   9 +  28 +  25 +  48 +  42 +  72 +  20  = 253
 *   253 = 11 x 23, so the checksum holds.
 *
 * `pii-matcher.ts` is the single shared implementation of detection (FR7d);
 * this module deliberately contains no matching logic of its own, only planted
 * values, and it imports the matcher rather than restating the checksum.
 */
export const PLANTED_PII = {
  taxFileNumber: "123456782",
  bsb: "083-004",
  bankAccountNumber: "12345678",
} as const;

/*
 * The planted TFN is worthless unless the shared matcher can actually see it.
 * If someone edits the constant above to a number that fails the ATO checksum,
 * Guard B keeps passing and stops proving anything — a silent fail-open in the
 * one check that has to stay honest. So the invariant is asserted at import,
 * where a wrong edit fails immediately and unmistakably instead of at review
 * time. This module is imported only by guards, so the throw reaches no
 * runtime path.
 */
if (!isValidTfn(PLANTED_PII.taxFileNumber)) {
  throw new Error(
    `PLANTED_PII.taxFileNumber is not a checksum-valid TFN, so Guard B's ` +
      `rendered-output check (spec FR7c) would prove nothing. Pick a value ` +
      `isValidTfn() accepts.`,
  );
}

/**
 * The planted values, for a guard that wants exact-substring assertions.
 *
 * Both layers are needed, and they cover different holes. `findPii()` catches
 * a leak in *any* value, planted or not, but its bank-account rule requires a
 * nearby field name or text cue — deliberately, so that a report figure is not
 * read as an account number. A tool that rendered a bare `12345678` with no
 * label would slip past it. An exact-substring check over these three values
 * has no such gap, but only sees what was planted. Guard B should run both.
 */
export const PLANTED_PII_VALUES: readonly string[] = Object.freeze([
  PLANTED_PII.taxFileNumber,
  PLANTED_PII.bsb,
  PLANTED_PII.bankAccountNumber,
]);

/**
 * Obviously-synthetic tenant id. Tenant identifiers are the one Xero-side
 * value CLAUDE.md rule 4 permits in a log line, so this is safe to appear in
 * a guard failure message.
 */
export const FAKE_TENANT_ID = "00000000-0000-4000-8000-000000000000";

export interface FakeXeroClientOptions {
  /**
   * Seed responses with `PLANTED_PII`. Off by default: Guard A only needs the
   * verb enforcement, and a payload with no PII in it keeps that failure
   * message uncluttered.
   */
  plantPii?: boolean;
}

export interface FakeXeroClient {
  /** Pass this to `setXeroClientForTesting()`. */
  readonly client: MCPXeroClient;

  /** Stubbed reads that were called, qualified, in call order. */
  readonly readCalls: string[];

  /**
   * Calls whose method name matched `MUTATING_METHOD_PATTERN`. Non-empty means
   * Guard A fails: a registered tool tried to write.
   */
  readonly mutatingCalls: string[];

  /**
   * Calls to methods this fake does not stub and whose names are not mutating.
   * Non-empty is a different failure with a different fix — the fake needs
   * extending — and keeping it out of `mutatingCalls` stops a gap in the fake
   * from being reported as a write tool.
   */
  readonly unstubbedCalls: string[];

  /** Which values were planted, or empty when `plantPii` was not set. */
  readonly plantedValues: readonly string[];
}

interface CallLog {
  readCalls: string[];
  mutatingCalls: string[];
  unstubbedCalls: string[];
}

type Stubs = Record<string, unknown>;

/*
 * Response payloads.
 *
 * Two rules govern where PII is planted, and both are load-bearing:
 *
 *  1. Plant ONLY into fields on spec FR7a's denied list — `taxFileNumber`,
 *     `bsb`, `accountNumber`, `bankAccountNumber`, `bankAccountName`,
 *     `bankAccountDetails`, `taxDeclaration`. Planting into a field a tool
 *     legitimately renders (a contact name, an organisation's ABN in
 *     `taxNumber`) would make Guard B fail on a clean surface, and a guard
 *     that fails on clean input gets deleted within a week.
 *
 *  2. No legitimate value anywhere below may contain a planted digit string,
 *     or Guard B's substring assertion fires on an innocent amount or id. All
 *     ids here are hex GUIDs and all amounts are small.
 *
 * On the accounting surface the denied fields live only on Contact-shaped and
 * Account-shaped objects, so that is where the plants land. That thin
 * footprint is expected: the accounting API barely carries PII. The real
 * payoff of FR7c arrives with Payroll AU employees, payslips and super
 * memberships in change 003, and this is the file those plants belong in.
 *
 * Report rows are deliberately left clean. Four retained tools
 * (`list-trial-balance`, `list-profit-and-loss`, `list-report-balance-sheet`
 * and both aged-report tools) render `JSON.stringify(report.rows)` wholesale,
 * so planting there would assert a leak Xero's report model does not actually
 * produce — report cells carry account names and figures, not TFNs or account
 * numbers. That wholesale stringify is still the widest egress on the retained
 * surface and is worth a look when FR7b is written.
 */
function buildPayloads(pii: typeof PLANTED_PII | null) {
  const deniedContactFields = pii
    ? {
        taxFileNumber: pii.taxFileNumber,
        bankAccountDetails: `${pii.bsb} ${pii.bankAccountNumber}`,
        bankAccountName: "Wattle Street Operating Account",
        taxDeclaration: { taxFileNumber: pii.taxFileNumber },
      }
    : {};

  const deniedAccountFields = pii
    ? {
        bankAccountNumber: pii.bankAccountNumber,
        bsb: pii.bsb,
        accountNumber: pii.bankAccountNumber,
      }
    : {};

  const contact = {
    contactID: "c0ffee00-1111-4aaa-8bbb-ccccdddd0001",
    name: "Wattle Street Pty Ltd",
    firstName: "Marion",
    lastName: "Cobb",
    emailAddress: "accounts@wattlestreet.example",
    contactStatus: "ACTIVE",
    isCustomer: true,
    isSupplier: false,
    defaultCurrency: "AUD",
    updatedDateUTC: new Date("2026-08-01T00:00:00.000Z"),
    contactGroups: [{ name: "Retail" }],
    ...deniedContactFields,
  };

  const bankAccount = {
    accountID: "acc00000-2222-4aaa-8bbb-ccccdddd0002",
    code: "090",
    name: "Business Cheque Account",
    type: "BANK",
    status: "ACTIVE",
    ...deniedAccountFields,
  };

  const lineItem = {
    lineItemID: "1111aaaa-3333-4aaa-8bbb-ccccdddd0003",
    description: "Consulting, July",
    quantity: 2,
    unitAmount: 400,
    accountCode: "200",
    taxType: "OUTPUT",
    lineAmount: 800,
  };

  const report = {
    reportID: "TrialBalance",
    reportName: "Trial Balance",
    reportType: "TrialBalance",
    reportTitles: ["Trial Balance", "Wattle Street Pty Ltd"],
    reportDate: "1 September 2026",
    updatedDateUTC: new Date("2026-09-01T00:00:00.000Z"),
    rows: [
      {
        rowType: "Header",
        cells: [{ value: "Account" }, { value: "Debit" }, { value: "Credit" }],
      },
      {
        rowType: "Section",
        title: "Assets",
        rows: [
          {
            rowType: "Row",
            cells: [
              { value: "Business Cheque Account" },
              { value: "400.00" },
              { value: "0.00" },
            ],
          },
        ],
      },
    ],
  };

  return {
    accounts: [
      bankAccount,
      {
        accountID: "acc00000-2222-4aaa-8bbb-ccccdddd0004",
        code: "200",
        name: "Sales",
        type: "REVENUE",
        status: "ACTIVE",
        description: "Revenue from sales",
        taxType: "OUTPUT",
      },
    ],
    bankTransactions: [
      {
        bankTransactionID: "bbbb0000-4444-4aaa-8bbb-ccccdddd0005",
        bankAccount,
        contact,
        type: "SPEND",
        reference: "EFT-771",
        date: "2026-08-14",
        subTotal: 400,
        totalTax: 40,
        total: 440,
        isReconciled: true,
        currencyCode: "AUD",
        status: "AUTHORISED",
        lineAmountTypes: "Exclusive",
        hasAttachments: false,
        lineItems: [lineItem],
      },
    ],
    contactGroups: [
      {
        contactGroupID: "cccc0000-5555-4aaa-8bbb-ccccdddd0006",
        name: "Retail",
        status: "ACTIVE",
        contacts: [contact],
      },
    ],
    contacts: [contact],
    creditNotes: [
      {
        creditNoteID: "cn000000-6666-4aaa-8bbb-ccccdddd0007",
        creditNoteNumber: "CN-004",
        reference: "credit for CN-004",
        type: "ACCRECCREDIT",
        status: "AUTHORISED",
        contact,
        date: "2026-08-20",
        lineAmountTypes: "Exclusive",
        subTotal: 100,
        totalTax: 10,
        total: 110,
        currencyCode: "AUD",
        currencyRate: 1,
        updatedDateUTC: new Date("2026-08-20T00:00:00.000Z"),
      },
    ],
    invoices: [
      {
        invoiceID: "in000000-7777-4aaa-8bbb-ccccdddd0008",
        invoiceNumber: "INV-0091",
        reference: "PO 44",
        type: "ACCREC",
        status: "AUTHORISED",
        contact,
        date: "2026-08-02",
        dueDate: "2026-08-30",
        lineAmountTypes: "Exclusive",
        subTotal: 800,
        totalTax: 80,
        total: 880,
        currencyCode: "AUD",
        currencyRate: 1,
        updatedDateUTC: new Date("2026-08-02T00:00:00.000Z"),
        amountDue: 880,
        amountPaid: 0,
        lineItems: [lineItem],
      },
    ],
    items: [
      {
        itemID: "it000000-8888-4aaa-8bbb-ccccdddd0009",
        code: "CONSULT",
        name: "Consulting hour",
        description: "One hour of consulting",
        purchaseDescription: "Contractor hour",
        isTrackedAsInventory: false,
        isSold: true,
        isPurchased: false,
        salesDetails: { unitPrice: 400, accountCode: "200" },
        purchaseDetails: { unitPrice: 300, accountCode: "300" },
        updatedDateUTC: new Date("2026-07-15T00:00:00.000Z"),
      },
    ],
    manualJournals: [
      {
        manualJournalID: "mj000000-9999-4aaa-8bbb-ccccdddd000a",
        narration: "Accrual reversal",
        date: "2026-08-31",
        lineAmountTypes: "NoTax",
        status: "POSTED",
        showOnCashBasisReports: false,
        hasAttachments: false,
        updatedDateUTC: new Date("2026-08-31T00:00:00.000Z"),
        journalLines: [
          {
            lineAmount: 500,
            accountCode: "200",
            description: "Accrual reversal, debit",
            taxType: "NONE",
            taxAmount: 0,
          },
          {
            lineAmount: -500,
            accountCode: "300",
            description: "Accrual reversal, credit",
            taxType: "NONE",
            taxAmount: 0,
          },
        ],
      },
    ],
    organisations: [
      {
        organisationID: "or000000-aaaa-4aaa-8bbb-ccccdddd000b",
        name: "Wattle Street Pty Ltd",
        legalName: "Wattle Street Proprietary Limited",
        paysTax: true,
        version: "AU",
        organisationType: "COMPANY",
        baseCurrency: "AUD",
        countryCode: "AU",
        timezone: "AUSEASTERNSTANDARDTIME",
        organisationEntityType: "COMPANY",
        shortCode: "!wattl",
        // An ABN, not a TFN. Deliberately left as a legitimate value: it is
        // rendered by `list-organisation-details`, and Guard B must not fire
        // on it. This is the false-positive case spec Edge Cases names.
        taxNumber: "53 004 085 616",
        registrationNumber: "004085616",
        financialYearEndDay: 30,
        financialYearEndMonth: 6,
        salesTaxBasis: "ACCRUALS",
        salesTaxPeriod: "QUARTERLY1",
        organisationStatus: "ACTIVE",
        createdDateUTC: new Date("2019-04-01T00:00:00.000Z"),
        edition: "BUSINESS",
        _class: "PREMIUM",
        isDemoCompany: false,
        lineOfBusiness: "Professional services",
        addresses: [
          {
            addressType: "STREET",
            addressLine1: "42 Wattle Street",
            city: "Newtown",
            postalCode: "2042",
            country: "Australia",
          },
        ],
        phones: [{ phoneType: "DEFAULT", phoneNumber: "9550 0000" }],
        externalLinks: [
          { linkType: "Website", url: "https://wattlestreet.example" },
        ],
        paymentTerms: { sales: { day: 30, type: "DAYSAFTERBILLDATE" } },
      },
    ],
    payments: [
      {
        paymentID: "pm000000-bbbb-4aaa-8bbb-ccccdddd000c",
        date: "2026-08-15",
        amount: 880,
        reference: "EFT-802",
        status: "AUTHORISED",
        paymentType: "ACCRECPAYMENT",
        updatedDateUTC: new Date("2026-08-15T00:00:00.000Z"),
        account: bankAccount,
        invoice: {
          invoiceID: "in000000-7777-4aaa-8bbb-ccccdddd0008",
          invoiceNumber: "INV-0091",
          type: "ACCREC",
          total: 880,
          amountDue: 0,
          contact,
        },
      },
    ],
    quotes: [
      {
        quoteID: "qt000000-cccc-4aaa-8bbb-ccccdddd000d",
        quoteNumber: "QU-0012",
        reference: "RFQ 9",
        status: "SENT",
        contact,
        dateString: "2026-08-05",
        expiryDateString: "2026-09-05",
        title: "Consulting engagement",
        summary: "Two weeks of consulting",
        terms: "Payment within 30 days",
        lineAmountTypes: "Exclusive",
        subTotal: 4000,
        totalTax: 400,
        total: 4400,
        currencyCode: "AUD",
        currencyRate: 1,
        updatedDateUTC: new Date("2026-08-05T00:00:00.000Z"),
      },
    ],
    reports: [report],
    taxRates: [
      {
        name: "GST on Income",
        taxType: "OUTPUT",
        status: "ACTIVE",
        displayTaxRate: 10,
        effectiveRate: 10,
        canApplyToRevenue: true,
        taxComponents: [
          { name: "GST", rate: 10, isCompound: false, isNonRecoverable: false },
        ],
      },
    ],
    trackingCategories: [
      {
        trackingCategoryID: "tc000000-dddd-4aaa-8bbb-ccccdddd000e",
        name: "Region",
        status: "ACTIVE",
        options: [
          {
            trackingOptionID: "to000000-eeee-4aaa-8bbb-ccccdddd000f",
            name: "NSW",
            status: "ACTIVE",
          },
        ],
      },
    ],
  };
}

/**
 * Wraps stub functions so calls are logged, then fronts the whole map with a
 * proxy that turns every *un*stubbed access into a throwing, self-naming
 * function.
 *
 * A missing method has to throw rather than return `undefined`: `undefined` is
 * also what a plain object returns for a method that does not exist, and the
 * resulting `is not a function` TypeError names nothing useful. The thrown
 * message is what a guard failure will actually be diagnosed from.
 */
function createEnforcingSurface(
  label: string,
  stubs: Stubs,
  log: CallLog,
): Stubs {
  const recorded: Stubs = {};

  for (const [name, value] of Object.entries(stubs)) {
    if (typeof value !== "function") {
      recorded[name] = value;
      continue;
    }
    const fn = value as (...args: unknown[]) => unknown;
    recorded[name] = (...args: unknown[]) => {
      log.readCalls.push(`${label}.${name}`);
      return fn(...args);
    };
  }

  return new Proxy(recorded, {
    get(target, property) {
      // Symbols are engine and inspector plumbing (`Symbol.toPrimitive`,
      // `util.inspect.custom`, and so on). Forwarding them keeps the fake
      // printable in a test failure instead of exploding while being reported.
      if (typeof property === "symbol") {
        return Reflect.get(target, property);
      }
      if (property in target) {
        return Reflect.get(target, property);
      }

      const qualified = `${label}.${property}`;

      // An unstubbed API *namespace* — `payrollAUApi`, `assetApi` — is not a
      // call, it is an object a call is made on. Returning a throwing function
      // here would surface as `x.payrollAUApi.getPayRuns is not a function`,
      // which names the wrong thing. Recursing gives the eventual call site a
      // fully qualified name instead. Change 003 will stub payrollAUApi
      // properly; until then this is what its failure should read like.
      if (/Api$/.test(property)) {
        return createEnforcingSurface(qualified, {}, log);
      }

      const mutating = MUTATING_METHOD_PATTERN.test(property);

      return () => {
        if (mutating) {
          log.mutatingCalls.push(qualified);
          throw new Error(
            `Read-only violation: a registered tool called ${qualified}(), ` +
              `whose name matches the mutating-verb pattern ` +
              `${MUTATING_METHOD_PATTERN.source}. Every tool in this server ` +
              `must be read-only (CLAUDE.md rule 1, spec FR6d).`,
          );
        }
        log.unstubbedCalls.push(qualified);
        throw new Error(
          `The fake Xero client has no stub for ${qualified}(). This is a gap ` +
            `in src/__guards__/fake-xero-client.ts, not a read-only ` +
            `violation: add the read and the response shape it returns.`,
        );
      };
    },
  });
}

/**
 * Builds a read-only fake Xero client and the call log the guards assert over.
 *
 * ```ts
 * const fake = createFakeXeroClient({ plantPii: true });
 * const restore = setXeroClientForTesting(fake.client);
 * try {
 *   await tool.handler({ page: 1 }, {});
 * } finally {
 *   restore();
 * }
 * expect(fake.mutatingCalls).toEqual([]);
 * ```
 *
 * `restore()` must run even when the handler throws, or one tool's failure
 * leaks a fake client into every later test in the file.
 */
export function createFakeXeroClient(
  options: FakeXeroClientOptions = {},
): FakeXeroClient {
  const plantPii = options.plantPii ?? false;
  const log: CallLog = {
    readCalls: [],
    mutatingCalls: [],
    unstubbedCalls: [],
  };

  const payloads = buildPayloads(plantPii ? PLANTED_PII : null);

  /*
   * The `accountingApi` reads the 18 retained handlers actually call, each
   * paired with the `.body` collection that handler reads back. Nothing else
   * is stubbed, so a handler reaching for anything beyond this list fails
   * loudly — which is the point: an added read is a deliberate edit here, not
   * a silent pass.
   *
   * Arguments are ignored throughout. These handlers pass tenant id, paging,
   * `where`/`order` and client headers; none of that changes what the fake
   * needs to return, and ignoring it keeps the response shape the only thing
   * under test. Parameters are omitted rather than accepted-and-discarded
   * because JavaScript drops extra arguments anyway.
   */
  const body = (payload: unknown) => () => Promise.resolve({ body: payload });

  const accountingApi: Stubs = {
    // list-accounts
    getAccounts: body({ accounts: payloads.accounts }),
    // list-bank-transactions
    getBankTransactions: body({ bankTransactions: payloads.bankTransactions }),
    // list-contact-groups (both the collection and the single-group read)
    getContactGroups: body({ contactGroups: payloads.contactGroups }),
    getContactGroup: body({ contactGroups: payloads.contactGroups }),
    // list-contacts
    getContacts: body({ contacts: payloads.contacts }),
    // list-credit-notes
    getCreditNotes: body({ creditNotes: payloads.creditNotes }),
    // list-invoices
    getInvoices: body({ invoices: payloads.invoices }),
    // list-items
    getItems: body({ items: payloads.items }),
    // list-manual-journals (both reads)
    getManualJournals: body({ manualJournals: payloads.manualJournals }),
    getManualJournal: body({ manualJournals: payloads.manualJournals }),
    // list-organisation-details, and MCPXeroClient.getShortCode()
    getOrganisations: body({ organisations: payloads.organisations }),
    // list-payments
    getPayments: body({ payments: payloads.payments }),
    // list-quotes
    getQuotes: body({ quotes: payloads.quotes }),
    // list-tax-rates
    getTaxRates: body({ taxRates: payloads.taxRates }),
    // list-tracking-categories
    getTrackingCategories: body({
      trackingCategories: payloads.trackingCategories,
    }),
    // The five report reads. All return `.body.reports[0]`.
    getReportAgedPayablesByContact: body({ reports: payloads.reports }),
    getReportAgedReceivablesByContact: body({ reports: payloads.reports }),
    getReportBalanceSheet: body({ reports: payloads.reports }),
    getReportProfitAndLoss: body({ reports: payloads.reports }),
    getReportTrialBalance: body({ reports: payloads.reports }),
  };

  const clientStubs: Stubs = {
    tenantId: FAKE_TENANT_ID,
    tenants: [],
    accountingApi: createEnforcingSurface("accountingApi", accountingApi, log),
    // Every handler awaits this first. A no-op is correct: the fake holds no
    // credentials and reaches no network, which is exactly why CI can run it
    // with no XERO_* variable set (spec FR11 / NFR5).
    authenticate: () => Promise.resolve(),
    getShortCode: () => Promise.resolve("!wattl"),
  };

  const client = createEnforcingSurface(
    "xeroClient",
    clientStubs,
    log,
  ) as unknown as MCPXeroClient;

  return {
    client,
    readCalls: log.readCalls,
    mutatingCalls: log.mutatingCalls,
    unstubbedCalls: log.unstubbedCalls,
    plantedValues: plantPii ? PLANTED_PII_VALUES : [],
  };
}
