import { cn } from "@/lib/utils";

/**
 * PlateLabel — the nameplate eyebrow on iron surfaces (docs/brand/ui-language.md).
 * Rivet ring (8px, 1.5px brass border, transparent center) + brass letterspaced
 * label, with an optional right-aligned mono meta stamp (e.g. the local date).
 * Iron surfaces only; bone surfaces use <Eyebrow>.
 */
export function PlateLabel({
  label,
  meta,
  className,
}: {
  label: string;
  meta?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="inline-flex items-center gap-2">
        {/* Rivet ring: transparent center — do not fill. */}
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full border-[1.5px] border-brass-500"
        />
        <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-brass-label">
          {label}
        </span>
      </span>
      {meta ? (
        <span className="font-mono text-[11px] text-mono-meta">{meta}</span>
      ) : null}
    </div>
  );
}
