import type { CustomerDataRow } from "../dataRequests.server";

const HEADER = ["Synced at", "Target store", "Metafield", "Status", "Note"];

/** Quotes every cell, doubling embedded quotes (RFC 4180). */
function cell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** The rows held on one customer, as CSV for the merchant to send on. */
export function dataRequestCsv(rows: CustomerDataRow[]): string {
  const lines = rows.map((row) =>
    [
      new Date(row.syncedAt).toISOString(),
      row.targetShop,
      row.metafield,
      row.status,
      row.errorMessage ?? "",
    ]
      .map(cell)
      .join(","),
  );
  return [HEADER.map(cell).join(","), ...lines].join("\n");
}
