import { Badge } from "@/components/ui/badge";
import {
  formTypeTone,
  submissionSourceBadge,
  submissionTypeLabel,
} from "@/lib/submissions/origin";
import { submissionStatusTone } from "@/lib/ui/status";
import { submissionStatusLabel } from "@/lib/ui/status-labels";

/**
 * The single source of truth for how a submission reads at a glance (Phase 3C). Renders the type badge +
 * Renter/Staff source badge + status badge + optional Damage/Missing chips, so the submissions inbox and the
 * asset timeline speak the exact same visual language. No I/O; the caller supplies already-derived flags.
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
  const source = submissionSourceBadge(formType, origin);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={formTypeTone(formType)}>{submissionTypeLabel(formType, origin)}</Badge>
      {source ? <Badge tone={source.tone}>{source.label}</Badge> : null}
      {showStatus ? (
        <Badge tone={submissionStatusTone(status)}>{submissionStatusLabel(status)}</Badge>
      ) : null}
      {damage ? <Badge tone="danger">Damage</Badge> : null}
      {missing ? <Badge tone="warning">Missing items</Badge> : null}
    </div>
  );
}
