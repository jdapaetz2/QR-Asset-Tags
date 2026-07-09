import { cn } from "@/lib/utils";

/**
 * Section eyebrow — the standardized small label above a section or stat
 * ("QUICK START", "WHAT IT DOES"): 11px, uppercase, ~+6% tracking, iron-600.
 * See the `product-design-system` skill. Renders a `<p>` by default; pass `as`
 * to keep heading semantics where the label is also a heading.
 */
export function Eyebrow({
  children,
  className,
  as: Tag = "p",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "p" | "h2" | "h3" | "span" | "div";
}) {
  return (
    <Tag
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.06em] text-iron-600",
        className
      )}
    >
      {children}
    </Tag>
  );
}
