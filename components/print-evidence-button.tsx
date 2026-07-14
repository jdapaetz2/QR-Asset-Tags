"use client";

/**
 * Print trigger for the session-evidence view (Phase 3C.5). The evidence sections are collapsed `<details>` on
 * screen; before printing, this opens every `details[data-evidence-section]` so the printed record is complete,
 * then restores each section's prior open/closed state after printing. CSS alone can't reliably force a closed
 * `<details>` open across browsers, so we toggle the attribute. No PDF infra — just `window.print()`.
 */
export function PrintEvidenceButton({ label = "Print evidence" }: { label?: string }) {
  function handlePrint() {
    const sections = Array.from(
      document.querySelectorAll<HTMLDetailsElement>("details[data-evidence-section]")
    );
    const prevOpen = sections.map((s) => s.open);
    sections.forEach((s) => {
      s.open = true;
    });

    const restore = () => {
      sections.forEach((s, i) => {
        s.open = prevOpen[i];
      });
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground print:hidden"
    >
      {label}
    </button>
  );
}
