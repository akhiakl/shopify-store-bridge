import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

type SyncActionData =
  { ok: true; jobId: string; status: string } | { ok: false; error: string };

interface SyncButtonProps {
  selected: Set<string>;
  approvedTargetCount: number;
}

/**
 * Submits the current checkbox selection as a "Sync now" job — replaces
 * the old disabled "Migrate selected (coming soon)" button. Each selected
 * key goes as its own hidden `selection` input (`formData.getAll` on the
 * server) rather than one JSON-encoded field; the keys themselves are
 * already the plain strings the checkboxes use, so there's nothing to
 * gain from encoding them.
 */
export function SyncButton({ selected, approvedTargetCount }: SyncButtonProps) {
  const fetcher = useFetcher<SyncActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state !== "idle";
  const data = fetcher.data;

  useEffect(() => {
    if (data?.ok) formRef.current?.reset();
  }, [data]);

  const disabled = selected.size === 0 || approvedTargetCount === 0;

  return (
    <s-stack gap="base">
      {data && !data.ok && (
        <s-banner tone="critical" heading={data.error}></s-banner>
      )}
      {data?.ok && (
        <s-banner
          tone={
            data.status === "FAILED"
              ? "critical"
              : data.status === "PARTIAL"
                ? "warning"
                : "success"
          }
          heading={`Sync ${data.status.toLowerCase()}`}
        ></s-banner>
      )}
      <fetcher.Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value="sync" />
        {[...selected].map((key) => (
          <input key={key} type="hidden" name="selection" value={key} />
        ))}
        <s-stack gap="small-100">
          <s-paragraph>
            {selected.size} definition(s) selected · {approvedTargetCount}{" "}
            approved target(s)
          </s-paragraph>
          <s-button
            type="submit"
            variant="primary"
            disabled={disabled}
            loading={isSubmitting}
          >
            Sync now
          </s-button>
        </s-stack>
      </fetcher.Form>
    </s-stack>
  );
}
