/**
 * Pure validation/normalization for the organization settings (branding +
 * support) form. No I/O and no `organization_id` handling — the org is always
 * derived from the signed-in profile (customer) or the owner route param, never
 * from user input. See lib/org/actions.ts.
 */

import { isHexColor } from "@/lib/public/brand";
import { isHttpUrl } from "@/lib/documents/validate";
import { isValidCoverImage } from "@/lib/assets/validate";

export type OrgSettingsInput = {
  name: string;
  support_phone: string | null;
  support_email: string | null;
  website_url: string | null;
  primary_color: string | null;
  logo_url: string | null;
};

export type OrgSettingsResult =
  | { value: OrgSettingsInput; error?: undefined }
  | { value?: undefined; error: string };

export type RawOrgSettingsForm = Record<string, string | undefined>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizeOrgSettings(raw: RawOrgSettingsForm): OrgSettingsResult {
  const name = clean(raw.name);
  if (!name) return { error: "Organization name is required." };

  const support_email = clean(raw.support_email);
  if (support_email && !EMAIL_RE.test(support_email)) {
    return { error: "Support email must be a valid email address." };
  }

  const website_url = clean(raw.website_url);
  if (website_url && !isHttpUrl(website_url)) {
    return { error: "Website must be a valid http(s) URL." };
  }

  const primary_color = clean(raw.primary_color);
  if (primary_color && !isHexColor(primary_color)) {
    return { error: "Primary color must be a hex value like #1d4ed8." };
  }

  const logo_url = clean(raw.logo_url);
  if (logo_url && !isValidCoverImage(logo_url)) {
    return { error: "Logo must be an https image URL or a /demo-assets/… path." };
  }

  return {
    value: {
      name,
      support_phone: clean(raw.support_phone),
      support_email,
      website_url,
      primary_color,
      logo_url,
    },
  };
}
