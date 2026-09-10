/**
 * Engineering Phase D1 — saved-row fixtures for the notification projection tests. Test-only: nothing in the app
 * imports this module.
 *
 * Every shipped return-checklist shape is reproduced from the repository's own history rather than invented:
 *   - V1 flat          the seed rows in supabase/seed.sql
 *   - V2 2026-07-1     732ea7e (damage photos required, no additional-photos section)
 *   - V2 2026-07-1     8b57619 (additional-photos section added, same version string)
 *   - V2 2026-07-2     c3c42f3 before the 3C.1.1 hotfix, and after it (extra photo-gap keys)
 *   - custom           an organization template with an optional check and a conditionally hidden check
 */
import { RETURN_TEMPLATES, type ReturnTemplateKey } from "@/lib/inspections/templates";
import type { InspectionTemplate, PhotoAnswer } from "@/lib/inspections/types";
import type { SavedSubmissionRow } from "@/lib/notifications/projection";

export const ORG_ID = "c0000000-0000-4000-8000-0000000000a1";
export const OTHER_ORG_ID = "c0000000-0000-4000-8000-0000000000a2";
export const ASSET_ID = "a0000000-0000-4000-8000-0000000000b1";
export const SUBMISSION_ID = "7c0a55e1-2222-4222-8222-222222222222";
export const CREATED_AT = "2026-09-10T18:00:00.000Z";
export const SITE_URL = "https://mulemark.io";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A realistic server-built storage path for this fixture submission. */
export function mediaPath(name: string, ext = "jpg", orgId = ORG_ID): string {
  return `org/${orgId}/asset/${ASSET_ID}/submission/${SUBMISSION_ID}/${name}.${ext}`;
}

export function photo(slotLabel: string, name: string): PhotoAnswer {
  return { path: mediaPath(name), caption: slotLabel };
}

export function savedRow(overrides: Partial<SavedSubmissionRow> = {}): SavedSubmissionRow {
  return {
    id: SUBMISSION_ID,
    organization_id: ORG_ID,
    asset_id: ASSET_ID,
    form_type: "damage_report",
    submission_origin: "public",
    created_at: CREATED_AT,
    rental_session_id: null,
    submitted_by_name: "Jamie Rivera",
    submitted_by_email: "jamie@site.test",
    submitted_by_phone: "+1 604 555 0100",
    submission_data_json: {},
    media_urls: [],
    ...overrides,
  };
}

export function damageRow(
  data: Record<string, unknown>,
  overrides: Partial<SavedSubmissionRow> = {}
): SavedSubmissionRow {
  return savedRow({ form_type: "damage_report", submission_data_json: data, ...overrides });
}

export function supportRow(
  data: Record<string, unknown>,
  overrides: Partial<SavedSubmissionRow> = {}
): SavedSubmissionRow {
  return savedRow({ form_type: "support_request", submission_data_json: data, ...overrides });
}

export function returnRowV1(
  flat: Record<string, unknown>,
  overrides: Partial<SavedSubmissionRow> = {}
): SavedSubmissionRow {
  return savedRow({ form_type: "return_checklist", submission_data_json: flat, ...overrides });
}

export function returnRowV2(input: {
  template: InspectionTemplate;
  values: Record<string, unknown>;
  flags: Record<string, unknown>;
  photos?: Record<string, PhotoAnswer[]>;
  extra?: Record<string, unknown>;
  overrides?: Partial<SavedSubmissionRow>;
}): SavedSubmissionRow {
  const photos = input.photos ?? {};
  return savedRow({
    form_type: "return_checklist",
    submitted_by_phone: null,
    submission_data_json: {
      schema_version: 2,
      template_key: input.template.key,
      template_version: input.template.version,
      template_snapshot: input.template,
      answers: { values: input.values, photos },
      flags: input.flags,
      ...input.extra,
    },
    media_urls: Object.values(photos).flatMap((list) => list.map((p) => p.path)),
    ...input.overrides,
  });
}

/** The current system template (V2 2026-07-2). */
export function templateV2_20260702(key: ReturnTemplateKey = "portable_generator"): InspectionTemplate {
  return clone(RETURN_TEMPLATES[key]) as InspectionTemplate;
}

/** V2 2026-07-1 as first shipped (732ea7e): required damage photos, no additional-photos section. */
export function templateV2_20260701Initial(key: ReturnTemplateKey = "portable_generator"): InspectionTemplate {
  const template = templateV2_20260701WithAdditional(key);
  template.sections = template.sections.filter((section) => section.id !== "additional_photos");
  return template;
}

/** V2 2026-07-1 at 8b57619: the additional-photos section exists under the same version string. */
export function templateV2_20260701WithAdditional(
  key: ReturnTemplateKey = "portable_generator"
): InspectionTemplate {
  const template = templateV2_20260702(key);
  template.version = "2026-07-1";
  for (const section of template.sections) {
    section.fields = section.fields.map((field) =>
      field.id === "damage_photos"
        ? {
            ...field,
            required: true,
            photo: { minPhotos: 1, maxPhotos: 6 },
            help: "At least one close-up of the damage.",
          }
        : field
    );
  }
  return template;
}

/** A custom organization template: integer version, org-defined ids, an optional check, a hidden check. */
export function customTemplate(): InspectionTemplate {
  return {
    key: "org_trailer_family",
    version: "3",
    inspection_type: "return",
    name: "Yard trailer check",
    description: "Custom organization template.",
    equipmentTypes: ["Trailer"],
    sections: [
      {
        id: "photos",
        title: "Photos",
        fields: [
          { id: "yard_overview", type: "photo_slot", label: "Yard overview", photo: { minPhotos: 0, maxPhotos: 6 } },
        ],
      },
      {
        id: "checks",
        title: "Checks",
        fields: [
          { id: "hitch_pin", type: "pass_fail_na", label: "Hitch pin", required: true },
          { id: "cab_clean", type: "pass_fail_na", label: "Cleaned inside cab?" },
          { id: "had_damage", type: "yes_no", label: "Any damage?", required: true, flag: "damage_observed" },
        ],
      },
      {
        id: "damage_follow_up",
        title: "Damage follow-up",
        visible_when: { field: "had_damage", equals: "yes" },
        fields: [{ id: "frame_check", type: "pass_fail_na", label: "Frame check", required: true }],
      },
      {
        id: "gear",
        title: "Gear",
        fields: [
          {
            id: "gear_list",
            type: "accessory_checklist",
            label: "Gear",
            flag: "accessories",
            items: [
              { id: "straps", label: "Ratchet straps" },
              { id: "cones", label: "Cones" },
            ],
          },
        ],
      },
      {
        id: "confirmation",
        title: "Confirmation",
        fields: [{ id: "attestation", type: "acknowledgement", label: "I confirm.", required: true }],
      },
    ],
  };
}

/** A clean portable-generator return, every answer passing. */
export function cleanGeneratorValues(): Record<string, unknown> {
  return {
    run_hours: 120,
    fuel_or_charge_level: "Full",
    oil_level: "pass",
    cords_outlets: "pass",
    starts_operates: "yes",
    frame_wheels: "pass",
    damage_observed: "no",
    accessories: { cords: "returned", wheel_kit: "returned", manual: "returned" },
    attestation: "yes",
  };
}

export const CLEAN_FLAGS = { damage_observed: "no", accessories_missing: false };
