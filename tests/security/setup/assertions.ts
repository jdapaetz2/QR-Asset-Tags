import { expect } from "vitest";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { serviceClient } from "./fixtures";

/**
 * Behavioral RLS assertions. Two failure modes exist in PostgREST and they are NOT
 * interchangeable, so we assert the actual observed behavior rather than guessing:
 *
 *   - INSERT blocked by a WITH CHECK  -> a PostgrestError (code 42501).
 *   - UPDATE whose USING excludes the row -> NO error, simply 0 rows affected (the row is
 *     filtered out), OR a trigger silently coerces the value. Either way the truth is in the
 *     row afterwards, so `expectUnchanged` reads it back via the service client.
 *   - SELECT denied -> NO error, 0 rows returned.
 *
 * No key or token is ever interpolated into a message — labels name resource/action/role.
 */

/** An INSERT (or a WITH CHECK-violating write) that RLS must reject with an error. */
export function expectInsertDenied(
  result: { error: PostgrestError | null; data: unknown },
  label: string
): void {
  expect(result.error, `${label}: expected RLS to DENY the insert, but it succeeded`).toBeTruthy();
}

/** An INSERT that RLS must allow. */
export function expectInsertAllowed(
  result: { error: PostgrestError | null },
  label: string
): void {
  expect(result.error?.message ?? null, `${label}: expected the insert to be ALLOWED`).toBeNull();
}

/** A SELECT that returns rows (own-org read allowed). */
export function expectRowsReturned(
  result: { error: PostgrestError | null; data: unknown[] | null },
  label: string
): void {
  expect(result.error?.message ?? null, `${label}: unexpected error on an allowed read`).toBeNull();
  expect((result.data ?? []).length, `${label}: expected rows to be returned`).toBeGreaterThan(0);
}

/** A SELECT that returns zero rows (cross-org / denied read). No error — RLS just filters. */
export function expectNoRows(
  result: { error: PostgrestError | null; data: unknown[] | null },
  label: string
): void {
  expect((result.data ?? []).length, `${label}: expected ZERO rows (cross-org/denied read leaked data)`).toBe(0);
}

/** Read a single column back via the service client to check whether a write actually took. */
export async function readColumn<T = unknown>(
  table: string,
  id: string,
  column: string
): Promise<T | undefined> {
  const admin = serviceClient();
  const { data } = await admin.from(table).select(column).eq("id", id).maybeSingle();
  return (data as Record<string, T> | null)?.[column];
}

/** Assert a column equals an expected value after an attempted (denied) write. */
export async function expectUnchanged(
  table: string,
  id: string,
  column: string,
  expected: unknown,
  label: string
): Promise<void> {
  const actual = await readColumn(table, id, column);
  expect(actual, `${label}: value was mutated (write should have been denied)`).toEqual(expected);
}

/** Assert a column now equals an expected value after an allowed write. */
export async function expectChanged(
  table: string,
  id: string,
  column: string,
  expected: unknown,
  label: string
): Promise<void> {
  const actual = await readColumn(table, id, column);
  expect(actual, `${label}: value did not change (write should have been allowed)`).toEqual(expected);
}

/** Convenience: run a SELECT for a table id as a given client. */
export async function selectById(
  client: SupabaseClient,
  table: string,
  id: string
): Promise<{ error: PostgrestError | null; data: unknown[] | null }> {
  return client.from(table).select("id").eq("id", id);
}
