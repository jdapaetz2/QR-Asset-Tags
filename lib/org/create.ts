/**
 * Pure validation for owner-driven organization creation. No I/O — the create
 * action supplies the form and inserts the returned payload with the RLS server
 * client. Plan/commercial fields reuse `normalizePlanForm`; identity + branding
 * are validated here. `organization_id`/ownership are never read from form input.
 */

import { isHexColor } from "@/lib/public/brand";
import { normalizePlanForm, type PlanSettings } from "@/lib/plans/settings";
import { slugify, isValidSlug } from "@/lib/org/slug";

const ORG_STATUSES = ["active", "suspended"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NewOrgValues = {
  name: string;
  slug: string;
  status: "active" | "suspended";
  support_phone: string | null;
  support_email: string | null;
  website_url: string | null;
  primary_color: string | null;
  logo_url: string | null;
  powered_by_label: string | null;
} & PlanSettings;

export type NewOrgResult =
  | { value: NewOrgValues; error?: undefined }
  | { value?: undefined; error: string };

export type RawNewOrgForm = Record<string, string | undefined>;

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Validate + normalize a new-organization form into an insert payload. Name is
 * required; slug defaults to `slugify(name)` when blank and must be URL-safe;
 * status defaults to active. Plan fields are merged via `normalizePlanForm`.
 */
export function normalizeNewOrg(raw: RawNewOrgForm): NewOrgResult {
  const name = clean(raw.name);
  if (!name) return { error: "Organization name is required." };

  const slugInput = clean(raw.slug);
  const slug = slugInput ?? slugify(name);
  if (!slug) {
    return { error: "Could not derive a slug from the name — enter one manually." };
  }
  if (!isValidSlug(slug)) {
    return {
      error:
        "Slug must be lowercase letters, numbers, and single hyphens (e.g. test-valley-rentals).",
    };
  }

  const statusRaw = clean(raw.status) ?? "active";
  if (!(ORG_STATUSES as readonly string[]).includes(statusRaw)) {
    return { error: "Status must be active or suspended." };
  }

  const support_email = clean(raw.support_email);
  if (support_email && !EMAIL_RE.test(support_email)) {
    return { error: "Enter a valid support email address." };
  }

  const primary_color = clean(raw.primary_color);
  if (primary_color && !isHexColor(primary_color)) {
    return { error: "Primary color must be a #RRGGBB hex value." };
  }

  // Plan/commercial fields reuse the vetted owner-plan normalizer.
  const plan = normalizePlanForm(raw);
  if (!plan.value) return { error: plan.error };

  return {
    value: {
      name,
      slug,
      status: statusRaw as "active" | "suspended",
      support_phone: clean(raw.support_phone),
      support_email,
      website_url: clean(raw.website_url),
      primary_color,
      logo_url: clean(raw.logo_url),
      powered_by_label: clean(raw.powered_by_label),
      ...plan.value,
    },
  };
}
