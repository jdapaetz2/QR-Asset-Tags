"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/public/public-form";
import { submitReturnInspection } from "@/lib/forms/actions";
import { HONEYPOT_FIELD } from "@/lib/forms/validate";
import { ALLOWED_IMAGE_TYPES } from "@/lib/forms/media";
import type { PublicFormState } from "@/lib/forms/submit";
import {
  firstInspectionError,
  isConditionMet,
  visiblePhotoSlotCounts,
} from "@/lib/inspections/validate";
import type {
  InspectionField,
  InspectionTemplate,
} from "@/lib/inspections/types";

type Values = Record<string, string | Record<string, string>>;

const PASS_FAIL_OPTIONS = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "na", label: "N/A" },
];
const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const ACCESSORY_OPTIONS = [
  { value: "returned", label: "Returned" },
  { value: "missing", label: "Missing" },
  { value: "na", label: "N/A" },
];

const fieldDomId = (id: string) => `field-${id}`;
const errDomId = (id: string) => `err-${id}`;

function fieldVisible(field: InspectionField, values: Values): boolean {
  return isConditionMet(field.visible_when, values);
}

/** Human-friendly value for the Review summary (Pass / Yes / Not applicable / option labels). */
function displayValue(field: InspectionField, value: string | Record<string, string> | undefined): string {
  if (field.type === "acknowledgement") return value === "yes" ? "Confirmed" : "Not confirmed";
  const v = typeof value === "string" ? value : "";
  if (!v) return "—";
  switch (field.type) {
    case "pass_fail_na":
      return v === "na" ? "Not applicable" : v.charAt(0).toUpperCase() + v.slice(1);
    case "yes_no":
      return v === "yes" ? "Yes" : v === "no" ? "No" : v;
    case "select":
      return field.options?.find((o) => o.value === v)?.label ?? v;
    case "numeric_meter":
      return field.unit ? `${v} ${field.unit}` : v;
    default:
      return v;
  }
}

export function ReturnInspectionForm({
  template,
  shortCode,
  action,
  disclaimer = "Return information submitted for rental-company review. This is not a certified inspection or a statement that no damage exists.",
  reviewCta = "Review return inspection",
  submitCta = "Submit return inspection",
  submittingCta = "Submitting…",
  contextTitle = "Contact (optional)",
  contextFields,
}: {
  template: InspectionTemplate;
  shortCode: string;
  /** The bound submit action. Defaults to the public return-inspection action. */
  action?: (state: PublicFormState, formData: FormData) => Promise<PublicFormState>;
  disclaimer?: string;
  reviewCta?: string;
  submitCta?: string;
  submittingCta?: string;
  /** Review-step context section title (e.g. "Contact (optional)" or "Rental details (optional)"). */
  contextTitle?: string;
  /** Review-step context inputs. When provided, replaces the default public contact fields. */
  contextFields?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<PublicFormState, FormData>(
    action ?? submitReturnInspection.bind(null, shortCode),
    {}
  );
  const [values, setValues] = useState<Values>({});
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<"inspect" | "review">("inspect");
  const [error, setError] = useState<{ fieldId: string; message: string } | null>(null);

  // Sections whose condition currently holds. The Damage-details section only appears when
  // damage_observed=yes, so it is conditionally mounted inline; switching back to "no" unmounts it,
  // which discards any selected damage files (they never reach the server).
  const activeSections = useMemo(
    () => template.sections.filter((s) => isConditionMet(s.visible_when, values)),
    [template.sections, values]
  );
  const damageShown = values["damage_observed"] === "yes";

  const setVal = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));
  const setItem = (fieldId: string, itemId: string, v: string) =>
    setValues((p) => {
      const cur = (p[fieldId] as Record<string, string>) ?? {};
      return { ...p, [fieldId]: { ...cur, [itemId]: v } };
    });

  function goReview() {
    const err = firstInspectionError(template, values, fileCounts);
    if (err) {
      setError(err);
      const el = document.getElementById(fieldDomId(err.fieldId));
      el?.scrollIntoView({ block: "center" });
      (el as HTMLElement | null)?.focus?.();
      if (el && document.activeElement !== el) {
        (el.querySelector("input,select,textarea") as HTMLElement | null)?.focus?.();
      }
      return;
    }
    setError(null);
    setStage("review");
    window.scrollTo({ top: 0 });
  }
  function backToInspect() {
    setStage("inspect");
    window.scrollTo({ top: 0 });
  }

  const onReview = stage === "review";

  return (
    <form action={formAction} className="flex flex-col gap-5 pb-8">
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {disclaimer}
      </p>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">{onReview ? "Review & submit" : "Inspection"}</span>
        <span aria-hidden>{template.name}</span>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {/* Stage 1 — Inspection: one scrollable page. Kept mounted during Review (hidden) so a single POST
          captures every answer + file and Back never clears anything. */}
      <div hidden={onReview} className="flex flex-col gap-4">
        {/* Live status: announces the damage section when it is revealed. */}
        <p role="status" aria-live="polite" className="sr-only">
          {damageShown
            ? "Damage details section shown. Complete the damage fields and add at least one photo."
            : ""}
        </p>

        {activeSections.map((section) => (
          <fieldset
            key={section.id}
            className="flex flex-col gap-4 rounded-lg border bg-card p-4"
          >
            <legend className="px-1 text-base font-semibold">{section.title}</legend>
            {section.help ? (
              <p className="-mt-2 text-xs text-muted-foreground">{section.help}</p>
            ) : null}
            {section.fields
              .filter((f) => fieldVisible(f, values))
              .map((field) => (
                <FieldControl
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  error={error?.fieldId === field.id ? error.message : null}
                  onText={(v) => setVal(field.id, v)}
                  onItem={(itemId, v) => setItem(field.id, itemId, v)}
                  onFiles={(n) => setFileCounts((p) => ({ ...p, [field.id]: n }))}
                />
              ))}
          </fieldset>
        ))}
      </div>

      {/* Stage 2 — Review & submit */}
      <div hidden={!onReview} className="flex flex-col gap-4">
        <ReviewSummary template={template} values={values} fileCounts={fileCounts} />
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">{contextTitle}</p>
          {contextFields ?? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span>Your name</span>
                <input className={fieldClass} name="name" autoComplete="name" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Email</span>
                <input className={fieldClass} type="email" name="email" autoComplete="email" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Phone</span>
                <input className={fieldClass} type="tel" name="phone" autoComplete="tel" />
              </label>
              <p className="text-xs text-muted-foreground">
                Optional — add it if you&apos;d like a follow-up.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Honeypot */}
      <div aria-hidden className="hidden">
        <label>
          Company website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {!onReview && error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      {/* Actions */}
      {onReview ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={backToInspect}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Back
          </button>
          <Button type="submit" disabled={pending} className="h-11 flex-1">
            {pending ? submittingCta : submitCta}
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={goReview} className="h-11 w-full">
          {reviewCta}
        </Button>
      )}
    </form>
  );
}

function FieldControl({
  field,
  value,
  error,
  onText,
  onItem,
  onFiles,
}: {
  field: InspectionField;
  value: string | Record<string, string> | undefined;
  error: string | null;
  onText: (v: string) => void;
  onItem: (itemId: string, v: string) => void;
  onFiles: (n: number) => void;
}) {
  const req = field.required ? " *" : "";
  const strVal = typeof value === "string" ? value : "";
  const name = `answer:${field.id}`;
  const domId = fieldDomId(field.id);
  const invalid = Boolean(error);
  const describedBy = invalid ? errDomId(field.id) : undefined;
  const aria = { "aria-invalid": invalid || undefined, "aria-describedby": describedBy };

  const errorNote = error ? (
    <span id={errDomId(field.id)} role="alert" className="text-xs text-destructive">
      {error}
    </span>
  ) : null;

  const labelWrap = (inner: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm" htmlFor={domId}>
      <span className="font-medium">
        {field.label}
        {req}
      </span>
      {field.help ? <span className="text-xs text-muted-foreground">{field.help}</span> : null}
      {inner}
      {errorNote}
    </label>
  );

  switch (field.type) {
    case "pass_fail_na":
      return labelWrap(<SelectInput id={domId} name={name} value={strVal} onChange={onText} options={PASS_FAIL_OPTIONS} aria={aria} />);
    case "yes_no":
      return labelWrap(<SelectInput id={domId} name={name} value={strVal} onChange={onText} options={YES_NO_OPTIONS} aria={aria} />);
    case "select":
      return labelWrap(
        <SelectInput id={domId} name={name} value={strVal} onChange={onText} options={field.options ?? []} aria={aria} />
      );
    case "short_text":
      return labelWrap(
        <input id={domId} className={fieldClass} name={name} value={strVal} onChange={(e) => onText(e.target.value)} {...aria} />
      );
    case "long_text":
      return labelWrap(
        <textarea id={domId} className={fieldClass} name={name} rows={3} value={strVal} onChange={(e) => onText(e.target.value)} {...aria} />
      );
    case "numeric_meter":
      return labelWrap(
        <span className="flex items-center gap-2">
          <input
            id={domId}
            className={fieldClass}
            type="number"
            inputMode="decimal"
            name={name}
            value={strVal}
            min={field.min}
            max={field.max}
            onChange={(e) => onText(e.target.value)}
            {...aria}
          />
          {field.unit ? <span className="text-xs text-muted-foreground">{field.unit}</span> : null}
        </span>
      );
    case "fuel_charge_level":
      return labelWrap(
        <input
          id={domId}
          className={fieldClass}
          name={name}
          value={strVal}
          placeholder="e.g. Full, 1/2 tank, fully charged"
          onChange={(e) => onText(e.target.value)}
          {...aria}
        />
      );
    case "accessory_checklist":
      return (
        <div id={domId} className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{field.label}</span>
          {(field.items ?? []).map((item) => {
            const itemVal = (value as Record<string, string>)?.[item.id] ?? "";
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words">{item.label}</span>
                <SelectInput
                  name={`answer:${field.id}:${item.id}`}
                  value={itemVal}
                  onChange={(v) => onItem(item.id, v)}
                  options={ACCESSORY_OPTIONS}
                  compact
                />
              </div>
            );
          })}
          {errorNote}
        </div>
      );
    case "photo_slot":
      return (
        <label className="flex flex-col gap-1 text-sm" htmlFor={domId}>
          <span className="font-medium">
            {field.label}
            {(field.photo?.minPhotos ?? 0) > 0 ? " *" : ""}
          </span>
          {field.help ? <span className="text-xs text-muted-foreground">{field.help}</span> : null}
          <input
            id={domId}
            className={fieldClass}
            type="file"
            name={`photo:${field.id}`}
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            multiple
            onChange={(e) => onFiles(e.target.files?.length ?? 0)}
            {...aria}
          />
          <span className="text-xs text-muted-foreground">
            Up to {field.photo?.maxPhotos ?? 6} photos, 10 MB each.
          </span>
          {errorNote}
        </label>
      );
    case "acknowledgement":
      return (
        <label className="flex items-start gap-2 text-sm">
          <input
            id={domId}
            type="checkbox"
            name={name}
            className="mt-1 size-4"
            checked={strVal === "yes"}
            onChange={(e) => onText(e.target.checked ? "yes" : "")}
            {...aria}
          />
          <span className="flex flex-col gap-1">
            <span>{field.label}</span>
            {errorNote}
          </span>
        </label>
      );
    default:
      return null;
  }
}

function SelectInput({
  id,
  name,
  value,
  onChange,
  options,
  compact,
  aria,
}: {
  id?: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
  aria?: { "aria-invalid": true | undefined; "aria-describedby": string | undefined };
}) {
  return (
    <select
      id={id}
      className={compact ? "h-11 min-w-28 rounded-md border bg-background px-2 text-sm" : fieldClass}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...aria}
    >
      <option value="">— select —</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Grouped, mobile-friendly review: one block per active section + a photo-count summary. */
function ReviewSummary({
  template,
  values,
  fileCounts,
}: {
  template: InspectionTemplate;
  values: Values;
  fileCounts: Record<string, number>;
}) {
  const activeSections = template.sections.filter((s) => isConditionMet(s.visible_when, values));
  const photoCounts = visiblePhotoSlotCounts(template, values, fileCounts);

  return (
    <div className="flex flex-col gap-4">
      {photoCounts.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos</p>
          <ul className="flex flex-col gap-1 text-sm">
            {photoCounts.map((slot) => (
              <li key={slot.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{slot.label}</span>
                <span className="font-medium">
                  {slot.count} photo{slot.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeSections.map((section) => {
        const rows = section.fields.filter(
          (f) => fieldVisible(f, values) && f.type !== "photo_slot"
        );
        if (rows.length === 0) return null;
        return (
          <div key={section.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </p>
            <dl className="flex flex-col gap-2 text-sm">
              {rows.map((field) => (
                <div key={field.id} className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground">{field.label}</dt>
                  <dd className="whitespace-pre-line break-words font-medium">
                    {field.type === "accessory_checklist" ? (
                      <AccessorySummary field={field} value={values[field.id]} />
                    ) : (
                      displayValue(field, values[field.id])
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function AccessorySummary({
  field,
  value,
}: {
  field: InspectionField;
  value: string | Record<string, string> | undefined;
}) {
  const map = (value as Record<string, string>) ?? {};
  const label = (v: string) => ACCESSORY_OPTIONS.find((o) => o.value === v)?.label ?? "—";
  return (
    <ul className="flex flex-col gap-0.5">
      {(field.items ?? []).map((item) => (
        <li key={item.id} className="flex justify-between gap-3">
          <span className="min-w-0 break-words text-muted-foreground">{item.label}</span>
          <span>{label(map[item.id] ?? "")}</span>
        </li>
      ))}
    </ul>
  );
}
