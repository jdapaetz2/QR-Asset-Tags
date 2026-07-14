"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { bulkSetSubmissionStatus } from "@/lib/submissions/actions";
import { submissionStatusActionClasses } from "@/lib/ui/status";

type SelectionContextValue = {
  selected: Set<string>;
  visibleIds: string[];
  viewingArchived: boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  setSelected: (next: Set<string>) => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("bulk-selection: component used outside BulkSelectionProvider");
  return ctx;
}

/**
 * Multi-select provider for the submissions inbox (Phase 3C.4). Selection is client state scoped to this
 * mount — the page keys the provider by the active filter signature, so any search/status/type/asset change
 * (a new key) remounts it and clears selection; navigating away unmounts it. "Select all" means only the rows
 * currently rendered by the active filter (`visibleIds`), never hidden org records.
 */
export function BulkSelectionProvider({
  visibleIds,
  viewingArchived,
  children,
}: {
  visibleIds: string[];
  viewingArchived: boolean;
  children: ReactNode;
}) {
  const [selected, setSelectedState] = useState<Set<string>>(new Set());
  const setSelected = (next: Set<string>) => setSelectedState(next);
  const toggle = (id: string) =>
    setSelectedState((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setSelectedState(new Set());
  const toggleAll = () =>
    setSelectedState((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(visibleIds);
    });

  return (
    <SelectionContext.Provider
      value={{ selected, visibleIds, viewingArchived, toggle, toggleAll, clear, setSelected }}
    >
      <BulkToolbar />
      {children}
    </SelectionContext.Provider>
  );
}

/** Header "select all visible" checkbox (indeterminate when a partial subset is selected). */
export function SelectAllCheckbox() {
  const { selected, visibleIds, toggleAll } = useSelection();
  const ref = useRef<HTMLInputElement>(null);
  const selectedVisible = visibleIds.filter((id) => selected.has(id)).length;
  const all = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selectedVisible > 0 && !all;
  }, [selectedVisible, all]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="size-4 align-middle"
      checked={all}
      onChange={toggleAll}
      aria-label="Select all visible submissions"
    />
  );
}

/** Per-row selection checkbox. */
export function SelectCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      className="size-4 align-middle"
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      aria-label="Select submission"
    />
  );
}

const TOOLBAR_BTN =
  "inline-flex min-h-9 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** The bulk-action toolbar + inline result banner. Renders above the table; visible when a row is selected. */
function BulkToolbar() {
  const { selected, viewingArchived, clear, setSelected } = useSelection();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const count = selected.size;

  function run(target: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    const ids = [...selected];
    startTransition(async () => {
      const res = await bulkSetSubmissionStatus(target, ids);
      if (res.ok) {
        setBanner({ text: res.message, tone: "ok" });
        setSelected(new Set()); // clear on success; revalidatePath refreshes the list rows
      } else {
        setBanner({ text: res.error, tone: "error" });
      }
    });
  }

  if (count === 0) {
    return banner ? (
      <div
        role="status"
        className={`rounded-lg border px-3 py-2 text-sm ${
          banner.tone === "error"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "bg-muted/40 text-muted-foreground"
        }`}
      >
        {banner.text}
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{count} selected</span>
        <span className="flex-1" />
        {viewingArchived ? (
          <button
            type="button"
            className={submissionStatusActionClasses("reviewed")}
            disabled={pending}
            onClick={() => run("reviewed")}
          >
            Restore as reviewed
          </button>
        ) : (
          <>
            <button
              type="button"
              className={submissionStatusActionClasses("reviewed")}
              disabled={pending}
              onClick={() => run("reviewed")}
            >
              Mark reviewed
            </button>
            <button
              type="button"
              className={submissionStatusActionClasses("resolved")}
              disabled={pending}
              onClick={() => run("resolved")}
            >
              Resolve
            </button>
            <button
              type="button"
              className={submissionStatusActionClasses("archived")}
              disabled={pending}
              onClick={() =>
                run(
                  "archived",
                  `Archive ${count} submission${count === 1 ? "" : "s"}? They will leave the active queue.`
                )
              }
            >
              Archive
            </button>
          </>
        )}
        <button
          type="button"
          className={`${TOOLBAR_BTN} text-muted-foreground`}
          disabled={pending}
          onClick={clear}
        >
          Clear selection
        </button>
      </div>
      {pending ? <p className="text-xs text-muted-foreground">Working…</p> : null}
      {banner ? (
        <p
          role="status"
          className={`text-xs ${banner.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {banner.text}
        </p>
      ) : null}
    </div>
  );
}
