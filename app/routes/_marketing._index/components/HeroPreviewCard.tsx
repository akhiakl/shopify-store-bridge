import { Badge } from "~/components/ui/Badge";
import { Card } from "~/components/ui/Card";

const rows = [
  { type: "Metafield definitions", result: "4 synced" },
  { type: "Collections", result: "2 synced · 1 already there" },
  { type: "Menus", result: "1 synced" },
  { type: "Checkout styling", result: "Synced" },
] as const;

/**
 * Illustrative mock of a finished sync in job history, not live data:
 * what a merchant sees after copying a few types to a connected store.
 */
export function HeroPreviewCard() {
  return (
    <Card className="w-full max-w-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">Sync to eu-store.myshopify.com</p>
          <p className="text-xs text-neutral-500">Job history · just now</p>
        </div>
        <Badge variant="success">Succeeded</Badge>
      </div>

      <ul className="mt-4 divide-y divide-neutral-200 text-sm">
        {rows.map((row) => (
          <li key={row.type} className="flex justify-between gap-4 py-2">
            <span>{row.type}</span>
            <span className="text-neutral-500">{row.result}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-neutral-500">
        8 items synced, 1 skipped, 0 failed
      </p>
    </Card>
  );
}
