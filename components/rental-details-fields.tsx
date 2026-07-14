/**
 * Shared optional rental-details inputs (Phase 3C.6) — the single field definition used everywhere a rental
 * session is created or a baseline attached: the Assets "Mark rented" dialog, the asset-detail start form, and
 * the staff outbound inspection. Both fields are optional and server-normalized by `normalizeRentalStart`
 * (trim, ≤120 chars, empty → null) — keeping identical names + semantics across surfaces. Presentational (no
 * hooks), so it renders in both server and client components.
 */
export function RentalDetailsFields({
  renterLabel,
  rentalReference,
  idPrefix = "rental",
}: {
  /** Prefill (e.g. an existing session's values on the outbound attach flow). */
  renterLabel?: string | null;
  rentalReference?: string | null;
  idPrefix?: string;
}) {
  const inputClass =
    "rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";
  return (
    <>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${idPrefix}-renter`}>
        <span>Renter / customer</span>
        <input
          id={`${idPrefix}-renter`}
          name="renter_label"
          className={inputClass}
          autoComplete="off"
          defaultValue={renterLabel ?? undefined}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${idPrefix}-reference`}>
        <span>Rental reference</span>
        <input
          id={`${idPrefix}-reference`}
          name="rental_reference"
          className={inputClass}
          autoComplete="off"
          defaultValue={rentalReference ?? undefined}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Optional — a customer name / PO helps match this rental later.
      </p>
    </>
  );
}
