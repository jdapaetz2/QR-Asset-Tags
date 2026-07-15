/**
 * Pure end-of-list state for the bounded history surfaces (Phase 3C.8.1). Both the asset timeline and the rental-
 * session browser are cursor-paginated and filterable, so the bottom-of-results message must distinguish the TRUE
 * end of all recorded history from merely the end of the CURRENT filter — otherwise "End of recorded history" on a
 * date-filtered view wrongly implies no older records exist.
 *
 *  - `load-more`     : more pages remain → show the Load-more control, no end message.
 *  - `end-all`       : no more, unfiltered, some items shown → the genuine end of all history.
 *  - `end-filtered`  : no more, filters active, some items shown → end of the filtered results (older records may
 *                      exist outside the filter); offer Clear filters.
 *  - `empty-filtered`: no items, filters active → nothing matches; offer Clear filters.
 *  - `empty-none`    : no items, unfiltered → genuinely empty surface.
 *
 * Each surface maps the state to its own copy. `hasActiveFilters` must come from PARSED/normalized filter values
 * (e.g. `filters.active`), not the raw query string — "All time + All events" is unfiltered.
 */
export type HistoryEndState =
  | "load-more"
  | "end-all"
  | "end-filtered"
  | "empty-filtered"
  | "empty-none";

export function historyEndState(input: {
  hasMore: boolean;
  hasActiveFilters: boolean;
  itemCount: number;
}): HistoryEndState {
  if (input.hasMore) return "load-more";
  if (input.itemCount === 0) return input.hasActiveFilters ? "empty-filtered" : "empty-none";
  return input.hasActiveFilters ? "end-filtered" : "end-all";
}
