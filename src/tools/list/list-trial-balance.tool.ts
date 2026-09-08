import { z } from "zod";
import { listXeroTrialBalance } from "../../handlers/list-xero-trial-balance.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatReportRows } from "../../helpers/format-report-rows.js";
import {
  resolveTenantForTool,
  tenantIdArg,
} from "../../helpers/tenant-arg.js";

const ListTrialBalanceTool = CreateXeroTool(
  "list-trial-balance",
  "Lists trial balance in Xero. This provides a snapshot of the general ledger, showing debit and credit balances for each account.",
  {
    ...tenantIdArg,
    date: z.string().optional().describe("Optional date in YYYY-MM-DD format"),
    paymentsOnly: z.boolean().optional().describe("Optional flag to include only accounts with payments"),
  },
  async (args) => {
    const resolved = await resolveTenantForTool(args?.tenantId, "trial balance");
    if (!resolved.ok) return resolved.result;

    const response = await listXeroTrialBalance(resolved.tenant.tenantId, args?.date, args?.paymentsOnly);
    if (response.error !== null) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing trial balance: ${response.error}`,
          },
        ],
      };
    }

   const trialBalanceReport = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Trial Balance Report: ${trialBalanceReport?.reportName || "Unnamed"} in ${resolved.tenant.tenantName}`,
        },
        {
          type: "text" as const,
          text: `Date: ${trialBalanceReport?.reportDate || "Not specified"}`,
        },
        {
          type: "text" as const,
          text: `Updated At: ${trialBalanceReport?.updatedDateUTC ? trialBalanceReport.updatedDateUTC.toISOString() : "Unknown"}`,
        },
        {
          type: "text" as const,
          text: formatReportRows(trialBalanceReport.rows),
        },
      ],
    };
  },
);

export default ListTrialBalanceTool; 