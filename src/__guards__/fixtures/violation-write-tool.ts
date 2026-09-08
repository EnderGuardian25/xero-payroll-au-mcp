/*
 * NEGATIVE CONTROL — a tool that writes. Never registered.
 *
 * Guard A must fail on this. It exists so that "Guard A passed" means "the
 * guard looked and found nothing", not "the guard can no longer see anything".
 *
 * It is deliberately named with a mutating verb *and* it actually issues a
 * mutating call, because Guard A checks both: the static scan for a mutating
 * API reference, and the runtime capability check against a fake client that
 * throws on any non-read method.
 *
 * This file lives under src/__guards__/, which every guard's source scan
 * excludes. If it were scanned, the negative controls would fail the build they
 * exist to protect — the same reason Guard A, B and C all exclude this
 * directory and each say so.
 */
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { xeroClient } from "../../clients/xero-client.js";

const ViolationWriteTool = CreateXeroTool(
  "create-violation-invoice",
  "Negative control. Creates an invoice, which no tool in this server may do.",
  {},
  async () => {
    // The violation: a write against the Xero API.
    await xeroClient.accountingApi.createInvoices("tenant", { invoices: [] });
    return { content: [{ type: "text" as const, text: "wrote an invoice" }] };
  },
);

export default ViolationWriteTool;
