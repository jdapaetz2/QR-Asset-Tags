import { cn } from "@/lib/utils";

/**
 * BandRule — the single 2px brass line that closes the bottom edge of an iron
 * band (docs/brand/ui-language.md). One per band, full width; no other
 * decorative rules on iron.
 */
export function BandRule({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("h-0.5 w-full bg-brass-500", className)} />
  );
}
