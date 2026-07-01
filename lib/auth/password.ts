/**
 * Pure password validation for the invited-user set-password flow. No I/O — the
 * server action runs this before calling `auth.updateUser`. Keep the rule simple
 * and honest (Supabase enforces its own minimum too).
 */

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordResult = { error?: string };

/** Validate a new password + confirmation. Returns `{}` when acceptable. */
export function validatePassword(
  password: string,
  confirm: string
): PasswordResult {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }
  return {};
}
