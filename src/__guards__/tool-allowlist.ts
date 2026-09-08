/**
 * The tools this server is known to register, and the handler each one calls.
 *
 * ## This list is a tripwire, NOT proof that a tool is read-only
 *
 * Read that again before relying on it. An entry here records only that
 * somebody typed a string. It verifies nothing about what the tool does.
 *
 * The adversarial review of change 001 landed on this point from four
 * independent directions, and it is the reason Guard A does not work the way
 * an earlier draft proposed. A name-keyed allowlist closes the *new tool*
 * hole and leaves the *changed tool* hole wide open: once `list-invoices` is
 * on this list, its handler can be edited to issue a POST and a name check
 * stays green forever. Worse, the string it checks is controlled by exactly
 * the contributor the guard exists to stop, so the reviewed party would be
 * authoring the verdict.
 *
 * So what this list actually buys is narrow and worth stating exactly:
 *
 *   - a tool appearing in the registry that is absent here fails the build,
 *     which forces a *deliberate* edit rather than a silent addition
 *   - an entry here whose tool is gone from the registry also fails the
 *     build, so a stale approval cannot outlive the tool it approved
 *
 * Both directions matter — the match is exact, not a subset test in either
 * direction (spec FR6e).
 *
 * What proves read-only is the capability evidence in
 * `guard-a-readonly.test.ts`: the absent write directories, the absence of
 * any mutating Xero API call site, no handler importing the SDK directly, and
 * every registered tool driven against a fake client that throws on any
 * non-read call. That is the guard. This is the tripwire.
 *
 * ## Adding a tool
 *
 * Adding a name here is not an approval step and must never be treated as
 * one. If CI is red because a tool is missing from this list, the question to
 * answer is whether the tool should exist at all — not how to make the build
 * green. See design.md decision D1.
 *
 * `handler` is recorded so a rename is a visible two-line edit rather than a
 * silent pass.
 */
export interface RegisteredTool {
  name: string;
  handler: string;
}

export const TOOL_ALLOWLIST: readonly RegisteredTool[] = [
  {
    name: "list-accounts",
    handler: "src/handlers/list-xero-accounts.handler.ts",
  },
  {
    name: "list-aged-payables-by-contact",
    handler: "src/handlers/list-aged-payables-by-contact.handler.ts",
  },
  {
    name: "list-aged-receivables-by-contact",
    handler: "src/handlers/list-aged-receivables-by-contact.handler.ts",
  },
  {
    name: "list-bank-transactions",
    handler: "src/handlers/list-xero-bank-transactions.handler.ts",
  },
  {
    name: "list-contact-groups",
    handler: "src/handlers/list-xero-contact-groups.handler.ts",
  },
  {
    name: "list-contacts",
    handler: "src/handlers/list-xero-contacts.handler.ts",
  },
  {
    name: "list-credit-notes",
    handler: "src/handlers/list-xero-credit-notes.handler.ts",
  },
  {
    name: "list-invoices",
    handler: "src/handlers/list-xero-invoices.handler.ts",
  },
  {
    name: "list-items",
    handler: "src/handlers/list-xero-items.handler.ts",
  },
  {
    name: "list-manual-journals",
    handler: "src/handlers/list-xero-manual-journals.handler.ts",
  },
  {
    name: "list-organisation-details",
    handler: "src/handlers/list-xero-organisation-details.handler.ts",
  },
  {
    name: "list-payments",
    handler: "src/handlers/list-xero-payments.handler.ts",
  },
  {
    name: "list-profit-and-loss",
    handler: "src/handlers/list-xero-profit-and-loss.handler.ts",
  },
  {
    name: "list-quotes",
    handler: "src/handlers/list-xero-quotes.handler.ts",
  },
  {
    name: "list-report-balance-sheet",
    handler: "src/handlers/list-xero-report-balance-sheet.handler.ts",
  },
  {
    name: "list-tax-rates",
    handler: "src/handlers/list-xero-tax-rates.handler.ts",
  },
  {
    name: "list-tracking-categories",
    handler: "src/handlers/list-xero-tracking-categories.handler.ts",
  },
  {
    name: "list-trial-balance",
    handler: "src/handlers/list-xero-trial-balance.handler.ts",
  },
];

/** Convenience view for the exact-match assertion in Guard A. */
export const TOOL_ALLOWLIST_NAMES: readonly string[] = TOOL_ALLOWLIST.map(
  (t) => t.name,
);
