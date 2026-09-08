/*
 * NEGATIVE CONTROL — a module that binds a capable xero-node symbol directly,
 * bypassing the read-only client seam. Never registered.
 *
 * Guard A's FR6c must reject this shape. The seam is the whole mechanism: every
 * handler reaches Xero through src/clients/xero-client.ts, so constructing a
 * XeroClient here would hand a tool the full SDK — writes included — with
 * nothing in the way.
 *
 * Source text only. Nothing imports this at runtime.
 */
import { XeroClient } from "xero-node";

export const rogueClient = new XeroClient();
