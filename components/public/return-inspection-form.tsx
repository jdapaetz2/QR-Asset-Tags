"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { sectionStage } from "@/lib/inspections/stages";
import { DAMAGE_PHOTOS_SLOT_ID } from "@/lib/inspections/templates";
import type {
  InspectionField,
  InspectionSection,
  InspectionStage,
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
// Preset fuel/charge choices rendered as buttons (free of a dropdown). "Other" keeps a text fallback.
const FUEL_OPTIONS = [
  { value: "Full", label: "Full" },
  { value: "3/4", label: "3/4" },
  { value: "1/2", label: "1/2" },
  { value: "1/4", label: "1/4" },
  { value: "Empty", label: "Empty" },
  { value: "Fully charged", label: "Fully charged" },
  { value: "Partial charge", label: "Partial charge" },
];

const STAGE_ORDER: InspectionStage[] = ["condition", "return_details"];
const STAGE_TITLES: Record<InspectionStage, string> = {
  condition: "Condition",
  return_details: "Return details",
};

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
  baseline,
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
  /**
   * Optional per-field baseline hints keyed by field id (Phase 3B, staff return). When present, a compact
   * expandable "Baseline" reference renders under the matching field. Reference only — never pre-fills or
   * constrains the answer.
   */
  baseline?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<PublicFormState, FormData>(
    action ?? submitReturnInspection.bind(null, shortCode),
    {}
  );
  const [values, setValues] = useState<Values>({});
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  // Three primary stages: condition → return_details → review.
  const [stage, setStage] = useState<"condition" | "return_details" | "review">("condition");
  const [error, setError] = useState<{ fieldId: string; message: string } | null>(null);

  // Soft damage-photo omission (Phase 3C.1): acknowledged via an explicit dialog before Submit.
  const [omissionAck, setOmissionAck] = useState(false);
  // One-shot flags kept in refs (not state) so the effects only touch external systems (DOM focus / submit).
  const submitAfterAckRef = useRef(false);
  const focusDamageRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const activeSections = useMemo(
    () => template.sections.filter((s) => isConditionMet(s.visible_when, values)),
    [template.sections, values]
  );
  const sectionsFor = (stageKey: InspectionStage) =>
    activeSections.filter((s) => sectionStage(s) === stageKey);

  const damageShown = values["damage_observed"] === "yes";
  const damagePhotoCount = fileCounts[DAMAGE_PHOTOS_SLOT_ID] ?? 0;
  const damageWithoutPhoto = damageShown && damagePhotoCount === 0;

  const setVal = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));
  const setItem = (fieldId: string, itemId: string, v: string) =>
    setValues((p) => {
      const cur = (p[fieldId] as Record<string, string>) ?? {};
      return { ...p, [fieldId]: { ...cur, [itemId]: v } };
    });

  function focusFirstError(fieldId: string) {
    const el = document.getElementById(fieldDomId(fieldId));
    el?.scrollIntoView({ block: "center" });
    (el as HTMLElement | null)?.focus?.();
    if (el && document.activeElement !== el) {
      (el.querySelector("input,select,textarea,button") as HTMLElement | null)?.focus?.();
    }
  }

  /** Validate only the current stage's sections, then advance. No auto-advance on choice selection. */
  function goNext(current: InspectionStage, next: "return_details" | "review") {
    const err = firstInspectionError(template, values, fileCounts, {
      sectionFilter: (s) => sectionStage(s) === current,
    });
    if (err) {
      setError(err);
      focusFirstError(err.fieldId);
      return;
    }
    setError(null);
    setStage(next);
    window.scrollTo({ top: 0 });
  }

  function goBack(to: "condition" | "return_details") {
    setStage(to);
    window.scrollTo({ top: 0 });
  }

  // After choosing "Add photos", return to the details stage and focus the damage-photo input (DOM only).
  useEffect(() => {
    if (stage === "return_details" && focusDamageRef.current) {
      focusDamageRef.current = false;
      const el = document.getElementById(fieldDomId(DAMAGE_PHOTOS_SLOT_ID));
      el?.scrollIntoView({ block: "center" });
      (el as HTMLElement | null)?.focus?.();
    }
  }, [stage]);

  // Submit only after the omission acknowledgement flag is committed to the DOM (hidden input).
  useEffect(() => {
    if (omissionAck && submitAfterAckRef.current) {
      submitAfterAckRef.current = false;
      formRef.current?.requestSubmit();
    }
  }, [omissionAck]);

  function handleSubmitClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Guard: reported damage with zero photos → explicit confirmation before submitting.
    if (damageWithoutPhoto && !omissionAck) {
      e.preventDefault();
      dialogRef.current?.showModal();
    }
  }

  const onReview = stage === "review";
  const stepIndex = stage === "condition" ? 1 : stage === "return_details" ? 2 : 3;

  return (
    <form action={formAction} ref={formRef} className="flex flex-col gap-5 pb-24">
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {disclaimer}
      </p>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">
          Step {stepIndex} of 3 · {onReview ? "Review & submit" : STAGE_TITLES[stage]}
        </span>
        <span aria-hidden>{template.name}</span>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {/* Live status: announces the damage section when it is revealed. */}
      <p role="status" aria-live="polite" className="sr-only">
        {damageShown
          ? "Damage details section shown. Complete the damage fields; photos are recommended."
          : ""}
      </p>

      {/* Every stage stays mounted (hidden) so a single POST captures all answers/files and Back never clears. */}
      {STAGE_ORDER.map((stageKey) => (
        <div
          key={stageKey}
          hidden={stage !== stageKey}
          className="flex flex-col gap-4"
        >
          {sectionsFor(stageKey).map((section) => (
            <SectionFieldset
              key={section.id}
              section={section}
              values={values}
              error={error}
              baseline={baseline}
              onText={setVal}
              onItem={setItem}
              onFiles={(id, n) => setFileCounts((p) => ({ ...p, [id]: n }))}
            />
          ))}
        </div>
      ))}

      {/* Stage 3 — Review & submit */}
      <div hidden={!onReview} className="flex flex-col gap-4">
        <ReviewSummary template={template} values={values} fileCounts={fileCounts} />
        {damageWithoutPhoto ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          >
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Damage was reported without photos.
            </p>
            <p className="mt-1 text-muted-foreground">
              Photos help document condition and support follow-up. You can still add them in Return details.
            </p>
          </div>
        ) : null}
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

      {/* Server-authoritative omission acknowledgement (only meaningful when damage has no photo). */}
      <input type="hidden" name="damage_photos_omission_ack" value={omissionAck ? "yes" : ""} />

      {!onReview && error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      {/* Stage navigation */}
      {stage === "condition" ? (
        <Button type="button" onClick={() => goNext("condition", "return_details")} className="h-11 w-full">
          Continue
        </Button>
      ) : stage === "return_details" ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goBack("condition")}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Back
          </button>
          <Button type="button" onClick={() => goNext("return_details", "review")} className="h-11 flex-1">
            {reviewCta}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goBack("return_details")}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Back
          </button>
          <Button type="submit" onClick={handleSubmitClick} disabled={pending} className="h-11 flex-1">
            {pending ? submittingCta : submitCta}
          </Button>
        </div>
      )}

      {/* Accessible omission confirmation — native dialog (focus-trapping, Esc, no dependency). */}
      <dialog
        ref={dialogRef}
        aria-labelledby="omission-title"
        className="m-auto w-[min(92vw,26rem)] rounded-lg border bg-card p-5 text-foreground backdrop:bg-black/40"
      >
        <h2 id="omission-title" className="text-lg font-semibold">
          Submit without damage photos?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Damage was reported, but no damage photos were attached. Submit the inspection anyway?
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              submitAfterAckRef.current = true;
              setOmissionAck(true);
              dialogRef.current?.close();
            }}
            className="h-11 flex-1"
          >
            Submit without photos
          </Button>
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              focusDamageRef.current = true;
              setStage("return_details");
              window.scrollTo({ top: 0 });
            }}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Add photos
          </button>
        </div>
      </dialog>
    </form>
  );
}

function SectionFieldset({
  section,
  values,
  error,
  baseline,
  onText,
  onItem,
  onFiles,
}: {
  section: InspectionSection;
  values: Values;
  error: { fieldId: string; message: string } | null;
  baseline?: Record<string, string>;
  onText: (id: string, v: string) => void;
  onItem: (fieldId: string, itemId: string, v: string) => void;
  onFiles: (id: string, n: number) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <legend className="px-1 text-base font-semibold">{section.title}</legend>
      {section.help ? <p className="-mt-2 text-xs text-muted-foreground">{section.help}</p> : null}
      {section.fields
        .filter((f) => fieldVisible(f, values))
        .map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <FieldControl
              field={field}
              value={values[field.id]}
              error={error?.fieldId === field.id ? error.message : null}
              onText={(v) => onText(field.id, v)}
              onItem={(itemId, v) => onItem(field.id, itemId, v)}
              onFiles={(n) => onFiles(field.id, n)}
            />
            {baseline?.[field.id] ? (
              <details className="rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none font-medium">Baseline</summary>
                <p className="mt-1">{baseline[field.id]}</p>
              </details>
            ) : null}
          </div>
        ))}
    </fieldset>
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

  const errorNote = error ? (
    <span id={errDomId(field.id)} role="alert" className="text-xs text-destructive">
      {error}
    </span>
  ) : null;

  const invalid = Boolean(error);
  const aria = {
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? errDomId(field.id) : undefined,
  };

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
      return (
        <ChoiceGroup field={field} value={strVal} onChange={onText} options={PASS_FAIL_OPTIONS} error={error} />
      );
    case "yes_no":
      return (
        <ChoiceGroup field={field} value={strVal} onChange={onText} options={YES_NO_OPTIONS} error={error} />
      );
    case "select":
      return (
        <ChoiceGroup field={field} value={strVal} onChange={onText} options={field.options ?? []} error={error} />
      );
    case "fuel_charge_level":
      return (
        <ChoiceGroup field={field} value={strVal} onChange={onText} options={FUEL_OPTIONS} error={error} />
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
    case "accessory_checklist":
      return (
        <fieldset
          id={domId}
          className="flex flex-col gap-3 text-sm"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errDomId(field.id) : undefined}
        >
          <legend className="font-medium">{field.label}</legend>
          {(field.items ?? []).map((item) => {
            const itemVal = (value as Record<string, string>)?.[item.id] ?? "";
            return (
              <ChoiceRow
                key={item.id}
                legend={item.label}
                name={`answer:${field.id}:${item.id}`}
                value={itemVal}
                onChange={(v) => onItem(item.id, v)}
                options={ACCESSORY_OPTIONS}
              />
            );
          })}
          {errorNote}
        </fieldset>
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

/** A single field rendered as large, wrapping choice buttons (semantic radios). */
function ChoiceGroup({
  field,
  value,
  onChange,
  options,
  error,
}: {
  field: InspectionField;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error: string | null;
}) {
  const invalid = Boolean(error);
  return (
    <fieldset
      id={fieldDomId(field.id)}
      className="flex flex-col gap-1.5 text-sm"
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errDomId(field.id) : undefined}
    >
      <legend className="font-medium">
        {field.label}
        {field.required ? " *" : ""}
      </legend>
      {field.help ? <span className="-mt-1 text-xs text-muted-foreground">{field.help}</span> : null}
      <ChoiceButtons name={`answer:${field.id}`} value={value} onChange={onChange} options={options} />
      {error ? (
        <span id={errDomId(field.id)} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

/** An accessory item: a compact labeled row of choice buttons. */
function ChoiceRow({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="min-w-0 break-words">{legend}</legend>
      <ChoiceButtons name={name} value={value} onChange={onChange} options={options} />
    </fieldset>
  );
}

/** Shared radio-as-button group: 44px targets, wraps cleanly, keyboard + SR accessible. */
function ChoiceButtons({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="min-w-[5rem] flex-1">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="peer sr-only"
          />
          <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-accent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
            {o.label}
          </span>
        </label>
      ))}
    </div>
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
