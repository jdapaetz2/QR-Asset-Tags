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

/**
 * The first whitespace-delimited token of a profile name, or null when there is
 * none. Unlike firstNameFrom this does NOT guess from email — the dashboard
 * greeting falls back to the org name when a person has no name on file.
 */
export function firstNameToken(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Uppercase initials (max 2) for a compact avatar, from a name or email. */
export function initialsFrom(
  name: string | null | undefined,
  email?: string | null
): string {
  const tokens = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
  }
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  if (local) return local.slice(0, 2).toUpperCase();
  return "?";
}
