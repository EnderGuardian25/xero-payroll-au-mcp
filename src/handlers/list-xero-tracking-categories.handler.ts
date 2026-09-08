import { xeroClient } from "../clients/xero-client.js";
import { TrackingCategory } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

async function getTrackingCategories(
  tenantId: string,
  includeArchived?: boolean
): Promise<TrackingCategory[]> {
  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getTrackingCategories(
    tenantId, // xeroTenantId
    undefined, // where
    undefined, // order
    includeArchived, // includeArchived
    getClientHeaders()
  );

  return response.body.trackingCategories ?? [];
}

export async function listXeroTrackingCategories(
  tenantId: string,
  includeArchived?: boolean
): Promise<XeroClientResponse<TrackingCategory[]>> {
  try {
    const trackingCategories = await getTrackingCategories(tenantId, includeArchived);

    return {
      result: trackingCategories,
      isError: false,
      error: null
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error)
    };
  }
}