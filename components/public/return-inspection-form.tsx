"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/public/public-form";
import { submitReturnInspection } from "@/lib/forms/actions";
import { HONEYPOT_FIELD } from "@/lib/forms/validate";
import { ALLOWED_IMAGE_TYPES } from "@/lib/forms/media";
import type { PublicFormState } from "@/lib/forms/submit";
import { isConditionMet } from "@/lib/inspections/validate";
import type {
  InspectionField,
  InspectionSection,
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

function fieldVisible(field: InspectionField, values: Values): boolean {
  return isConditionMet(field.visible_when, values);
}
function fieldRequired(field: InspectionField, values: Values): boolean {
  if (field.required) return true;
  return field.required_when != null && isConditionMet(field.required_when, values);
}
function textValue(values: Values, id: string): string {
  const v = values[id];
  return typeof v === "string" ? v : "";
}

/** First client-side error in a section (mirrors the server; the server remains authoritative). */
function sectionError(
  section: InspectionSection,
  values: Values,
  fileCounts: Record<string, number>
): string | null {
  for (const field of section.fields) {
    if (!fieldVisible(field, values)) continue;
    if (field.type === "photo_slot") {
      const min = field.photo?.minPhotos ?? 0;
      if ((fileCounts[field.id] ?? 0) < min) {
        return `Add at least ${min} photo${min === 1 ? "" : "s"} for "${field.label}".`;
      }
      continue;
    }
    if (field.type === "acknowledgement") {
      if (field.required && values[field.id] !== "yes") return "Please confirm the attestation.";
      continue;
    }
    if (fieldRequired(field, values) && !textValue(values, field.id)) {
      return `"${field.label}" is required.`;
    }
  }
  return null;
}

export function ReturnInspectionForm({
  template,
  shortCode,
}: {
  template: InspectionTemplate;
  shortCode: string;
}) {
  const [state, formAction, pending] = useActionState<PublicFormState, FormData>(
    submitReturnInspection.bind(null, shortCode),
    {}
  );
  const [values, setValues] = useState<Values>({});
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  // Sections whose condition currently holds (e.g. Damage details only when damage=yes).
  const activeSections = useMemo(
    () => template.sections.filter((s) => isConditionMet(s.visible_when, values)),
    [template.sections, values]
  );
  const reviewStep = activeSections.length; // last step index = review
  const current = Math.min(step, reviewStep);
  const onReview = current === reviewStep;

  const setVal = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));
  const setItem = (fieldId: string, itemId: string, v: string) =>
    setValues((p) => {
      const cur = (p[fieldId] as Record<string, string>) ?? {};
      return { ...p, [fieldId]: { ...cur, [itemId]: v } };
    });

  function next() {
    const section = activeSections[current];
    const err = sectionError(section, values, fileCounts);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep(current + 1);
  }
  function back() {
    setStepError(null);
    setStep(Math.max(0, current - 1));
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Return information submitted for rental-company review. This is not a certified inspection or a
        statement that no damage exists.
      </p>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {onReview ? "Review" : `Section ${current + 1} of ${activeSections.length}`}
        </span>
        <span aria-hidden>
          {onReview ? "Review" : template.name}
        </span>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {/* Render every active section; only the current step's is shown (others kept mounted so the
          single POST captures every answer — no per-step server calls, no autosave). */}
      {activeSections.map((section, i) => (
        <fieldset key={section.id} hidden={onReview || i !== current} className="flex flex-col gap-4">
          <legend className="text-base font-semibold">{section.title}</legend>
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
                onText={(v) => setVal(field.id, v)}
                onItem={(itemId, v) => setItem(field.id, itemId, v)}
                onFiles={(n) => setFileCounts((p) => ({ ...p, [field.id]: n }))}
              />
            ))}
        </fieldset>
      ))}

      {/* Review step */}
      <div hidden={!onReview} className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Review &amp; submit</h2>
        <ReviewSummary sections={activeSections} values={values} fileCounts={fileCounts} />
        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">Contact (optional)</p>
          <label className="flex flex-col gap-1 text-sm">
            <span>Your name</span>
            <input className={fieldClass} name="name" autoComplete="name" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>Email</span>
              <input className={fieldClass} type="email" name="email" autoComplete="email" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Phone</span>
              <input className={fieldClass} type="tel" name="phone" autoComplete="tel" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional — add it if you&apos;d like a follow-up.
          </p>
        </div>
      </div>

      {stepError ? (
        <p role="alert" className="text-sm text-destructive">
          {stepError}
        </p>
      ) : null}

      {/* Honeypot */}
      <div aria-hidden className="hidden">
        <label>
          Company website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        {current > 0 ? (
          <button
            type="button"
            onClick={back}
            className="inline-flex h-11 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Back
          </button>
        ) : (
          <span />
        )}
        {onReview ? (
          <Button type="submit" disabled={pending} className="h-11">
            {pending ? "Submitting…" : "Submit return inspection"}
          </Button>
        ) : (
          <button
            type="button"
            onClick={next}
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Next
          </button>
        )}
      </div>
    </form>
  );
}

function FieldControl({
  field,
  value,
  onText,
  onItem,
  onFiles,
}: {
  field: InspectionField;
  value: string | Record<string, string> | undefined;
  onText: (v: string) => void;
  onItem: (itemId: string, v: string) => void;
  onFiles: (n: number) => void;
}) {
  const req = field.required ? " *" : "";
  const strVal = typeof value === "string" ? value : "";
  const name = `answer:${field.id}`;

  const labelWrap = (inner: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        {field.label}
        {req}
      </span>
      {field.help ? <span className="text-xs text-muted-foreground">{field.help}</span> : null}
      {inner}
    </label>
  );

  switch (field.type) {
    case "pass_fail_na":
      return labelWrap(<SelectInput name={name} value={strVal} onChange={onText} options={PASS_FAIL_OPTIONS} />);
    case "yes_no":
      return labelWrap(<SelectInput name={name} value={strVal} onChange={onText} options={YES_NO_OPTIONS} />);
    case "select":
      return labelWrap(
        <SelectInput name={name} value={strVal} onChange={onText} options={field.options ?? []} />
      );
    case "short_text":
      return labelWrap(
        <input className={fieldClass} name={name} value={strVal} onChange={(e) => onText(e.target.value)} />
      );
    case "long_text":
      return labelWrap(
        <textarea className={fieldClass} name={name} rows={3} value={strVal} onChange={(e) => onText(e.target.value)} />
      );
    case "numeric_meter":
      return labelWrap(
        <span className="flex items-center gap-2">
          <input
            className={fieldClass}
            type="number"
            inputMode="decimal"
            name={name}
            value={strVal}
            min={field.min}
            max={field.max}
            onChange={(e) => onText(e.target.value)}
          />
          {field.unit ? <span className="text-xs text-muted-foreground">{field.unit}</span> : null}
        </span>
      );
    case "fuel_charge_level":
      return labelWrap(
        <input
          className={fieldClass}
          name={name}
          value={strVal}
          placeholder="e.g. Full, 1/2 tank, fully charged"
          onChange={(e) => onText(e.target.value)}
        />
      );
    case "accessory_checklist":
      return (
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{field.label}</span>
          {(field.items ?? []).map((item) => {
            const itemVal = (value as Record<string, string>)?.[item.id] ?? "";
            return (
              <div key={item.id} className="flex items-center justify-between gap-2">
                <span>{item.label}</span>
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
        </div>
      );
    case "photo_slot":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            {field.label}
            {(field.photo?.minPhotos ?? 0) > 0 ? " *" : ""}
          </span>
          {field.help ? <span className="text-xs text-muted-foreground">{field.help}</span> : null}
          <input
            className={fieldClass}
            type="file"
            name={`photo:${field.id}`}
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            multiple
            onChange={(e) => onFiles(e.target.files?.length ?? 0)}
          />
          <span className="text-xs text-muted-foreground">
            Up to {field.photo?.maxPhotos ?? 6} photos, 10 MB each.
          </span>
        </label>
      );
    case "acknowledgement":
      return (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={name}
            className="mt-1 size-4"
            checked={strVal === "yes"}
            onChange={(e) => onText(e.target.checked ? "yes" : "")}
          />
          <span>{field.label}</span>
        </label>
      );
    default:
      return null;
  }
}

function SelectInput({
  name,
  value,
  onChange,
  options,
  compact,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <select
      className={compact ? "h-9 rounded-md border bg-background px-2 text-sm" : fieldClass}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
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

function ReviewSummary({
  sections,
  values,
  fileCounts,
}: {
  sections: InspectionSection[];
  values: Values;
  fileCounts: Record<string, number>;
}) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {sections.flatMap((section) =>
        section.fields
          .filter((f) => fieldVisible(f, values))
          .map((field) => {
            let display: string;
            if (field.type === "photo_slot") {
              display = `${fileCounts[field.id] ?? 0} photo(s)`;
            } else if (field.type === "accessory_checklist") {
              const map = (values[field.id] as Record<string, string>) ?? {};
              display =
                (field.items ?? [])
                  .map((i) => `${i.label}: ${map[i.id] ?? "—"}`)
                  .join(", ") || "—";
            } else if (field.type === "acknowledgement") {
              display = values[field.id] === "yes" ? "Confirmed" : "Not confirmed";
            } else {
              display = textValue(values, field.id) || "—";
            }
            return (
              <div key={field.id} className="flex justify-between gap-3 border-b pb-1">
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="text-right font-medium">{display}</dd>
              </div>
            );
          })
      )}
    </dl>
  );
}
