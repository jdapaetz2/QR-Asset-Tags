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
import {
  photoSlotHelp,
  REVIEW_DAMAGE_NO_PHOTO,
  REVIEW_NO_PHOTOS,
} from "@/lib/inspections/photo-copy";
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
  // Explicit-submit gate (Phase 3C.3): the form action fires ONLY when an intended submit path sets this true
  // — the final Submit button (no dialog needed) or the dialog's "Submit without photos". Every implicit
  // submission (Enter in a text field, a stray untyped button, a submit outside Review) is blocked by onSubmit.
  const allowSubmitRef = useRef(false);
  const pendingFocusRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const activeSections = useMemo(
    () => template.sections.filter((s) => isConditionMet(s.visible_when, values)),
    [template.sections, values]
  );
  const sectionsFor = (stageKey: InspectionStage) =>
    activeSections.filter((s) => sectionStage(s) === stageKey);

  const damageShown = values["damage_observed"] === "yes";

  // Photo counts over the currently-VISIBLE slots (Phase 3C.1.1) — drives the consolidated omission dialog
  // and the Review warnings. Hidden/stale slots (e.g. damage photos when damage=no) are excluded.
  const photoCounts = visiblePhotoSlotCounts(template, values, fileCounts);
  const totalPhotoCount = photoCounts.reduce((n, s) => n + s.count, 0);
  const damagePhotoCount = photoCounts.find((s) => s.id === DAMAGE_PHOTOS_SLOT_ID)?.count ?? 0;
  const damageWithoutPhoto = damageShown && damagePhotoCount === 0;
  const hasPhotoSlots = photoCounts.length > 0;
  const noPhotosAtAll = hasPhotoSlots && totalPhotoCount === 0;
  const someRecommendedMissing = totalPhotoCount > 0 && photoCounts.some((s) => s.count === 0);
  const firstPhotoSlotId = photoCounts[0]?.id ?? DAMAGE_PHOTOS_SLOT_ID;
  // Which single omission dialog (if any) to show on Submit — the stronger damage warning wins.
  const omissionKind: "damage" | "none" | null = damageWithoutPhoto
    ? "damage"
    : noPhotosAtAll
      ? "none"
      : null;

  // Selecting/typing a value immediately clears that field's stale required error (Phase 3C.1.1).
  const clearErrorFor = (id: string) => setError((e) => (e?.fieldId === id ? null : e));
  const setVal = (id: string, v: string) => {
    setValues((p) => ({ ...p, [id]: v }));
    clearErrorFor(id);
  };
  const setItem = (fieldId: string, itemId: string, v: string) => {
    setValues((p) => {
      const cur = (p[fieldId] as Record<string, string>) ?? {};
      return { ...p, [fieldId]: { ...cur, [itemId]: v } };
    });
    clearErrorFor(fieldId);
  };

  function focusFirstError(fieldId: string) {
    const el = document.getElementById(fieldDomId(fieldId));
    el?.scrollIntoView({ block: "center" });
    (el as HTMLElement | null)?.focus?.();
    if (el && document.activeElement !== el) {
      (el.querySelector("input,select,textarea,button") as HTMLElement | null)?.focus?.();
    }
  }

  function stageOfField(fieldId: string): InspectionStage | null {
    for (const s of template.sections) {
      if (s.fields.some((f) => f.id === fieldId)) return sectionStage(s);
    }
    return null;
  }

  /**
   * Advance a stage. No auto-advance on choice selection. The final step to Review validates ALL visible
   * non-photo required fields (Phase 3C.1.1) so Review can never open with a genuine missing answer; a
   * failure jumps to the offending field's stage and focuses it. Photos never block (they are recommended).
   */
  function goNext(current: InspectionStage, next: "return_details" | "review") {
    const err =
      next === "review"
        ? firstInspectionError(template, values)
        : firstInspectionError(template, values, { sectionFilter: (s) => sectionStage(s) === current });
    if (err) {
      setError(err);
      const target = stageOfField(err.fieldId) ?? current;
      if (target !== current) {
        pendingFocusRef.current = err.fieldId;
        setStage(target);
        window.scrollTo({ top: 0 });
      } else {
        focusFirstError(err.fieldId);
      }
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

  // Focus a pending field after a stage switch (validation jump, or the dialog's "Add photos"). DOM only.
  useEffect(() => {
    if (pendingFocusRef.current) {
      const id = pendingFocusRef.current;
      pendingFocusRef.current = null;
      const el = document.getElementById(fieldDomId(id));
      el?.scrollIntoView({ block: "center" });
      (el as HTMLElement | null)?.focus?.();
      if (el && document.activeElement !== el) {
        (el.querySelector("input,select,textarea,button") as HTMLElement | null)?.focus?.();
      }
    }
  }, [stage]);

  // Submit only after the omission acknowledgement flag is committed to the DOM (hidden input).
  useEffect(() => {
    if (omissionAck && submitAfterAckRef.current) {
      submitAfterAckRef.current = false;
      allowSubmitRef.current = true; // confirmed omission → this requestSubmit is an intended submit.
      formRef.current?.requestSubmit();
    }
  }, [omissionAck]);

  function handleSubmitClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Guard: one consolidated confirmation when a recommended-photo condition applies (damage → precedence).
    if (omissionKind && !omissionAck) {
      e.preventDefault();
      dialogRef.current?.showModal();
      return;
    }
    // No dialog needed (or already acknowledged): this is the explicit, intended submission.
    allowSubmitRef.current = true;
  }

  const onReview = stage === "review";
  const stepIndex = stage === "condition" ? 1 : stage === "return_details" ? 2 : 3;

  return (
    <form
      action={formAction}
      ref={formRef}
      onSubmit={(e) => {
        // Only an intended submit path (final Submit / confirmed dialog) sets allowSubmitRef. Everything else —
        // Enter in a field, a stray submit, entering Review — is cancelled here before the action can run.
        if (!allowSubmitRef.current) {
          e.preventDefault();
          return;
        }
        allowSubmitRef.current = false; // consume: guarantees exactly one submission per intended press.
      }}
      className="flex flex-col gap-5 pb-24"
    >
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
        {/* One consolidated evidence note (priority: damage → no photos → some recommended missing). */}
        {damageWithoutPhoto ? (
          <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="text-muted-foreground">{REVIEW_DAMAGE_NO_PHOTO}</p>
          </div>
        ) : noPhotosAtAll ? (
          <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="text-muted-foreground">{REVIEW_NO_PHOTOS}</p>
          </div>
        ) : someRecommendedMissing ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Some photos weren&apos;t added. You can add more in Return details.
          </p>
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
          {omissionKind === "damage"
            ? "Submit damage report without photos?"
            : "Submit without condition photos?"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {omissionKind === "damage" ? REVIEW_DAMAGE_NO_PHOTO : REVIEW_NO_PHOTOS}
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
              pendingFocusRef.current = damageWithoutPhoto ? DAMAGE_PHOTOS_SLOT_ID : firstPhotoSlotId;
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
        // Photos are welcome, never required (Phase 3C.1.1) — no asterisk. Approved copy overrides the
        // template's stored `help` so guidance reads consistently for renters and staff (Phase 3C.3).
        <label className="flex flex-col gap-1 text-sm" htmlFor={domId}>
          <span className="font-medium">{field.label}</span>
          <span className="text-xs text-muted-foreground">
            {photoSlotHelp(field.id)}
          </span>
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

/**
 * Shared radio-as-button group: 44px targets, wraps cleanly, keyboard + SR accessible.
 *
 * Submission fix (Phase 3C.1.1): the value POSTed to the server is a single hidden input sourced directly
 * from `value` (the canonical `values` state that the Review summary + client validation read) — so the
 * submitted answer can never diverge from what the user sees. The visible radios are grouped under a
 * NON-`answer` name (`ui:<name>`) so they drive UX + keyboard/SR semantics only and are ignored by the
 * server (`parseAnswerValues` reads `answer:*` exclusively).
 */
function ChoiceButtons({
  name,
  value,
  onChange,
  options,
}: {
  name: string; // canonical answer key, e.g. "answer:tires_wheels" or "answer:accessories:straps"
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const groupName = `ui:${name}`;
  return (
    <>
      {/* Single canonical submitted value — always in sync with client state. */}
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="min-w-[5rem] flex-1">
            <input
              type="radio"
              name={groupName}
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
    </>
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
