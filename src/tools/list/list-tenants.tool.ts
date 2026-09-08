import { listXeroConnections } from "../../handlers/list-xero-connections.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListTenantsTool = CreateXeroTool(
  "list-tenants",
  `List the Xero organisations this connection is authorised to read.
Returns each organisation's tenant id and name.
Call this first when you do not already know the tenant id, or whenever another tool reports that a tenantId is required because several organisations are authorised.
Pass the tenant id you want as the tenantId parameter of any other tool.
This server never chooses an organisation on your behalf, so with more than one authorised organisation every read must name the one it means.`,
  {},
  async () => {
    const response = await listXeroConnections();

    if (response.error !== null) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing tenants: ${response.error}`,
          },
        ],
      };
    }

    const tenants = response.result ?? [];

    if (tenants.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "This connection is not authorised for any Xero organisation. " +
              "Authorise the app against an organisation in Xero, then try again.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Authorised for ${tenants.length} Xero ` +
            `${tenants.length === 1 ? "organisation" : "organisations"}:`,
        },
        ...tenants.map((tenant) => ({
          type: "text" as const,
          text: [
            `Organisation: ${tenant.tenantName}`,
            `Tenant ID: ${tenant.tenantId}`,
            `Type: ${tenant.tenantType}`,
          ].join("\n"),
        })),
        {
          type: "text" as const,
          text:
            tenants.length === 1
              ? "Only one organisation is authorised, so tenantId is optional on other tools."
              : "Several organisations are authorised, so other tools require a tenantId.",
        },
      ],
    };
  },
);

export default ListTenantsTool;
