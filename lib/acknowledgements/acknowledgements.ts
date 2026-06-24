/**
 * Pure validation + copy for the optional public acknowledgement. No I/O and no
 * `organization_id`/`asset_id` handling — those are derived server-side from the
 * resolved QR/asset (see lib/acknowledgements/actions.ts). This is a lightweight
 * record, NOT an e-signature or a contract.
 */

/** The statement a renter acknowledges. Stored on the record server-side. */
export const ACKNOWLEDGEMENT_STATEMENT =
  "I acknowledge that I have access to the rental company's instructions, safety notes, and support contact for this asset.";

export type AcknowledgementInput = {
  name: string | null;
  acknowledged: boolean;
};

/** Returns an error string when the acknowledgement can't be recorded, else null. */
export function validateAcknowledgement(input: AcknowledgementInput): string | null {
  if (!input.name) return "Please enter your name.";
  if (!input.acknowledged) return "Please check the acknowledgement box to continue.";
  return null;
}
