"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { isTagRequestStatus } from "@/lib/tags/tag-requests";
import { planTagRequestUpdate } from "@/lib/tags/status-transition";
import { scheduleTagStatusNotification } from "@/lib/notifications/schedule";

export type TagRequestOwnerState = { error?: string };

/**
 * Platform-owner action: update a tag request's status and internal production notes. RLS already restricts UPDATE
 * to the platform owner; `requireRole` is the route-level gate.
 *
 * Engineering Phase D3A (F5): the customer is emailed only when the PERSISTED status actually changes — a notes-only
 * or same-status save sends nothing, however long after the last email. `delivered_at` is stamped only on a real
 * change into `delivered` (lib/tags/status-transition.ts). The update is guarded on the status read just before it,
 * so a concurrent change is reported instead of producing a transition that never happened. The email is scheduled
 * after the response, so a mail failure can never make a saved update look failed.
 */
export async function updateTagRequest(
  tagRequestId: string,
  _prev: TagRequestOwnerState,
  formData: FormData
): Promise<TagRequestOwnerState> {
  await requireRole(ROLES.PLATFORM_OWNER);

  const status = formData.get("status");
  if (typeof status !== "string" || !isTagRequestStatus(status)) {
    return { error: "Choose a valid status." };
  }
  const notesRaw = formData.get("production_notes");
  const productionNotes =
    typeof notesRaw === "string" && notesRaw.trim().length > 0
      ? notesRaw.trim()
      : null;

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("tag_requests")
    .select("id, status")
    .eq("id", tagRequestId)
    .maybeSingle();
  if (readError) return { error: "Could not update the tag request." };
  if (!current) return { error: "Tag request not found." };

  const previousStatus = current.status as string;
  const plan = planTagRequestUpdate({
    currentStatus: previousStatus,
    submittedStatus: status,
    productionNotes,
    now: new Date(),
  });

  const { data, error } = await supabase
    .from("tag_requests")
    .update(plan.update)
    .eq("id", tagRequestId)
    .eq("status", previousStatus)
    .select("id, organization_id, status, updated_at")
    .maybeSingle();

  if (error) return { error: "Could not update the tag request." };
  if (!data) {
    return { error: "This tag request changed while you were editing. Reload and try again." };
  }

  if (plan.statusChanged) {
    scheduleTagStatusNotification({
      organizationId: data.organization_id as string,
      tagRequestId,
      fromStatus: previousStatus,
      toStatus: data.status as string,
      changedAt: data.updated_at as string,
    });
  }

  redirect(`/owner/tag-requests/${tagRequestId}`);
}
