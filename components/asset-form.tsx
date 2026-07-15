"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { AssetFormState } from "@/lib/assets/actions";
import type { AssetInput } from "@/lib/assets/validate";
import { COVER_ALLOWED_TYPES } from "@/lib/assets/cover";
import {
  GENERIC_TEMPLATE_KEY,
  RETURN_TEMPLATE_PICKER,
} from "@/lib/inspections/templates";
import { suggestTemplateKeyFromCategory } from "@/lib/inspections/resolve";
import {
  categoryDefaultTargetForCategory,
  type CategoryDefaultTargetLookup,
} from "@/lib/inspections/category-defaults";

export type OrgTemplateOption = { id: string; name: string; version: number };

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
  categories = [],
  orgTemplates = [],
  orgCategoryTargets = {},
  submitLabel,
  cancelHref = "/dashboard/assets",
  returnTo,
}: {
  action: AssetFormAction;
  asset?: AssetDefaults;
  /** When set (edit mode), enables cover-image file upload in the same save. */
  assetId?: string;
  /** Existing org categories offered as datalist suggestions. */
  categories?: string[];
  /** This org's assignable (published) custom return templates. */
  orgTemplates?: OrgTemplateOption[];
  /** Category → default target (custom id or system key) — drives the live suggestion + source label. */
  orgCategoryTargets?: CategoryDefaultTargetLookup;
  submitLabel: string;
  /** Where Cancel returns to (Wave 3N.2 — the originating filtered list, else the Assets index). */
  cancelHref?: string;
  /** Validated `returnTo` posted with the save so the action can redirect back to the filtered list. */
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState<AssetFormState, FormData>(
    action,
    {}
  );
  const [cover, setCover] = useState(asset?.cover_image_url ?? "");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Category + return template are chosen together. The assignment follows the category suggestion until
  // the admin picks one explicitly. An assignment is either a system template (`system:<key>`) or a
  // published custom org template (`custom:<id>`); exactly one of the two hidden fields is posted.
  const [category, setCategory] = useState(asset?.category ?? "");
  const initialAssignment = asset?.return_inspection_template_id
    ? `custom:${asset.return_inspection_template_id}`
    : asset?.return_inspection_template_key
      ? `system:${asset.return_inspection_template_key}`
      : "";
  const [assignment, setAssignment] = useState(initialAssignment);
  const [assignmentTouched, setAssignmentTouched] = useState(Boolean(initialAssignment));

  // Suggestion precedence (untouched): org category default (custom id or system key) → system alias →
  // generic. An explicit selection is never overwritten.
  const systemSuggestion = suggestTemplateKeyFromCategory(category);
  const target = categoryDefaultTargetForCategory(category, orgCategoryTargets);
  const defaultAssignment = target?.templateId
    ? `custom:${target.templateId}`
    : target?.templateKey
      ? `system:${target.templateKey}`
      : systemSuggestion
        ? `system:${systemSuggestion}`
        : `system:${GENERIC_TEMPLATE_KEY}`;
  const effectiveAssignment = assignmentTouched ? assignment || defaultAssignment : defaultAssignment;

  const isCustom = effectiveAssignment.startsWith("custom:");
  const effectiveTemplateId = isCustom ? effectiveAssignment.slice("custom:".length) : "";
  const effectiveTemplateKey = !isCustom ? effectiveAssignment.slice("system:".length) : "";
  const systemDescription = RETURN_TEMPLATE_PICKER.find(
    (t) => t.key === effectiveTemplateKey
  )?.description;
  const sourceLabel = assignmentTouched
    ? isCustom
      ? "Explicit assignment (custom template)."
      : "Explicit assignment."
    : target?.templateId
      ? "Organization category default (custom template)."
      : target?.templateKey
        ? "Organization category default."
        : systemSuggestion
          ? "System suggestion."
          : "Generic fallback — review recommended.";

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
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Category</span>
          <input
            name="category"
            list="asset-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          />
          <datalist id="asset-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <span className="text-xs text-muted-foreground">
            Choose an existing category or type a new one.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Return inspection template</span>
          <select
            id="return_inspection_template"
            value={effectiveAssignment}
            onChange={(e) => {
              setAssignment(e.target.value);
              setAssignmentTouched(true);
            }}
            className={inputClass}
          >
            <optgroup label="System templates">
              {RETURN_TEMPLATE_PICKER.map((t) => (
                <option key={t.key} value={`system:${t.key}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            {orgTemplates.length > 0 ? (
              <optgroup label="Your published templates">
                {orgTemplates.map((t) => (
                  <option key={t.id} value={`custom:${t.id}`}>
                    {t.name} · v{t.version}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          {/* Exactly one of these is non-empty; the server stores it (custom id wins over system key). */}
          <input type="hidden" name="return_inspection_template_key" value={effectiveTemplateKey} />
          <input type="hidden" name="return_inspection_template_id" value={effectiveTemplateId} />
          <span className="text-xs text-muted-foreground">
            {isCustom ? "Your organization's custom template." : systemDescription}
          </span>
          <span
            className={
              sourceLabel.includes("Generic")
                ? "text-xs text-warning"
                : "text-xs text-muted-foreground"
            }
          >
            {sourceLabel}
          </span>
        </label>

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
          href={cancelHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
