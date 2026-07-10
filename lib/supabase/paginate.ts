/**
 * Fetch every row a query would return, paging past PostgREST's default
 * `Max Rows = 1000` cap. The caller supplies a factory that applies `.range(from, to)`
 * to a fresh query each page (a spent builder can't be re-ranged), so the loop stays
 * explicit and **bounded**: it stops when a page returns fewer than `pageSize` rows
 * and hard-caps at `maxPages` to guarantee no runaway request loop.
 *
 * Intended for range-windowed reads (the caller filters to the selected date range),
 * so the total pulled is bounded by the range, not all history. Fails soft: on a
 * query error it returns whatever pages already succeeded.
 */
export async function fetchAllInRange<T>(
  makeQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  { pageSize = 1000, maxPages = 40 }: { pageSize?: number; maxPages?: number } = {}
): Promise<{ rows: T[]; capped: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) break; // fail soft — return what we already have
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, capped: false };
  }
  // Reached maxPages without a short page → there may be more rows than we fetched.
  return { rows, capped: true };
}
