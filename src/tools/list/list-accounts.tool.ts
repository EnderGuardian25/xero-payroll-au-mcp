import { listXeroAccounts } from "../../handlers/list-xero-accounts.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import {
  resolveTenantForTool,
  tenantIdArg,
} from "../../helpers/tenant-arg.js";

const ListAccountsTool = CreateXeroTool(
  "list-accounts",
  "Lists all accounts in Xero. Use this tool to get the account codes and names to be used when creating invoices in Xero",
  {
    ...tenantIdArg,
  },
  async ({ tenantId }) => {
    const resolved = await resolveTenantForTool(tenantId, "accounts");
    if (!resolved.ok) return resolved.result;

    const response = await listXeroAccounts(resolved.tenant.tenantId);
    if (response.error !== null) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing accounts: ${response.error}`,
          },
        ],
      };
    }

    const accounts = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${accounts?.length || 0} accounts in ${resolved.tenant.tenantName}:`,
        },
        ...(accounts?.map((account) => ({
          type: "text" as const,
          text: [
            `Account: ${account.name || "Unnamed"}`,
            `Code: ${account.code || "No code"}`,
            `ID: ${account.accountID || "No ID"}`,
            `Type: ${account.type || "Unknown type"}`,
            `Status: ${account.status || "Unknown status"}`,
            account.description ? `Description: ${account.description}` : null,
            account.taxType ? `Tax Type: ${account.taxType}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })) || []),
      ],
    };
  },
);

export default ListAccountsTool;
