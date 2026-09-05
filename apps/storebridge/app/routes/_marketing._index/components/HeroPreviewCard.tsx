import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card } from "~/components/ui/Card";

/**
 * Illustrative mock of a definition-sync review — not live data. Shows what
 * a target-store reviewer sees before a metaobject definition change ships,
 * mirroring the "pairing approved before anything syncs" feature.
 */
export function HeroPreviewCard() {
  return (
    <div className="relative">
      <span className="absolute -top-4 right-4 rotate-6 rounded border-2 border-green-600 px-2 py-1 font-mono text-xs font-bold uppercase text-green-600">
        Approved
      </span>
      <Card className="w-full max-w-sm p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">Color Swatch</p>
            <p className="text-xs text-neutral-500">
              Definition #58 · from source-shop.myshopify.com
            </p>
          </div>
          <Badge variant="pending">Pending review</Badge>
        </div>

        <div className="mt-4 space-y-1 text-sm">
          <p className="font-mono text-xs uppercase text-neutral-400">
            Fields added
          </p>
          <p className="rounded bg-green-50 px-2 py-1 font-mono text-green-700">
            + Hex value (single_line_text_field)
          </p>
          <p className="rounded bg-green-50 px-2 py-1 font-mono text-green-700">
            + Swatch image (file_reference)
          </p>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          Unchanged: label, position — 3 other fields hidden from review
        </p>

        <div className="mt-4 flex justify-end gap-2 border-t border-neutral-200 pt-4">
          <Button variant="outline" size="sm" type="button">
            Send back
          </Button>
          <Button size="sm" type="button">
            Approve &amp; sync
          </Button>
        </div>
      </Card>
    </div>
  );
}
