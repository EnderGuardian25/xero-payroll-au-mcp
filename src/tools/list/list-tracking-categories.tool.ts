import { z } from "zod";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { listXeroTrackingCategories } from "../../handlers/list-xero-tracking-categories.handler.js";
import { formatTrackingOption } from "../../helpers/format-tracking-option.js";
import {
  resolveTenantForTool,
  tenantIdArg,
} from "../../helpers/tenant-arg.js";

const ListTrackingCategoriesTool = CreateXeroTool(
  "list-tracking-categories",
  "List all tracking categories in Xero, along with their associated tracking options.",
  {
    ...tenantIdArg,
    includeArchived: z.boolean().optional()
      .describe("Determines whether or not archived categories will be returned. By default, no archived categories will be returned.")
  },
  async ({ tenantId, includeArchived }) => {
    const resolved = await resolveTenantForTool(tenantId, "tracking categories");
    if (!resolved.ok) return resolved.result;

    const response = await listXeroTrackingCategories(resolved.tenant.tenantId, includeArchived);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing tracking categories: ${response.error}`
          }
        ]
      };
    }

    const trackingCategories = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${trackingCategories?.length || 0} tracking categories in ${resolved.tenant.tenantName}:`
        },
        ...(trackingCategories?.map((category) => ({
          type: "text" as const,
          text: [
            `Tracking Category ID: ${category.trackingCategoryID}`,
            `Name: ${category.name}`,
            `Status: ${category.status}`,
            `Found ${category.options?.length || 0} tracking options:\n${category.options?.map(formatTrackingOption)}`
          ].filter(Boolean).join("\n")
        })) || [])
      ]
    };
  }
);

export default ListTrackingCategoriesTool;