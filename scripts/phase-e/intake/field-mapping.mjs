/**
 * Engineering Phase E3 — the versioned field mapping for the setup workbook (kit 2.0).
 *
 * One definition drives the workbook's CALL SHEET and tables, the reader and the readiness rules, and it is published
 * as docs/phase-e/intake/internal/field-mapping-<version>.json for E4. Since kit 2.0 the workbook is Mulemark's own
 * working file: the customer answers on a call and sends their own equipment list; they never see these labels.
 *
 * Tiers: "start" = needed to import a private draft; "golive" = needed before the pages can go live (review-ready);
 * "optional". Targets name where a value lands: the current CSV import column (lib/onboarding/import.ts), the content
 * contract path (docs/phase-e/schema/equipment-content.schema.json 1.3.0), the app column, or "kit_only" with the
 * reason when the product has no home for it yet. Labels can change between versions; keys never do.
 */
import { KIT, LISTS } from "./kit-config.mjs";

export const TIERS = ["start", "golive", "optional"];
export const TIER_LABEL = { start: "TO START", golive: "BEFORE GO-LIVE", optional: "OPTIONAL" };

/** Data tabs: title row 1, note row 2, band row 3, labels row 4, hints row 5, input from row 6. */
export const LAYOUT = { titleRow: 1, noteRow: 2, bandRow: 3, labelRow: 4, hintRow: 5, firstDataRow: 6 };

const f = (key, label, tier, type, extra = {}) => ({ key, label, tier, type, ...extra });

// ------------------------------------------------------------------------------------------------ CALL SHEET

/**
 * The CALL SHEET form: one row per question (columns A Needed, B Question, C Answer, D Help), in the order of the work:
 * what can be copied from the customer's website before the call, what to ask on the call, the defaults (blank keeps
 * the app's own setting) and the batch's dates and time (contract batch.measurements).
 */
export const COMPANY_SECTIONS = [
  {
    title: "Before the call: from their website (confirm on the call)",
    fields: [
      f("company.name", "Company name (as renters see it)", "start", "text", {
        hint: "e.g. Northridge Rentals",
        targets: { contract: "organization.name", app: "organizations.name" },
      }),
      f("company.website", "Website", "optional", "url", {
        hint: "https://…",
        targets: { app: "organizations.website_url", kit_only: "The content contract has no website field." },
      }),
      f("company.logo_file", "Logo file", "optional", "text", {
        hint: "Saved in inbox\\Company\\. PNG or JPG; a design file (.ai, .eps, .svg) is fine, it gets converted.",
        targets: { contract: "organization.logo", app: "organizations.logo_url (uploaded by Mulemark)" },
      }),
      f("company.brand_color", "Brand color", "optional", "choice+text", {
        list: "brandColor",
        hint: "A color like #1D4ED8, or Match our logo.",
        targets: { contract: "organization.primary_color", app: "organizations.primary_color" },
      }),
      f("company.support_phone", "Support phone renters see", "golive", "phone", {
        hint: "Phone, email or both: at least one. A normal phone number gets a Call button.",
        targets: { contract: "organization.support.phone", app: "organizations.support_phone" },
      }),
      f("company.support_email", "Support email renters see", "golive", "email", {
        hint: "Phone, email or both: at least one.",
        targets: { contract: "organization.support.email", app: "organizations.support_email" },
      }),
      f("rules.fuel", "Their rule: fuel or charge on return", "optional", "text", {
        hint: "From their website or the call. Short: what renters must do, e.g. Return with a full tank.",
        targets: { contract: "organization.policies[] (customer-owned)", app: "equipment_pages.fuel_power_notes / return_notes (drafted, cited as their rule)" },
      }),
      f("rules.cleaning", "Their rule: cleaning", "optional", "text", {
        hint: "e.g. Return clean or a cleaning fee applies.",
        targets: { contract: "organization.policies[] (customer-owned)", app: "equipment_pages.return_notes (drafted)" },
      }),
      f("rules.accessories", "Their rule: accessories", "optional", "text", {
        hint: "e.g. Everything sent out comes back.",
        targets: { contract: "organization.policies[] (customer-owned)", app: "equipment_pages.return_notes (drafted)" },
      }),
      f("rules.damage_late", "Their rule: damage and late returns", "optional", "text", {
        hint: "e.g. Report damage right away with the Report button.",
        targets: { contract: "organization.policies[] (customer-owned)", app: "equipment_pages.return_notes (drafted)" },
      }),
      f("rules.other", "Other rules renters must know", "optional", "text", {
        hint: "Only what renters must do; never their rental agreement.",
        targets: { contract: "organization.policies[] (customer-owned)", app: "equipment_pages (drafted, cited as their rule)" },
      }),
    ],
  },
  {
    title: "Ask on the call (in this order; people go in the table on the right)",
    fields: [
      f("company.support_hours", "Support hours", "optional", "text", {
        hint: "e.g. Mon–Fri 7 am–5 pm. Shown in each page's support section.",
        targets: { contract: "organization.support.hours", app: "equipment_pages.emergency_notes (drafted by Mulemark; no hours column)" },
      }),
      f("approver.name", "Who approves the pages: name", "golive", "text", {
        hint: "Gets the preview email and replies Approved.",
        targets: { contract: "organization.approver.name_ref (reference only; the name stays in private storage)", app: "approval record (E5A)" },
      }),
      f("approver.title", "Approver's job title", "golive", "text", {
        hint: "e.g. Operations manager",
        targets: { contract: "organization.approver.role", app: "approval record (E5A)" },
      }),
      f("approver.email", "Approver's email", "golive", "email", {
        hint: "The preview email goes here.",
        targets: { app: "profiles.email (invited as Administrator)", kit_only: "Manifests never hold real names or addresses." },
      }),
      f("alerts.notification_email", "Where renter reports go (one email)", "golive", "email", {
        hint: "Damage and support reports and the daily summary.",
        targets: { contract: "organization.notifications.address_role", app: "organizations.notification_email" },
      }),
      f("alerts.urgent_email", "Urgent reports also to (one email)", "optional", "email", {
        hint: "Reports marked unsafe to use or can't move also go here. Blank: no copy.",
        targets: { app: "organizations.urgent_notification_email (+ notify_urgent_reports)", kit_only: "Not in the content contract." },
      }),
      f("tags.ship_to", "Ship tags to", "golive", "text", {
        hint: "Street, city, province or state, postal code. Needed before tags are made.",
        targets: { kit_only: "Tag requests have no shipping address; used on the tag order." },
      }),
      f("tags.contact", "Tag delivery contact", "optional", "text", {
        hint: "Name and phone for the courier.",
        targets: { kit_only: "Tag requests have no delivery contact; used on the tag order." },
      }),
    ],
  },
  {
    title: "Defaults: blank keeps the app's setting",
    fields: [
      f("alerts.damage", "Email damage reports", "optional", "choice", {
        list: "yesNo",
        hint: "Blank: Yes.",
        targets: { app: "organizations.notify_damage_reports", kit_only: "Not in the content contract." },
      }),
      f("alerts.support", "Email support requests", "optional", "choice", {
        list: "yesNo",
        hint: "Blank: Yes.",
        targets: { app: "organizations.notify_support_requests", kit_only: "Not in the content contract." },
      }),
      f("alerts.return_mode", "Return emails", "optional", "choice", {
        list: "returnEmails",
        hint: "Blank: Off. Renters can fill a return checklist on the page.",
        targets: { contract: "organization.notifications.return_mode", app: "organizations.return_notification_mode" },
      }),
      f("alerts.tag_updates", "Email tag order updates", "optional", "choice", {
        list: "yesNo",
        hint: "Blank: No.",
        targets: { app: "organizations.notify_tag_request_updates", kit_only: "Not in the content contract." },
      }),
      f("alerts.photo_previews", "Photo previews in emails", "optional", "choice", {
        list: "yesNo",
        hint: "Blank: Yes. Small copies of the renter's photos inside the email.",
        targets: { app: "organizations.notify_include_photo_previews", kit_only: "Not in the content contract." },
      }),
      f("tags.mounting", "How tags attach", "optional", "choice", {
        list: "tagMounting",
        hint: "Blank or Not sure: recommend one.",
        targets: { app: "tag_requests.mounting_method", kit_only: "Not in the content contract." },
      }),
      f("tags.size", "Tag size", "optional", "choice", {
        list: "tagSize",
        hint: "Blank or Not sure: as the agreement sets.",
        targets: { app: "tag_requests.tag_size", kit_only: "Not in the content contract." },
      }),
      f("tags.material", "Tag material", "optional", "choice", {
        list: "tagMaterial",
        hint: "Blank or Not sure: as the agreement sets.",
        targets: { app: "tag_requests.material", kit_only: "Not in the content contract." },
      }),
    ],
  },
  {
    title: "Dates and time (this batch)",
    fields: [
      f("batch.complete_on", "Everything in (list and call answers)", "optional", "date", {
        hint: "The day the batch was complete: the 3-business-day target starts here.",
        targets: { contract: "batch.measurements.batch_complete_at" },
      }),
      f("batch.preview_sent_on", "Preview sent", "optional", "date", {
        hint: "The day the preview email went out (review-ready).",
        targets: { contract: "batch.measurements.review_ready_at" },
      }),
      f("batch.approved_on", "Approved", "optional", "date", {
        hint: "The day of their Approved reply; save the reply in the batch folder.",
        targets: { kit_only: "The approval record itself is E5A's." },
      }),
      f("batch.live_on", "Live", "optional", "date", {
        hint: "The day the pages went live.",
        targets: { kit_only: "Recorded for the batch; not a contract field." },
      }),
      f("batch.hands_on_minutes", "Hands-on minutes (Mulemark)", "optional", "number", {
        hint: "Total for this batch: call, research, pages, emails.",
        targets: { contract: "batch.measurements.hands_on_minutes" },
      }),
      f("batch.customer_wait_hours", "Hours waiting on the customer", "optional", "number", {
        hint: "Optional: from a question to their answer.",
        targets: { contract: "batch.measurements.customer_wait_hours" },
      }),
    ],
  },
];

export const PEOPLE_COLUMNS = [
  f("people.name", "Name", "golive", "text", { width: 24, hint: "One Administrator is enough to start; they can add the rest.", targets: { app: "profiles.name" } }),
  f("people.email", "Email", "golive", "email", { width: 30, hint: "Each person signs in with their own. Any address they read works.", targets: { app: "profiles.email" } }),
  f("people.role", "Role", "golive", "choice", {
    list: "role",
    width: 24,
    hint: "Administrator: settings, team, approval. Staff: equipment, reports, rentals.",
    targets: { app: "profiles.role (customer_admin / customer_staff)" },
  }),
  f("people.notes", "Notes", "optional", "text", { width: 26, hint: "e.g. Yard lead", targets: { kit_only: "Never published." } }),
];

/** Columns in tier order (TO START, BEFORE GO-LIVE, OPTIONAL), so the bands are contiguous and filling can stop early. */
function inOrder(defs, keys) {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  if (keys.length !== defs.length || keys.some((k) => !byKey.has(k))) throw new Error("Column order must list every column once.");
  return keys.map((k) => byKey.get(k));
}

// ------------------------------------------------------------------------------------------------ ASSETS

const ASSET_DEFS = [
  f("asset.code", "Asset code", "start", "code", {
    width: 14,
    hint: "Exactly as on their list or tag, e.g. 00412",
    targets: { current_import: "asset_code", contract: "assets[].asset_code", app: "assets.asset_code" },
  }),
  f("asset.name", "Asset name", "start", "text", {
    width: 28,
    hint: "What renters see, e.g. Dump trailer 14 ft",
    targets: { current_import: "asset_name", contract: "assets[].asset_name", app: "assets.asset_name" },
  }),
  f("asset.model", "Model name (from MODELS)", "golive", "choice+text", {
    list: "modelChoices",
    width: 26,
    hint: "As named on MODELS, e.g. Big Tex 14LP dump",
    targets: { current_import: "make, model (from the MODELS row)", contract: "assets[].model_key (via MODELS)", app: "assets.make, assets.model" },
  }),
  f("asset.category", "Category", "optional", "choice+text", {
    list: "category",
    width: 20,
    hint: "Only if different from its model's category",
    targets: { current_import: "category", contract: "assets[].category", app: "assets.category" },
  }),
  f("asset.year", "Year", "optional", "year", {
    width: 10,
    hint: "If the manual needs it",
    targets: { current_import: "year", contract: "assets[].year", app: "assets.year" },
  }),
  f("asset.serial", "Serial number", "optional", "text", {
    width: 18,
    hint: "If the manual needs it (see MODELS)",
    targets: { current_import: "serial_number", contract: "assets[].serial_number", app: "assets.serial_number" },
  }),
  f("asset.photo", "Photo", "optional", "choice+text", {
    list: "assetPhoto",
    width: 20,
    hint: "Optional. In Photos folder (inbox\\Photos\\<code>\\), Use model photo, or a file name. Blank: none yet",
    targets: { contract: "assets[].photo", app: "assets.cover_image_url (uploaded by Mulemark)" },
  }),
  f("asset.fitted", "Fitted options on this unit", "optional", "text", {
    width: 22,
    hint: "e.g. Thumb, spare tire",
    targets: { contract: "assets[].fitted_options", app: "equipment_pages (drafted)" },
  }),
  f("asset.differences", "What's different about this unit?", "optional", "text", {
    width: 26,
    hint: "Anything that differs from the model",
    targets: { contract: "assets[].exceptions (your statement, reviewed before use)", app: "equipment_pages (drafted)" },
  }),
  f("asset.unit_support", "Support contact for this unit", "optional", "text", {
    width: 22,
    hint: "Only if different from the main support: a phone or an email",
    targets: {
      current_import: "support_phone_override / support_email_override",
      contract: "assets[].support_overrides",
      app: "assets.support_phone_override / support_email_override",
    },
  }),
  f("asset.tag", "Tag", "optional", "choice", {
    list: "tag",
    width: 22,
    hint: "Blank: New tag. Or Already has a Mulemark tag, or No tag for now",
    targets: { contract: "assets[].qr.create", app: "qr_links (created by Mulemark after approval)" },
  }),
  f("asset.notes", "Notes", "optional", "text", {
    width: 26,
    hint: "Never published",
    targets: { kit_only: "Read by Mulemark; never published." },
  }),
];

export const ASSET_COLUMNS = inOrder(ASSET_DEFS, [
  "asset.code",
  "asset.name",
  "asset.model",
  "asset.photo",
  "asset.tag",
  "asset.category",
  "asset.year",
  "asset.serial",
  "asset.fitted",
  "asset.differences",
  "asset.unit_support",
  "asset.notes",
]);

// ------------------------------------------------------------------------------------------------ MODELS

const MODEL_DEFS = [
  f("model.name", "Model name (short)", "golive", "text", {
    width: 26,
    hint: "Each machine on ASSETS uses this name, e.g. Big Tex 14LP dump",
    targets: { contract: "models[].model_key (derived from make, model and version)", kit_only: "The join between ASSETS and MODELS." },
  }),
  f("model.make", "Make", "golive", "text", {
    width: 16,
    hint: "e.g. Big Tex",
    targets: { current_import: "make", contract: "models[].manufacturer", app: "assets.make" },
  }),
  f("model.model", "Model", "golive", "text", {
    width: 14,
    hint: "e.g. 14LP",
    targets: { current_import: "model", contract: "models[].model", app: "assets.model" },
  }),
  f("model.version", "Size or version", "optional", "text", {
    width: 18,
    hint: "e.g. 14 ft deck, canopy",
    targets: { contract: "models[].configuration.version" },
  }),
  f("model.category", "Category", "optional", "choice+text", {
    list: "category",
    width: 20,
    hint: "A label, e.g. Dump trailer",
    targets: { contract: "models[].category", app: "assets.category (when the asset row leaves it blank)" },
  }),
  f("model.manual", "Manual", "golive", "choice+text", {
    list: "manual",
    width: 30,
    hint: "Blank: search for the maker's manual first. Then its web link or a file they sent. Not found: Not sure (asked once). None: Not available",
    targets: { contract: "models[].manual + sources[]", app: "documents (manual)" },
  }),
  f("model.manual_share", "May renters see the manual?", "optional", "choice", {
    list: "manualShare",
    width: 28,
    hint: "Blank: link to the maker's official copy. Show our copy needs the maker's permission on record.",
    targets: { contract: "sources[].rights.redistribution", app: "documents.visibility" },
  }),
  f("model.manual_depends", "Manual changes by year or serial?", "optional", "choice", {
    list: "yesNoNotSure",
    width: 16,
    hint: "Not sure: check the manual",
    targets: { contract: "models[].applicability.notes" },
  }),
  f("model.instructions", "Customer's instructions for renters", "optional", "text", {
    width: 26,
    hint: "File name of anything they already hand out, or None",
    targets: { contract: "sources[] (customer-file)", app: "equipment_pages (drafted, cited)" },
  }),
  f("model.photo", "Model photo", "optional", "choice+text", {
    list: "modelPhoto",
    width: 20,
    hint: "One photo for identical machines: its file name in the model's folder",
    targets: { contract: "models[].photo", app: "assets.cover_image_url (assets without their own photo)" },
  }),
  f("model.photo_permission", "Who took the model photo?", "optional", "choice", {
    list: "photoPermission",
    width: 20,
    hint: "The customer's own photo, or the maker's with permission",
    targets: { contract: "sources[].rights.status" },
  }),
  f("model.fuel", "Fuel or power", "optional", "choice+text", {
    list: "fuel",
    width: 16,
    hint: "e.g. Diesel, Battery, None",
    targets: { contract: "models[].configuration.fuel_or_power", app: "equipment_pages.fuel_power_notes (drafted)" },
  }),
  f("model.accessories", "Accessories sent out", "optional", "text", {
    width: 26,
    hint: "e.g. 2 straps, ramps, hoist remote",
    targets: { contract: "models[].common_accessories", app: "return checklist review" },
  }),
  f("model.return_rules", "Return rules for this model", "optional", "text", {
    width: 26,
    hint: "Only what's special for this model; general rules go on the CALL SHEET",
    targets: { contract: "organization.policies[] (customer-owned)", app: "equipment_pages.return_notes (drafted)" },
  }),
  f("model.questions", "Questions renters ask", "optional", "text", {
    width: 30,
    hint: "e.g. How do I lower the jack?",
    targets: { app: "equipment_pages.troubleshooting_notes (drafted from the manual)", kit_only: "Input for drafting; not a contract field." },
  }),
  f("model.notes", "Notes", "optional", "text", {
    width: 24,
    hint: "Never published",
    targets: { kit_only: "Read by Mulemark; never published." },
  }),
];

export const MODEL_COLUMNS = inOrder(MODEL_DEFS, [
  "model.name",
  "model.make",
  "model.model",
  "model.manual",
  "model.manual_share",
  "model.version",
  "model.category",
  "model.manual_depends",
  "model.instructions",
  "model.photo",
  "model.photo_permission",
  "model.fuel",
  "model.accessories",
  "model.return_rules",
  "model.questions",
  "model.notes",
]);

// ------------------------------------------------------------------------------------------------ FILES & NOTES

export const FILE_COLUMNS = [
  f("file.name", "File or folder name", "golive", "text", {
    width: 32,
    hint: "As saved in inbox\\, e.g. 35SA yard checklist.pdf",
    targets: { contract: "sources[].title / media.source_id", kit_only: "Only for files outside the inbox's standard folders, from the maker, or not meant for renters." },
  }),
  f("file.kind", "What it is", "golive", "choice", { list: "fileKind", width: 18, hint: "Photo, Manual, Your instructions, Logo, Other", targets: { contract: "sources[].kind" } }),
  f("file.for", "For (asset code, model name or Company)", "golive", "text", {
    width: 26,
    hint: "e.g. 00412, Big Tex 14LP dump, Company",
    targets: { contract: "sources[].applicability" },
  }),
  f("file.source", "Where is it from?", "golive", "choice", {
    list: "fileSource",
    width: 22,
    hint: "As the customer told you: their own, or the maker's",
    targets: { contract: "sources[].rights.status" },
  }),
  f("file.audience", "Who may see it?", "golive", "choice", {
    list: "fileAudience",
    width: 22,
    hint: "Only ever on the customer's own pages",
    targets: { contract: "sources[].rights.redistribution" },
  }),
  f("file.notes", "Notes", "optional", "text", { width: 24, hint: "Anything we should know", targets: { kit_only: "Read by Mulemark." } }),
];

export const NOTE_COLUMNS = [
  f("note.about", "About (asset code, model name or Company)", "optional", "text", { width: 26, hint: "e.g. 00412", targets: { kit_only: "Read by Mulemark." } }),
  f("note.text", "What we should know", "optional", "text", {
    width: 48,
    hint: "Missing, different or unclear: note it here",
    targets: { kit_only: "Read by Mulemark; summarized in the readiness report." },
  }),
];

/** Pre-formatted input rows per table. */
export const ROWS = { assets: 1000, models: 200, files: 300, notes: 300, people: 30 };

/** Tabs in workbook order: MODELS comes before ASSETS, because each asset picks its model from MODELS. */
export const TABS = {
  company: "CALL SHEET",
  models: "MODELS",
  assets: "ASSETS",
  files: "FILES & NOTES",
  lists: "LISTS",
};

/** Every input field, keyed, in workbook order. */
export function allFields() {
  return [
    ...COMPANY_SECTIONS.flatMap((s) => s.fields.map((x) => ({ ...x, tab: TABS.company, section: s.title }))),
    ...PEOPLE_COLUMNS.map((x) => ({ ...x, tab: TABS.company, section: "People" })),
    ...MODEL_COLUMNS.map((x) => ({ ...x, tab: TABS.models })),
    ...ASSET_COLUMNS.map((x) => ({ ...x, tab: TABS.assets })),
    ...FILE_COLUMNS.map((x) => ({ ...x, tab: TABS.files, section: "Files" })),
    ...NOTE_COLUMNS.map((x) => ({ ...x, tab: TABS.files, section: "Notes" })),
  ];
}

/** Header aliases accepted from a customer's own fleet export (case- and punctuation-insensitive). */
export const FLEET_ALIASES = {
  "asset.code": ["asset code", "asset_code", "asset id", "asset #", "asset no", "asset number", "unit", "unit #", "unit no", "unit number", "unit id", "equipment #", "equipment no", "equipment number", "equipment id", "equip #", "equip no", "stock #", "stock no", "stock number", "fleet #", "fleet no", "fleet number", "item #", "item number"],
  "asset.name": ["asset name", "asset_name", "name", "description", "desc", "equipment name", "item name", "item description"],
  "model.make": ["make", "manufacturer", "mfr", "mfg", "brand"],
  "model.model": ["model", "model #", "model no", "model number"],
  "asset.category": ["category", "class", "type", "equipment type", "group", "category name", "rental class"],
  "asset.year": ["year", "model year", "yr", "year built", "mfg year"],
  "asset.serial": ["serial", "serial #", "serial no", "serial number", "s/n", "sn", "vin", "pin"],
};

export function normalizeHeader(text) {
  return String(text ?? "")
    .replace(/^﻿/, "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .replace(/\s*([#/])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .replace(/[.:]+$/, "")
    .trim();
}

/** The JSON published in the internal packet: no functions, stable order. */
export function mappingDocument() {
  const strip = (x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));
  return {
    mapping_version: KIT.mappingVersion,
    workbook_version: KIT.workbookVersion,
    description:
      "Mulemark's setup workbook (kit 2.0): filled by Mulemark from a call with the customer and the customer's own equipment list. Stable keys, tiers and targets. Labels can change between versions; keys do not. Tiers: start = needed for a private draft import; golive = needed before go-live (review-ready); optional.",
    unknown_answers: LISTS.unknown,
    unknown_answer_meaning: {
      "Not available": "The fact or file does not exist or the customer cannot get it.",
      "Not sure": "Still to confirm with the customer; asked once, in the one consolidated request, if still needed.",
      "Please review": "Mulemark looks into it within the bounded research limit; unresolved items go back to the customer once.",
    },
    blank_answer:
      "Allowed anywhere. A blank optional answer stays blank; a blank answer needed before go-live becomes one item: the customer's (asked once, in the one consolidated request) or Mulemark's (see defaults).",
    defaults: {
      "asset.tag": "Blank means New tag.",
      "asset.photo": "Optional everywhere: a missing photo is a warning, never a blocker. Blank counts the photos saved in inbox\\Photos\\<asset code>\\.",
      "model.manual": "Blank or Please review: Mulemark searches for the maker's official manual first (bounded). Not sure: the search found none, so the customer is asked once. Not available: there is no manual; the pages have no manual button (a warning, not a blocker).",
      "model.manual_share": "Blank or Not sure: renters get a link to the maker's official copy; a file the customer sent stays private. Showing a copy needs permission on record.",
      "model.manual_depends": "Models filled from the customer's list start as Not sure, so checking it is on Mulemark's to-do list.",
      "tags.ship_to": "Needed before tags are made: asked once if it's still blank.",
      "alerts.*": "Blank keeps the app's own setting (damage Yes, support Yes, return emails Off, tag updates No, photo previews Yes).",
    },
    file_defaults: {
      "inbox\\": "Everything the customer emails is saved here as it came; their equipment list is the one .csv or .xlsx at the top.",
      "inbox\\Photos\\<asset code>\\": "The customer's own photos; shown on the customer's own pages.",
      "inbox\\Company\\": "The logo; shown on the customer's own pages.",
      "inbox\\Model documents\\<model name>\\":
        "Manuals follow 'May renters see the manual?' on MODELS. Files of the customer's own instructions are shown on the customer's own pages.",
      "FILES & NOTES rows": "Only for files outside these folders, from the maker, or not for renters. A row can only restrict what a folder default allows.",
      "Never": "Shared with another company. Every source has shareable_across_orgs: false.",
    },
    layout: { ...LAYOUT, company_form_columns: ["Needed", "Question", "Answer", "Help"] },
    lists: LISTS,
    tabs: [
      { tab: TABS.company, sections: COMPANY_SECTIONS.map((s) => ({ title: s.title, fields: s.fields.map(strip) })), people: PEOPLE_COLUMNS.map(strip) },
      { tab: TABS.models, rows: ROWS.models, columns: MODEL_COLUMNS.map(strip) },
      { tab: TABS.assets, rows: ROWS.assets, columns: ASSET_COLUMNS.map(strip) },
      { tab: TABS.files, rows: ROWS.files, files: FILE_COLUMNS.map(strip), notes: NOTE_COLUMNS.map(strip) },
    ],
    fleet_export_aliases: FLEET_ALIASES,
    computed_columns: [
      { tab: TABS.models, label: "Check", note: "Workbook formula; ignored when reading." },
      { tab: TABS.assets, label: "Check", note: "Workbook formula; ignored when reading." },
    ],
  };
}
