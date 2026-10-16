import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { DrizzleSessionStoragePostgres } from "@shopify/shopify-app-session-storage-drizzle";

import db from "~/db.server";
import { sessions } from "~/db/schema.server";
import { PRO_PLAN, PRO_PRICE_USD, PRO_TRIAL_DAYS } from "~/utils/billing/plans";

const storage = new DrizzleSessionStoragePostgres(db, sessions);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: storage,
  distribution: AppDistribution.AppStore,
  // Online tokens alongside the offline ones (the template manages both),
  // so a request knows which staff member made it (#69). Background work
  // still uses the offline token via `unauthenticated.admin`.
  useOnlineTokens: true,
  billing: {
    [PRO_PLAN]: {
      trialDays: PRO_TRIAL_DAYS,
      lineItems: [
        {
          amount: PRO_PRICE_USD,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
