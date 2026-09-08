import ListAccountsTool from "./list-accounts.tool.js";
import ListAgedPayablesByContact from "./list-aged-payables-by-contact.tool.js";
import ListAgedReceivablesByContact
  from "./list-aged-receivables-by-contact.tool.js";
import ListBankTransactionsTool from "./list-bank-transactions.tool.js";
import ListContactGroupsTool from "./list-contact-groups.tool.js";
import ListContactsTool from "./list-contacts.tool.js";
import ListCreditNotesTool from "./list-credit-notes.tool.js";
import ListInvoicesTool from "./list-invoices.tool.js";
import ListItemsTool from "./list-items.tool.js";
import ListManualJournalsTool from "./list-manual-journals.tool.js";
import ListOrganisationDetailsTool from "./list-organisation-details.tool.js";
import ListPaymentsTool from "./list-payments.tool.js";
import ListProfitAndLossTool from "./list-profit-and-loss.tool.js";
import ListQuotesTool from "./list-quotes.tool.js";
import ListReportBalanceSheetTool from "./list-report-balance-sheet.tool.js";
import ListTaxRatesTool from "./list-tax-rates.tool.js";
import ListTrackingCategoriesTool from "./list-tracking-categories.tool.js";
import ListTrialBalanceTool from "./list-trial-balance.tool.js";

/**
 * The 18 accounting read tools this fork retains.
 *
 * The upstream server's payroll tools all reached Xero's New Zealand payroll
 * API, so none of them could answer an Australian question — which is the gap
 * this repo exists to fill. They were removed in change 001 rather than
 * carried as dead surface. See
 * .specclaw/changes/001-fork-strip-writes-guards/design.md decision D4.
 *
 * The NZ API identifier is deliberately not spelled out above: spec AC3 is a
 * literal `grep -rn` over src/ for it, and a prose mention would trip a check
 * whose whole purpose is to prove there is no remaining call site.
 *
 * Payroll AU tools arrive in a later change and register here alongside
 * these. Every tool on this list is read-only, and Guard A proves that by
 * capability rather than by name.
 */
export const ListTools = [
  ListAccountsTool,
  ListAgedPayablesByContact,
  ListAgedReceivablesByContact,
  ListBankTransactionsTool,
  ListContactGroupsTool,
  ListContactsTool,
  ListCreditNotesTool,
  ListInvoicesTool,
  ListItemsTool,
  ListManualJournalsTool,
  ListOrganisationDetailsTool,
  ListPaymentsTool,
  ListProfitAndLossTool,
  ListQuotesTool,
  ListReportBalanceSheetTool,
  ListTaxRatesTool,
  ListTrackingCategoriesTool,
  ListTrialBalanceTool,
];
