/**
 * Short-code generation for QR links. Pure (no I/O) so it is easy to test; the
 * server action supplies randomness from `crypto.randomBytes`.
 *
 * The alphabet is lowercase and excludes ambiguous characters (0/o, 1/l/i) so
 * codes are URL-safe and human-readable on a printed tag.
 */

export const SHORT_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const SHORT_CODE_LENGTH = 8;

/** Map raw bytes onto the safe alphabet, producing a SHORT_CODE_LENGTH code. */
export function shortCodeFromBytes(bytes: Uint8Array): string {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    const byte = bytes[i] ?? 0;
    code += SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length];
  }
  return code;
}
