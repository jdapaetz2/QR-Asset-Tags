"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { updateNotificationSettings } from "@/lib/notifications/actions";
import type { NotificationSettingsState } from "@/lib/notifications/actions";
import type { NotificationSettings } from "@/lib/notifications/settings";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

const TOGGLES: { name: keyof NotificationSettings; label: string; hint: string }[] = [
  {
    name: "notify_damage_reports",
    label: "Damage reports",
    hint: "Email when someone submits a damage report.",
  },
  {
    name: "notify_support_requests",
    label: "Support requests",
    hint: "Email when someone submits a support request.",
  },
  {
    name: "notify_return_checklists",
    label: "Return checklists",
    hint: "Email when someone submits a return checklist.",
  },
  {
    name: "notify_tag_request_updates",
    label: "Tag request updates",
    hint: "Email when AssetTag QR updates one of your tag requests.",
  },
];

export function NotificationSettingsForm({
  settings,
}: {
  settings: NotificationSettings;
}) {
  const [state, formAction, pending] = useActionState<
    NotificationSettingsState,
    FormData
  >(updateNotificationSettings, {});

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Email notifications</legend>
        <p className="text-xs text-muted-foreground">
          Get an email when submissions arrive or tag requests are updated. Leave the
          address blank to turn all notifications off.
        </p>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Notification email</span>
          <input
            name="notification_email"
            type="email"
            defaultValue={settings.notification_email ?? ""}
            placeholder="alerts@yourcompany.com"
            className={inputClass}
          />
        </label>

        <div className="flex flex-col gap-3 pt-1">
          {TOGGLES.map((t) => (
            <label key={t.name} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name={t.name}
                defaultChecked={Boolean(settings[t.name])}
                className="mt-0.5 size-4"
              />
              <span className="flex flex-col">
                <span className="font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save notifications"}
        </Button>
      </div>
    </form>
  );
}
