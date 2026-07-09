import { Badge } from "@/components/ui/badge";
import {
  readinessReasonLabel,
  type AssetStatusView,
} from "@/lib/ui/status-view";

/**
 * The single readiness indicator: a green "Ready" dot when live and scannable, otherwise an
 * amber chip showing the primary blocking reason (all reasons on hover). Shared by the assets
 * table and the platform production view so readiness reads identically on both.
 */
export function ReadinessIndicator({
  readiness,
}: {
  readiness: AssetStatusView["readiness"];
}) {
  if (readiness.ready) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        title="Live and scannable"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        Ready
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning"
      title={readiness.reasons.map(readinessReasonLabel).join(", ")}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      {readiness.reason ? readinessReasonLabel(readiness.reason) : "Not ready"}
    </span>
  );
}

/**
 * Standardized asset status display (A2, admin only). Renders the design-system status rule:
 * ONE rental badge + ONE readiness indicator + a lock for private — never a badge pile. An
 * archived asset shows the rental badge and a quiet "Archived" tag (readiness/visibility are
 * irrelevant once archived). Fed by `deriveAssetStatus` (lib/ui/status-view).
 */
export function AssetStatusCell({ status }: { status: AssetStatusView }) {
  const { rentalState, readiness, visibility } = status;

  const rental = (
    <Badge tone={rentalState === "rented" ? "warning" : "neutral"}>
      {rentalState === "rented" ? "Rented" : "Available"}
    </Badge>
  );

  if (visibility === "archived") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {rental}
        <span className="text-xs text-muted-foreground">Archived</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {rental}
      <ReadinessIndicator readiness={readiness} />
      {visibility === "private" ? (
        <span
          className="inline-flex text-muted-foreground"
          title="Private — not shown on the public page"
          aria-label="Private"
        >
          <LockIcon />
        </span>
      ) : null}
    </div>
  );
}

/** Small line-weight lock (inline SVG — no icon dependency). */
function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
