import * as React from "react";

/** Page title + optional description, with optional right-aligned actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-3">
      {/* `min-w-0` lets the title block shrink instead of forcing the header wider than the
          viewport (a flex child defaults to min-width:auto). */}
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {/* `flex-wrap` (Phase B2): several pages put 3-4 secondary links plus a primary button here.
          Without wrapping, that row is ~450px wide and overflowed the page at phone widths — the
          non-table half of the D-1 report. */}
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
