import type { DataRequestView } from "../dataRequests.server";
import { dataRequestCsv } from "../utils/dataRequestCsv";

interface DataRequestCardProps {
  request: DataRequestView;
}

function download(request: DataRequestView) {
  const url = URL.createObjectURL(
    new Blob([dataRequestCsv(request.rows)], { type: "text/csv" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `customer-${request.customerId}-storebridge-data.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** One customer's data request: what StoreBridge holds on them, shown in
 * full and exportable as CSV for the merchant to send on. */
export function DataRequestCard({ request }: DataRequestCardProps) {
  const count = request.rows.length;
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack gap="small-100">
        <s-stack direction="inline" gap="small-100" alignItems="center">
          <s-heading>Customer {request.customerId}</s-heading>
          <s-badge tone={count ? "info" : "success"}>
            {count
              ? `${count} record${count === 1 ? "" : "s"}`
              : "No data held"}
          </s-badge>
        </s-stack>
        <s-paragraph>
          Requested {new Date(request.receivedAt).toLocaleString()}
        </s-paragraph>
        {count === 0 ? (
          <s-paragraph>
            StoreBridge holds no data on this customer. Nothing needs to be
            sent.
          </s-paragraph>
        ) : (
          <>
            {request.rows.map((row, index) => (
              <s-paragraph key={index}>
                {new Date(row.syncedAt).toLocaleString()}: {row.metafield} to{" "}
                {row.targetShop}, {row.status.toLowerCase()}
                {row.errorMessage ? ` (${row.errorMessage})` : ""}
              </s-paragraph>
            ))}
            <s-button onClick={() => download(request)}>Download CSV</s-button>
          </>
        )}
      </s-stack>
    </s-box>
  );
}
