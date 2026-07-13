"use client";

/** Minimal print trigger for the printable session evidence view (Phase 3B). No PDF infra — just print. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground print:hidden"
    >
      {label}
    </button>
  );
}
