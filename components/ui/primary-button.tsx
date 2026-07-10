import Link from "next/link";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * PrimaryButton — the chamfered R-cut primary action (docs/brand/ui-language.md):
 * 30px, brass fill, bone text, a top-left corner cut. Rules: primary actions
 * only, at most one visible per view region, never on secondary/ghost buttons,
 * never on tenant scan pages.
 *
 * KILL SWITCH — this is one component. Flip `CHAMFER` to false to remove the
 * clip-path + radius override everywhere and revert the whole system to the
 * ordinary platform primary button (standard corners).
 */
export const CHAMFER = true;

const CHAMFER_STYLE: React.CSSProperties = {
  clipPath: "polygon(7px 0, 100% 0, 100% 100%, 0 100%, 0 7px)",
  borderRadius: "0 7px 7px 7px",
};

const chamferClass =
  "inline-flex h-[30px] items-center justify-center gap-1.5 bg-brass-500 px-3.5 text-[13px] font-semibold text-bone-50 transition-colors hover:bg-brass-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-500/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** When set, renders a Link with the same treatment (for navigation actions). */
  href?: string;
  children: React.ReactNode;
};

export function PrimaryButton({
  href,
  className,
  children,
  ...rest
}: PrimaryButtonProps) {
  // Kill switch off → ordinary platform primary button (standard corners).
  if (!CHAMFER) {
    if (href) {
      return (
        <Button asChild className={className}>
          <Link href={href}>{children}</Link>
        </Button>
      );
    }
    return (
      <Button className={className} {...rest}>
        {children}
      </Button>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        className={cn(chamferClass, className)}
        style={CHAMFER_STYLE}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      className={cn(chamferClass, className)}
      style={CHAMFER_STYLE}
      {...rest}
    >
      {children}
    </button>
  );
}
