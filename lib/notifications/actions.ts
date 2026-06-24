"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import {
  normalizeNotificationSettings,
  type RawNotificationForm,
} from "@/lib/notifications/settings";

export type NotificationSettingsState = { error?: string };

const FIELDS = [
  "notification_email",
  "notify_damage_reports",
  "notify_support_requests",
  "notify_return_checklists",
  "notify_tag_request_updates",
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
 * Customer admin updates their own org's notification settings. The org is derived
 * from the signed-in profile (never form input); RLS independently scopes the
 * update to that org.
 */
export async function updateNotificationSettings(
  _prev: NotificationSettingsState,
  formData: FormData
): Promise<NotificationSettingsState> {
  const organizationId = await requireOrgId();

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
