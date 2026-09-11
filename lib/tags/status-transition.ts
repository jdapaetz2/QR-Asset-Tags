/**
 * Engineering Phase D3A — what an owner save of a tag request actually changes. Pure, no I/O.
 *
 * A save always writes the submitted status and production notes. It is a STATUS CHANGE only when the persisted
 * status differs from the submitted one; only a change notifies the customer (F5). `delivered_at` records the most
 * recent real delivery: it is stamped when the status changes INTO `delivered`, never by a notes-only or same-status
 * save, and never cleared when a request later leaves `delivered` (operator decision, D3A).
 */
import type { TagRequestStatus } from "@/lib/tags/tag-requests";

export type TagRequestUpdate = {
  status: TagRequestStatus;
  production_notes: string | null;
  delivered_at?: string;
};

export type TagRequestUpdatePlan = { update: TagRequestUpdate; statusChanged: boolean };

export function planTagRequestUpdate(input: {
  currentStatus: string;
  submittedStatus: TagRequestStatus;
  productionNotes: string | null;
  now: Date;
}): TagRequestUpdatePlan {
  const statusChanged = input.currentStatus !== input.submittedStatus;
  const update: TagRequestUpdate = { status: input.submittedStatus, production_notes: input.productionNotes };
  if (statusChanged && input.submittedStatus === "delivered") update.delivered_at = input.now.toISOString();
  return { update, statusChanged };
}
