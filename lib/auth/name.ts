/**
 * Derive a display first name for the dashboard greeting. There is no
 * `first_name` column — profiles carry only a full `name` — so we take the first
 * whitespace-delimited token, falling back to the email local-part (capitalized),
 * then a neutral "there". Pure + tested; no I/O.
 */
export function firstNameFrom(
  name: string | null | undefined,
  email?: string | null
): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  if (first) return first;
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  return "there";
}
