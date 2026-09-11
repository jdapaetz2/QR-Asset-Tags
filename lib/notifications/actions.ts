"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireCustomerAdminOrgId } from "@/lib/auth/session";
import {
  normalizeNotificationSettings,
  type RawNotificationForm,
} from "@/lib/notifications/settings";

export type NotificationSettingsState = { error?: string };

const FIELDS = [
  "notification_email",
  "notify_damage_reports",
  "notify_support_requests",
  "notify_tag_request_updates",
  "notify_urgent_reports",
  "urgent_notification_email",
  "return_notification_mode",
  "notify_include_photo_previews",
] as const;

function readForm(formData: FormData): RawNotificationForm {
  const raw: RawNotificationForm = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  return raw;
}

/**
 * Customer admin updates their own org's notification settings. The org is derived from the signed-in profile (never
 * form input); RLS independently scopes the update to that org, and customer staff are excluded by both the guard and
 * the organizations update policy. The legacy `notify_return_checklists` boolean is written as a mirror of the
 * authoritative return mode (migration 0034).
 */
export async function updateNotificationSettings(
  _prev: NotificationSettingsState,
  formData: FormData
): Promise<NotificationSettingsState> {
  const organizationId = await requireCustomerAdminOrgId();

  const result = normalizeNotificationSettings(readForm(formData));
  if (!result.value) return { error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(result.value)
    .eq("id", organizationId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not save notification settings." };
  if (!data) return { error: "Organization not found." };

  redirect("/dashboard/settings");
}
