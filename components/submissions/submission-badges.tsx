import { Badge } from "@/components/ui/badge";
import { formTypeTone, submissionTypeLabel } from "@/lib/submissions/origin";
import { submissionStatusTone } from "@/lib/ui/status";
import { submissionStatusLabel } from "@/lib/ui/status-labels";

/**
 * The single source of truth for how a submission reads at a glance (Phase 3C; simplified 3C.2). The type
 * label already encodes the source ("Renter return checklist" / "Staff return checklist" / "Outbound inspection"), so
 * there is NO separate Renter/Staff source badge — one primary type badge, the optional status badge, and the
 * condition Damage/Missing chips. The submissions inbox and the asset timeline both use this component, so
 * they stay in lockstep. No I/O; the caller supplies already-derived flags.
 */
export function SubmissionBadges({
  formType,
  origin,
  status,
  damage = false,
  missing = false,
  showStatus = true,
}: {
  formType: string;
  origin: string | null;
  status: string;
  damage?: boolean;
  missing?: boolean;
  /** Whether to render the status badge. Off where the surface has its own Status column (the inbox). */
  showStatus?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={formTypeTone(formType)}>{submissionTypeLabel(formType, origin)}</Badge>
      {showStatus ? (
        <Badge tone={submissionStatusTone(status)}>{submissionStatusLabel(status)}</Badge>
      ) : null}
      {damage ? <Badge tone="danger">Damage</Badge> : null}
      {missing ? <Badge tone="warning">Missing items</Badge> : null}
    </div>
  );
}
