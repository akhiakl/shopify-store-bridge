import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-mono uppercase tracking-wide",
  {
    variants: {
      variant: {
        outline: "border-neutral-300 text-neutral-600",
        success: "border-green-300 bg-green-50 text-green-700",
        pending: "border-amber-300 bg-amber-50 text-amber-700",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
