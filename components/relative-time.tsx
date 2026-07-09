"use client";

import { useEffect, useState } from "react";

import { formatAbsolute, formatRelative } from "@/lib/ui/time";

/**
 * Renders a timestamp as compact relative text ("2h ago") with the absolute local time on hover
 * (native `title`) — the design-system timestamp rule. A `<time>` element carries the machine
 * `dateTime`. The relative text recomputes on mount and stays fresh; SSR renders a first pass and
 * the client reconciles (suppressHydrationWarning covers the expected now-based difference).
 */
export function RelativeTime({
  value,
  className,
}: {
  value: string | number | Date | null | undefined;
  className?: string;
}) {
  const iso =
    value == null
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : String(value);

  // A minute tick keeps "2h ago" fresh on long-lived pages; the text itself is derived from
  // `value` on every render, so it also tracks prop changes. SSR renders with the server clock
  // and the client reconciles on hydration (suppressHydrationWarning covers that expected diff).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <time
      dateTime={iso || undefined}
      title={formatAbsolute(value, { withTime: true })}
      className={className}
      suppressHydrationWarning
    >
      {formatRelative(value)}
    </time>
  );
}
