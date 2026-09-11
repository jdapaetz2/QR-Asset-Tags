"use client";

import { useEffect, useRef, useState } from "react";

import type { TriageOption } from "@/lib/submissions/triage";

/**
 * Engineering Phase D2 — one optional reported-triage question on a public form.
 *
 * Radios styled as large buttons (the same accessible pattern as the guided return form): a real radio group for
 * keyboard and screen-reader semantics, ≥44px targets, a visible focus ring, and a single hidden input carrying the
 * submitted value so what is posted always matches what is shown.
 *
 * Optional by design: nothing is selected initially, re-choosing the selected answer clears it, and a "Clear answer"
 * control appears while an answer is chosen. An empty value is stored as "Not reported".
 */
export function TriageChoiceGroup({
  name,
  legend,
  options,
}: {
  /** The submitted field, e.g. `reported_equipment_state`. */
  name: string;
  legend: string;
  options: readonly TriageOption[];
}) {
  const [value, setValue] = useState("");
  const groupRef = useRef<HTMLFieldSetElement>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const group = groupRef.current;
    const form = group?.form;
    if (!group || !form) return;
    // The public form dispatches its action from onSubmit, which avoids React's post-action form reset. A submit
    // React replays after hydration still resets the form: that unchecks every radio without re-rendering, while the
    // hidden input and this component keep the answer, so the renter would see a blank question that still submits a
    // value. Re-apply the chosen answer once any reset has run.
    const onReset = () => {
      setTimeout(() => {
        for (const radio of group.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
          radio.checked = radio.value === valueRef.current;
        }
      }, 0);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <fieldset ref={groupRef} className="flex flex-col gap-2 text-sm" data-triage-question={name}>
      <legend className="mb-2 font-medium">
        {legend} <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <label key={option.value} className="flex">
            <input
              type="radio"
              name={`ui:${name}`}
              value={option.value}
              checked={value === option.value}
              onChange={() => setValue(option.value)}
              onClick={() => {
                // Re-choosing the selected answer clears it. For a newly chosen answer `value` is still the previous
                // one here, so this only fires for the answer that was already selected.
                if (value === option.value) setValue("");
              }}
              className="peer sr-only"
            />
            <span className="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-accent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
              {option.label}
            </span>
          </label>
        ))}
      </div>
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          className="min-h-11 self-start text-sm text-muted-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Clear answer
        </button>
      ) : null}
    </fieldset>
  );
}
