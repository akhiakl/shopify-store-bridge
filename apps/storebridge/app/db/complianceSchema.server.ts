import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { serviceRoleOnly } from "./rls.server";

// Compliance domain: what Shopify's privacy webhooks ask StoreBridge to
// keep track of. Separate from the pairing and sync-job schemas because
// nothing there references it.

/**
 * One `customers/data_request` webhook, kept so the merchant can see and
 * export what StoreBridge holds on that customer (app.data-requests.tsx).
 * Keyed by `shop` rather than a `Store` foreign key, since a request can
 * arrive for a shop that never paired a store. Only the customer's ID is
 * stored, never the email the payload carries. Deleted by
 * customers/redact for that customer and by shop/redact for the shop.
 */
export const customerDataRequests = pgTable(
  "CustomerDataRequest",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    shop: text("shop").notNull(),
    customerId: text("customerId").notNull(),
    /** Shopify's ID for the request; webhooks can be redelivered. */
    dataRequestId: text("dataRequestId").notNull(),
    receivedAt: timestamp("receivedAt", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("CustomerDataRequest_shop_dataRequestId_key").on(
      table.shop,
      table.dataRequestId,
    ),
    serviceRoleOnly("CustomerDataRequest"),
  ],
).enableRLS();
