"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { AssetFormState } from "@/lib/assets/actions";
import type { AssetInput } from "@/lib/assets/validate";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

type AssetFormAction = (
  state: AssetFormState,
  formData: FormData
) => Promise<AssetFormState>;

type AssetDefaults = Partial<AssetInput>;

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required = false,
  textarea = false,
}: {
  name: keyof AssetInput;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  const value = defaultValue ?? undefined;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {textarea ? (
        <textarea
          name={name}
          defaultValue={value as string | undefined}
          rows={3}
          className={inputClass}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={value}
          className={inputClass}
        />
      )}
    </label>
  );
}

export function AssetForm({
  action,
  asset,
  submitLabel,
}: {
  action: AssetFormAction;
  asset?: AssetDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<AssetFormState, FormData>(
    action,
    {}
  );
  const [cover, setCover] = useState(asset?.cover_image_url ?? "");

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="asset_code" label="Asset code" defaultValue={asset?.asset_code} required />
        <Field name="asset_name" label="Asset name" defaultValue={asset?.asset_name} required />
        <Field name="category" label="Category" defaultValue={asset?.category} />
        <Field name="make" label="Make" defaultValue={asset?.make} />
        <Field name="model" label="Model" defaultValue={asset?.model} />
        <Field name="serial_number" label="Serial number" defaultValue={asset?.serial_number} />
        <Field name="year" label="Year" type="number" defaultValue={asset?.year} />
        <Field
          name="support_phone_override"
          label="Support phone override"
          defaultValue={asset?.support_phone_override}
        />
        <Field
          name="support_email_override"
          label="Support email override"
          type="email"
          defaultValue={asset?.support_email_override}
        />
      </div>

      {/* Cover image: validated URL or /demo-assets/ path, shown on the public page. */}
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Cover image</span>
          <input
            name="cover_image_url"
            type="text"
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            placeholder="https://… image URL or /demo-assets/…"
            className={inputClass}
          />
          <span className="text-xs text-muted-foreground">
            Public https image URL or a <code>/demo-assets/…</code> path. Shown as
            the hero photo on the public scan page; leave blank for the branded
            placeholder.
          </span>
        </label>
        {cover.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.trim()}
            alt="Cover preview"
            className="aspect-video w-full max-w-xs rounded-md border object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full max-w-xs items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
            No cover image yet
          </div>
        )}
      </div>

      <Field
        name="internal_notes"
        label="Internal notes (private)"
        defaultValue={asset?.internal_notes}
        textarea
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/dashboard/assets"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
