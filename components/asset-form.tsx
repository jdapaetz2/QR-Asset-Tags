"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { AssetFormState } from "@/lib/assets/actions";
import type { AssetInput } from "@/lib/assets/validate";
import { COVER_ALLOWED_TYPES } from "@/lib/assets/cover";

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
  assetId,
  submitLabel,
}: {
  action: AssetFormAction;
  asset?: AssetDefaults;
  /** When set (edit mode), enables cover-image file upload in the same save. */
  assetId?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<AssetFormState, FormData>(
    action,
    {}
  );
  const [cover, setCover] = useState(asset?.cover_image_url ?? "");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function removeCover() {
    setCover("");
    setFilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  // One preview: a chosen file wins, else the typed URL, else the current cover.
  const previewSrc = filePreview ?? (cover.trim() || null);
  const hasSomething = Boolean(previewSrc);

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

      {/* Cover image — one unified section: upload a file or paste a URL/path. */}
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Cover image</legend>
        <p className="text-xs text-muted-foreground">
          Cover images are public and will appear on the QR scan page.
        </p>

        {/* Single preview */}
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
            alt="Cover preview"
            className="aspect-video w-full max-w-xs rounded-md border object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full max-w-xs items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
            No cover image yet
          </div>
        )}

        {assetId ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Upload an image</span>
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept={COVER_ALLOWED_TYPES.join(",")}
              onChange={onFileChange}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            <span className="text-xs text-muted-foreground">
              JPG, PNG, or WebP · up to 5 MB. Uploads when you click {submitLabel}.
            </span>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">…or paste an image URL / path</span>
          <input
            name="cover_image_url"
            type="text"
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            placeholder="https://… image URL or /demo-assets/…"
            className={inputClass}
          />
          <span className="text-xs text-muted-foreground">
            Public https image URL or a <code>/demo-assets/…</code> path.
            {assetId ? " If you choose a file, it replaces the URL when you save." : null}
          </span>
        </label>

        {assetId && hasSomething ? (
          <Button
            type="button"
            variant="outline"
            onClick={removeCover}
            className="self-start"
          >
            Remove cover image
          </Button>
        ) : null}
      </fieldset>

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
