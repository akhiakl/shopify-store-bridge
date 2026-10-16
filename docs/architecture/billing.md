# Billing (#111)

Two plans, billed through Shopify's Billing API (`billing` in `shopify.server.ts`,
constants in `app/utils/billing/plans.ts`):

|                                  | Free                                                        | Pro ($9.99 USD every 30 days, no trial) |
| -------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Connected stores (as the source) | 1                                                           | Unlimited                               |
| Sync types                       | Metafields, metaobjects, collections (definitions and data) | Everything                              |
| Auto-sync                        | No                                                          | Yes                                     |

## Whose plan counts

The **source** store's. It's the one sharing its data, so a target pulling from a source
gets the source's plan. Checked live with the source's own admin
(`isProStore`: `currentAppInstallation.activeSubscriptions`, an active subscription
named `StoreBridge Pro`); a failed read counts as free.

## Where the limits apply

- **Connections**: `requestPairing` refuses a new (or reopened declined) connection when
  a free source already has one that isn't declined.
- **Sync types**: `connectionPageAction` refuses a selection with any Pro-only key
  (`isFreeSelectionKey`) unless the source is on Pro.
- **Auto-sync**: turning it on needs Pro, and `triggerAutoSync` skips a source that's no
  longer on Pro, so cancelling stops auto-sync without touching the switch.

Existing connections and jobs are left alone on downgrade; only new requests are limited.

## Plan page

`/app/plan` shows both plans. "Upgrade to Pro" calls `billing.request`, which redirects to
Shopify's approval page; "Cancel Pro" (after a confirmation) calls `billing.cancel` with
proration. Charges are test charges outside production, or whenever
`SHOPIFY_BILLING_TEST=true` (development stores can't be charged for real).
