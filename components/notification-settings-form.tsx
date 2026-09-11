"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { updateNotificationSettings } from "@/lib/notifications/actions";
import type { NotificationSettingsState } from "@/lib/notifications/actions";
import type { NotificationSettings, ReturnNotificationMode } from "@/lib/notifications/settings";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

const GENERAL_TOGGLES: {
  name: "notify_damage_reports" | "notify_support_requests" | "notify_tag_request_updates";
  label: string;
  hint: string;
}[] = [
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
    name: "notify_tag_request_updates",
    label: "Tag request updates",
    hint: "Email when Mulemark changes the status of one of your tag requests.",
  },
];

const RETURN_MODES: { value: ReturnNotificationMode; label: string; hint: string }[] = [
  {
    value: "instant_renter",
    label: "Each renter return + daily staff exceptions",
    hint: "Email every return checklist a renter submits. Staff return exceptions go in the daily summary.",
  },
  {
    value: "daily_exceptions",
    label: "Daily exceptions summary",
    hint: "No email per return. Renter and staff returns with exceptions go in one daily summary.",
  },
  {
    value: "off",
    label: "Off",
    hint: "No return checklist emails.",
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
    <form
      action={formAction}
      onSubmit={(e) => {
        // Dispatch in a transition so a validation error keeps what the admin changed (React resets a <form action>
        // after it completes, which would put every field back to its saved value).
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex w-full flex-col gap-5"
    >
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Notification email</span>
        <input
          name="notification_email"
          type="email"
          defaultValue={settings.notification_email ?? ""}
          placeholder="alerts@yourcompany.com"
          className={inputClass}
        />
        <span className="text-xs text-muted-foreground">
          Where damage, support, return checklist and tag request alerts are sent.
        </span>
      </label>

      <div className="flex flex-col divide-y divide-iron-200 rounded-md border">
        {GENERAL_TOGGLES.map((t) => (
          <label key={t.name} className="flex items-start gap-3 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              name={t.name}
              defaultChecked={settings[t.name]}
              className="mt-0.5 size-4 accent-brass-500"
            />
            <span className="flex flex-col">
              <span className="font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border px-3 py-3">
        <legend className="px-1 text-sm font-medium">Urgent notifications</legend>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="notify_urgent_reports"
            defaultChecked={settings.notify_urgent_reports}
            className="mt-0.5 size-4 accent-brass-500"
          />
          <span className="flex flex-col">
            <span className="font-medium">Send immediate-attention reports to an urgent address</span>
            <span className="text-xs text-muted-foreground">
              Damage and support reports that need immediate attention also go to this address, even when the damage or
              support switch above is off.
            </span>
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Urgent notification email</span>
          <input
            name="urgent_notification_email"
            type="email"
            defaultValue={settings.urgent_notification_email ?? ""}
            placeholder="on-call@yourcompany.com"
            className={inputClass}
          />
          <span className="text-xs text-muted-foreground">
            Use the same address as above or a different one. Turning urgent notifications off keeps this address.
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-md border px-3 py-3">
        <legend className="px-1 text-sm font-medium">Return checklists</legend>
        <div className="flex flex-col gap-2">
          {RETURN_MODES.map((mode) => (
            <label key={mode.value} className="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name="return_notification_mode"
                value={mode.value}
                defaultChecked={settings.return_notification_mode === mode.value}
                className="mt-0.5 size-4 accent-brass-500"
              />
              <span className="flex flex-col">
                <span className="font-medium">{mode.label}</span>
                <span className="text-xs text-muted-foreground">{mode.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Staff return exceptions are only ever included in the daily summary, never sent one at a time. The daily
          summary is rolling out; until it starts, every return still appears in Submissions.
        </p>
      </fieldset>

      <label className="flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          name="notify_include_photo_previews"
          defaultChecked={settings.notify_include_photo_previews}
          className="mt-0.5 size-4 accent-brass-500"
        />
        <span className="flex flex-col">
          <span className="font-medium">Include photo previews</span>
          <span className="text-xs text-muted-foreground">
            Small preview images of submitted photos in individual alerts. Turn off for text-only emails.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save notifications"}
        </Button>
      </div>
    </form>
  );
}
