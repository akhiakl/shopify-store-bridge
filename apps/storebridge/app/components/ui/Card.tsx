import * as React from "react";

import { cn } from "~/utils/cn";

/** Generic bordered surface used across marketing-site sections. */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
