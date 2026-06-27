import * as React from "react";

import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/ui/status";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-border text-muted-foreground",
  success: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/40 text-amber-700 dark:text-amber-500",
  danger: "border-destructive/40 text-destructive",
  info: "border-sky-500/40 text-sky-700 dark:text-sky-400",
};

/** Small status pill. Visual only — `tone` is chosen by the caller (see lib/ui/status). */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  );
}
