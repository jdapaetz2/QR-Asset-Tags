/**
 * Pure helpers for the public equipment page. No I/O.
 */

type SupportSource = {
  support_phone_override?: string | null;
  support_email_override?: string | null;
};

type OrgSupport = {
  support_phone?: string | null;
  support_email?: string | null;
};

export type SupportContact = { phone: string | null; email: string | null };

/** Support contact for the public page: asset override first, then org fallback. */
export function resolveSupportContact(
  asset: SupportSource | null | undefined,
  org: OrgSupport | null | undefined
): SupportContact {
  return {
    phone: asset?.support_phone_override ?? org?.support_phone ?? null,
    email: asset?.support_email_override ?? org?.support_email ?? null,
  };
}
