import { cn } from "@/lib/utils";

/**
 * AssetCodeChip — the one signature device (BRAND.md rule 4). Renders an asset code as a
 * small stamped-tag chip: 1px iron-200 border, 6px radius, a ring-style rivet-hole detail at
 * the left (a ring whose center is transparent — never filled, echoing the glyph + the real
 * drilled tag), and the code in JetBrains Mono. **Admin surfaces only** — never rendered on
 * public `/t/` or `/forms/` routes, where codes are plain system-mono text.
 *
 * `readiness` is an optional status dot for surfaces that already carry that state; omit it to
 * show just the code (the default for A1).
 */
export function AssetCodeChip({
  code,
  readiness = "none",
  className,
}: {
  code: string;
  readiness?: "ready" | "attention" | "none";
  className?: string;
}) {
  return (
    <span
      className={cn(
        // Reference `.chip` (docs/brand/dashboard-reference.html): bone surface,
        // 7px radius, 1px iron-200 border, 7px gap, asymmetric 8/10 padding.
        "inline-flex items-center gap-[7px] rounded-[7px] border border-iron-200 bg-bone-50 py-[3px] pl-2 pr-2.5 leading-none",
        className
      )}
    >
      {/* Rivet hole: a 7px ring with a transparent center — do not fill. */}
      <span
        aria-hidden
        className="size-[7px] shrink-0 rounded-full border-[1.5px] border-iron-600"
      />
      <span className="font-mono text-xs tracking-tight text-foreground">{code}</span>
      {readiness !== "none" ? (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            readiness === "ready" ? "bg-success" : "bg-warning"
          )}
        />
      ) : null}
    </span>
  );
}
