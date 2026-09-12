/**
 * Status under a photo input (lib/media/consumer-photo/use-photo-input.ts): progress with Cancel while photos are
 * prepared, then one line per photo that could not be used. Neutral styling, so it suits public and admin forms.
 */
export function PhotoInputStatus({
  preparing,
  problems,
  onCancel,
}: {
  preparing: { done: number; total: number } | null;
  problems: string[];
  onCancel: () => void;
}) {
  return (
    <>
      {preparing ? (
        <span role="status" className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {preparing.total === 1
            ? "Preparing photo…"
            : `Preparing photo ${Math.min(preparing.done + 1, preparing.total)} of ${preparing.total}…`}
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center px-1 font-medium underline underline-offset-4"
          >
            Cancel
          </button>
        </span>
      ) : null}
      {problems.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-xs text-destructive">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
