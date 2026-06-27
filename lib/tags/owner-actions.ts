"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { isTagRequestStatus } from "@/lib/tags/tag-requests";
import { notifyTagRequestStatus } from "@/lib/notifications/notify";

export type TagRequestOwnerState = { error?: string };

/**
 * Platform-owner action: update a tag request's status and internal production
 * notes. RLS already restricts UPDATE to the platform owner; `requireRole` is the
 * route-level gate. `delivered_at` is stamped when the request is delivered.
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
  const production_notes =
    typeof notesRaw === "string" && notesRaw.trim().length > 0
      ? notesRaw.trim()
      : null;

  const update: Record<string, unknown> = { status, production_notes };
  if (status === "delivered") update.delivered_at = new Date().toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tag_requests")
    .update(update)
    .eq("id", tagRequestId)
    .select("id, organization_id, status")
    .maybeSingle();

  if (error) return { error: "Could not update the tag request." };
  if (!data) return { error: "Tag request not found." };

  // Best-effort customer email alert. notifyTagRequestStatus swallows its own
  // errors, so a notification failure can never block the status update.
  await notifyTagRequestStatus({
    organizationId: data.organization_id as string,
    status: data.status as string,
  });

  redirect(`/owner/tag-requests/${tagRequestId}`);
}
