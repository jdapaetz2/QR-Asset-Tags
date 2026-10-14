/**
 * Engineering Phase E0 — the read-only showcase inventory's decisions (scripts/phase-e/showcase-audit.mjs does the
 * reading). Pure: no I/O, no network, no printing.
 *
 * WHY: the Northridge archive/reset boundary (docs/phase-e/CANONICAL_SHOWCASE_FLEET.md) must be locked from evidence,
 * not memory — every asset, every QR row including disabled aliases, scan history, pages, documents, rental sessions,
 * submissions, acknowledgements, tag requests, summary-ledger rows, profiles and Storage objects, counted exactly.
 * E1 extends this same audit rather than writing another.
 *
 * PRIVACY BY CONSTRUCTION: the report is assembled from an allowlist of fields. People appear only as counts by role
 * and status; email addresses only as a domain class; user agents only as a class; Storage only as counts and bytes;
 * URLs only as a host or "hosted". Names, renter labels, free-text submission data, internal notes, storage paths and
 * signed URLs never enter the report, and `redactionProblems` re-checks the serialized report before it is written.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export const AUDIT_TARGETS = /** @type {const} */ (["production", "staging"]);

/**
 * The only organizations this audit reads in detail, per target. Northridge is the published showcase; the others
 * are the QA fixtures (docs/PHASE_C_BASELINE.md §15, scripts/staging/seed-staging-qa.mjs). Ids are public fixtures.
 */
export const FIXTURE_ORGS = Object.freeze({
  production: Object.freeze({
    "11111111-1111-4111-8111-111111111111": "northridge",
    "c0000000-0000-4000-8000-00000000c0a1": "production-qa",
  }),
  staging: Object.freeze({
    "11111111-1111-4111-8111-111111111111": "northridge",
    "5ac00000-0000-4000-8000-00000057a610": "staging-qa-a",
    "5ac00000-0000-4000-8000-00000057a620": "staging-qa-b",
  }),
});

/** Buckets and the managed path grammar inside them (mirrors scripts/lib/orphan-media.mjs). */
export const STORAGE_BUCKETS = /** @type {const} */ (["submissions", "documents", "public-assets"]);

/** Columns the audit selects. Free-text and personal columns are deliberately absent. */
export const COLUMNS = Object.freeze({
  organization:
    "id, status, slug, logo_url, primary_color, support_phone, support_email, website_url, powered_by_label, " +
    "return_notification_mode, notify_damage_reports, notify_support_requests, notify_tag_request_updates, " +
    "notify_urgent_reports, notify_include_photo_previews, notification_email, urgent_notification_email, " +
    "customer_exports_enabled, asset_limit, created_at",
  assets:
    "id, asset_code, asset_name, category, make, model, serial_number, year, public_status, cover_image_url, " +
    "archived_at, active_rental_session_id, return_inspection_template_key, return_inspection_template_id, " +
    "support_phone_override, support_email_override, created_at, updated_at",
  qrLinks:
    "id, asset_id, short_code, public_url, status, is_production_primary, supersedes_qr_link_id, last_scanned_at, " +
    "created_at, updated_at",
  pages:
    "id, asset_id, is_published, headline, quick_start_text, safety_notes, fuel_power_notes, return_notes, " +
    "troubleshooting_notes, emergency_notes, updated_at",
  documents: "id, asset_id, title, document_type, url, storage_path, visibility, link_status, last_checked_at, created_at",
  sessions: "id, asset_id, status, started_at, returned_at, created_at",
  submissions:
    "id, asset_id, form_type, status, submission_origin, created_at, media_urls, rental_session_id, " +
    "inspection_template_key, submitted_by_email, submitted_by_profile_id",
  acknowledgements: "id, asset_id, email, acknowledged_at, rental_session_id",
  profiles: "id, role, status, email, created_at",
  tagRequests: "id, status, created_at, updated_at, delivered_at, completed_at",
  tagRequestAssets: "id, tag_request_id, asset_id, quantity",
  digestRuns: "id, status, window_start, window_end, item_count, created_at",
  pageTemplates: "id, key, organization_id, is_system, is_active, updated_at",
  inspectionTemplates: "id, family_key, version, status, source_system_template_key, published_at",
  categoryDefaults: "id, category_value, return_template_key, return_template_id",
  scans: "id, qr_link_id, asset_id, scanned_at, user_agent, device_type",
});

const PAGE_FIELDS = [
  "headline",
  "quick_start_text",
  "safety_notes",
  "fuel_power_notes",
  "return_notes",
  "troubleshooting_notes",
  "emergency_notes",
];

// ---------------------------------------------------------------------------------------------------------------------
// Arguments and target
// ---------------------------------------------------------------------------------------------------------------------

/** `--target=<production|staging> --org=<uuid>`; anything else is an error. Unknown values are never echoed. */
export function parseAuditArgs(argv) {
  const args = { target: null, org: null };
  for (const raw of argv) {
    const m = /^--(target|org)=(.+)$/.exec(raw);
    if (!m) {
      const flag = String(raw).split("=")[0].slice(0, 40);
      return { error: `unknown argument ${JSON.stringify(flag)} — expected --target=<production|staging> --org=<organization id>` };
    }
    if (args[m[1]] !== null) return { error: `--${m[1]} was given twice` };
    args[m[1]] = m[2].trim().toLowerCase();
  }
  if (!args.target) return { error: "--target is required (production or staging)" };
  if (!args.org) return { error: "--org is required (a fixture organization id)" };
  return { args };
}

/** Why this target/org pair may not be audited, or null. */
export function auditRefusal({ target, org }) {
  if (!AUDIT_TARGETS.includes(target)) return "--target must be production or staging";
  if (!UUID_RE.test(org)) return "--org must be a full organization id (uuid)";
  if (!FIXTURE_ORGS[target][org]) {
    const allowed = Object.entries(FIXTURE_ORGS[target])
      .map(([id, alias]) => `${id} (${alias})`)
      .join(", ");
    return `--org is not an allowlisted ${target} fixture organization. Allowed: ${allowed}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Classifiers (the only way personal or path-bearing values reach the report)
// ---------------------------------------------------------------------------------------------------------------------

/** An address reduced to a class: none, malformed, reserved-invalid, reserved-example, resend-sandbox, mulemark, other. */
export function emailDomainClass(address) {
  if (address === null || address === undefined || String(address).trim() === "") return "none";
  const value = String(address).trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return "malformed";
  const domain = value.slice(at + 1);
  if (domain === "invalid" || domain.endsWith(".invalid")) return "reserved-invalid";
  if (/^example\.(com|net|org)$/.test(domain) || domain.endsWith(".example") || domain.endsWith(".test")) {
    return "reserved-example";
  }
  if (domain === "resend.dev") return "resend-sandbox";
  if (domain === "mulemark.io" || domain.endsWith(".mulemark.io")) return "mulemark";
  return "other";
}

/** A phone number reduced to a class: none, not-dialable (under 10 digits), fictional-555 (NANP 555-01XX), set. */
export function phoneClass(phone) {
  if (phone === null || phone === undefined || String(phone).trim() === "") return "none";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) return "not-dialable";
  if (/^1?\d{3}55501\d{2}$/.test(digits)) return "fictional-555";
  return "set";
}

/** A URL reduced to where it lives: none, unparseable, hosted (Supabase Storage), or an external host. */
export function urlSource(url, supabaseHost) {
  if (url === null || url === undefined || String(url).trim() === "") return { kind: "none" };
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return { kind: "unparseable" };
  }
  const host = parsed.hostname.toLowerCase();
  if (/\.supabase\.(co|in)$/.test(host)) return { kind: "hosted", sameProject: host === supabaseHost };
  return { kind: "external", host };
}

const PREVIEW_RE =
  /facebookexternalhit|facebookcatalog|slackbot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview|applebot|pinterest|redditbot|embedly|iframely/i;
const AUTOMATED_RE =
  /bot\b|bot\/|crawl|spider|slurp|headless|playwright|puppeteer|lighthouse|pagespeed|python-requests|python-urllib|aiohttp|curl\/|wget|go-http-client|okhttp|axios|node-fetch|undici|libwww|java\/|scrapy|ahrefs|semrush|uptime|monitor|vercel/i;

/** A user agent reduced to a class; the raw string never leaves this function. */
export function userAgentClass(userAgent) {
  if (userAgent === null || userAgent === undefined || String(userAgent).trim() === "") return "unknown";
  const ua = String(userAgent);
  if (PREVIEW_RE.test(ua)) return "link-preview";
  if (AUTOMATED_RE.test(ua)) return "automated";
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) return "mobile-browser";
  if (/^Mozilla\//.test(ua)) return "desktop-browser";
  return "other";
}

const STORAGE_GRAMMARS = [
  ["submission", new RegExp(`^org/(${UUID})/asset/(${UUID})/submission/${UUID}/[^/]+$`)],
  ["document", new RegExp(`^org/(${UUID})/asset/(${UUID})/documents/${UUID}/[^/]+$`)],
  ["cover", new RegExp(`^org/(${UUID})/asset/(${UUID})/cover/[^/]+$`)],
];
const LOGO_GRAMMAR = new RegExp(`^org/(${UUID})/logo/[^/]+$`);
const ASSET_SCOPED = new RegExp(`^org/(${UUID})/asset/(${UUID})/`);

/** Which managed object a Storage path is, and for which asset. The path itself never leaves this function. */
export function classifyStorageObject(objectPath, orgId) {
  for (const [kind, re] of STORAGE_GRAMMARS) {
    const m = re.exec(objectPath);
    if (m) return { kind, inOrg: m[1].toLowerCase() === orgId, assetId: m[2].toLowerCase() };
  }
  const logo = LOGO_GRAMMAR.exec(objectPath);
  if (logo) return { kind: "logo", inOrg: logo[1].toLowerCase() === orgId, assetId: null };
  const scoped = ASSET_SCOPED.exec(objectPath);
  if (scoped) return { kind: "other", inOrg: scoped[1].toLowerCase() === orgId, assetId: scoped[2].toLowerCase() };
  return { kind: "other", inOrg: objectPath.startsWith(`org/${orgId}/`), assetId: null };
}

/**
 * The bucket-relative object path a stored reference points at: a bare path, or a Supabase Storage URL
 * (`…/storage/v1/object/{public|sign|authenticated}/{bucket}/{path}`). Null when it is not in that bucket.
 */
export function storagePathOf(reference, bucket) {
  if (typeof reference !== "string" || reference.trim() === "") return null;
  const value = reference.trim();
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");
  try {
    const { pathname } = new URL(value);
    const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/.exec(pathname);
    return m && m[1] === bucket ? decodeURIComponent(m[2]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------------------------------------------------

const tally = (values) => values.reduce((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {});
const iso = (value) => (value ? new Date(value).toISOString() : null);

function range(values) {
  const times = values.filter(Boolean).map((v) => new Date(v).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  return times.length ? { first: new Date(times[0]).toISOString(), last: new Date(times.at(-1)).toISOString() } : null;
}

function median(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

/** Rental sessions for one asset: counts, dates, durations and any overlap (two sessions open at once). */
export function summarizeRentals(sessions, now) {
  const ordered = [...sessions].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
  const hours = ordered
    .filter((s) => s.status === "returned" && s.returned_at)
    .map((s) => (new Date(s.returned_at) - new Date(s.started_at)) / 3_600_000);
  let overlaps = 0;
  for (let i = 0; i < ordered.length; i++) {
    const endI = ordered[i].returned_at ? new Date(ordered[i].returned_at) : now;
    for (let j = i + 1; j < ordered.length; j++) {
      if (ordered[i].status === "cancelled" || ordered[j].status === "cancelled") continue;
      if (new Date(ordered[j].started_at) < endI) overlaps++;
    }
  }
  return {
    total: ordered.length,
    byStatus: tally(ordered.map((s) => s.status)),
    started: range(ordered.map((s) => s.started_at)),
    returnedDurationHours: hours.length
      ? { min: round1(Math.min(...hours)), median: round1(median(hours)), max: round1(Math.max(...hours)) }
      : null,
    overlappingPairs: overlaps,
    openSince: ordered.filter((s) => s.status === "active").map((s) => iso(s.started_at)),
  };
}

const monthOf = (value) => (Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString().slice(0, 7) : "unknown");
const within30Days = (value, now) => new Date(value).getTime() >= now.getTime() - 30 * 86_400_000;

/** Submissions for one asset, without names, phones, addresses or form contents. */
export function summarizeSubmissions(rows, now) {
  const photos = rows.map((r) => (Array.isArray(r.media_urls) ? r.media_urls.length : 0));
  return {
    total: rows.length,
    byType: tally(rows.map((r) => r.form_type)),
    byOrigin: tally(rows.map((r) => r.submission_origin ?? "public")),
    byStatus: tally(rows.map((r) => r.status)),
    byTypeAndStatus: tally(rows.map((r) => `${r.form_type}/${r.status}`)),
    byMonth: tally(rows.map((r) => monthOf(r.created_at))),
    last30Days: rows.filter((r) => within30Days(r.created_at, now)).length,
    created: range(rows.map((r) => r.created_at)),
    withPhotos: photos.filter((n) => n > 0).length,
    photoCount: photos.reduce((sum, n) => sum + n, 0),
    withoutPhotos: photos.filter((n) => n === 0).length,
    linkedToRental: rows.filter((r) => r.rental_session_id).length,
    staffSubmitted: rows.filter((r) => r.submitted_by_profile_id).length,
    submitterEmailClasses: tally(rows.map((r) => emailDomainClass(r.submitted_by_email))),
    returnTemplateKeys: tally(rows.filter((r) => r.inspection_template_key).map((r) => r.inspection_template_key)),
  };
}

/** Renter acknowledgements for one asset (insert-only public rows). */
export function summarizeAcknowledgements(rows, now) {
  return {
    total: rows.length,
    acknowledged: range(rows.map((r) => r.acknowledged_at)),
    byMonth: tally(rows.map((r) => monthOf(r.acknowledged_at))),
    last30Days: rows.filter((r) => within30Days(r.acknowledged_at, now)).length,
    linkedToRental: rows.filter((r) => r.rental_session_id).length,
    emailClasses: tally(rows.map((r) => emailDomainClass(r.email))),
  };
}

/** Which public-page fields hold text, and how much — never the text. */
export function summarizePage(page) {
  if (!page) return { exists: false };
  const fields = {};
  for (const field of PAGE_FIELDS) fields[field] = typeof page[field] === "string" ? page[field].trim().length : 0;
  return { exists: true, isPublished: Boolean(page.is_published), filledFields: fields, updatedAt: iso(page.updated_at) };
}

/** Scan rows grouped per QR row: count, first/last, by month, by user-agent class and device type. */
export function summarizeScans(rows, now) {
  const cutoff = now.getTime() - 30 * 86_400_000;
  const grouped = {};
  for (const row of rows) (grouped[row.qr_link_id] ??= []).push(row);
  return Object.fromEntries(
    Object.entries(grouped).map(([linkId, linkRows]) => [
      linkId,
      {
        walked: linkRows.length,
        scanned: range(linkRows.map((r) => r.scanned_at)),
        last30Days: linkRows.filter((r) => new Date(r.scanned_at).getTime() >= cutoff).length,
        byMonth: tally(linkRows.map((r) => new Date(r.scanned_at).toISOString().slice(0, 7))),
        byClient: tally(linkRows.map((r) => userAgentClass(r.user_agent))),
        byDevice: tally(linkRows.map((r) => r.device_type ?? "unknown")),
      },
    ])
  );
}

/** Profiles reduced to role, status and address class. */
export function summarizeProfiles(rows) {
  return {
    total: rows.length,
    byRole: tally(rows.map((r) => r.role)),
    byStatus: tally(rows.map((r) => r.status ?? "active")),
    byRoleAndStatus: tally(rows.map((r) => `${r.role}/${r.status ?? "active"}`)),
    emailClasses: tally(rows.map((r) => emailDomainClass(r.email))),
  };
}

/** Storage objects (bucket, path, size, createdAt) reduced to counts and bytes per bucket, kind and asset. */
export function summarizeStorage(objects, orgId) {
  const out = {};
  for (const bucket of STORAGE_BUCKETS) out[bucket] = { objects: 0, bytes: 0, byKind: {}, byAsset: {}, outsideOrg: 0, created: null };
  const created = Object.fromEntries(STORAGE_BUCKETS.map((b) => [b, []]));
  for (const object of objects) {
    const bucket = (out[object.bucket] ??= { objects: 0, bytes: 0, byKind: {}, byAsset: {}, outsideOrg: 0, created: null });
    const { kind, inOrg, assetId } = classifyStorageObject(object.path, orgId);
    const size = Number(object.size) || 0;
    bucket.objects++;
    bucket.bytes += size;
    const k = (bucket.byKind[kind] ??= { objects: 0, bytes: 0 });
    k.objects++;
    k.bytes += size;
    if (assetId) {
      const a = (bucket.byAsset[assetId] ??= { objects: 0, bytes: 0 });
      a.objects++;
      a.bytes += size;
    }
    if (!inOrg) bucket.outsideOrg++;
    (created[object.bucket] ??= []).push(object.createdAt);
  }
  for (const [bucket, values] of Object.entries(created)) out[bucket].created = range(values);
  return out;
}

/** How many stored references resolve to a listed object, without naming either. */
export function referenceStats(references, bucket, listed, orgId) {
  const stats = { references: 0, found: 0, missing: 0, outsideOrgPrefix: 0, notThisBucket: 0 };
  for (const reference of references) {
    stats.references++;
    const objectPath = storagePathOf(reference, bucket);
    if (objectPath === null) {
      stats.notThisBucket++;
      continue;
    }
    if (!objectPath.startsWith(`org/${orgId}/`)) stats.outsideOrgPrefix++;
    if (listed.has(`${bucket}/${objectPath}`)) stats.found++;
    else stats.missing++;
  }
  return stats;
}

// ---------------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------------

const byAsset = (rows) =>
  rows.reduce((acc, row) => {
    (acc[row.asset_id] ??= []).push(row);
    return acc;
  }, {});

/**
 * Assemble the report from rows the CLI read. Only allowlisted fields are copied; everything personal or
 * path-bearing passes through a classifier first. `scanCounts` maps qr_link_id → exact count (a head query).
 */
export function buildReport(input) {
  const { target, orgId, supabaseHost, now, org } = input;
  const fixture = FIXTURE_ORGS[target.mode]?.[orgId] ?? null;
  const listed = new Set(input.storageObjects.map((o) => `${o.bucket}/${o.path}`));
  const pagesByAsset = Object.fromEntries(input.pages.map((p) => [p.asset_id, p]));
  const docsByAsset = byAsset(input.documents);
  const sessionsByAsset = byAsset(input.sessions);
  const submissionsByAsset = byAsset(input.submissions);
  const acksByAsset = byAsset(input.acknowledgements);
  const linksByAsset = byAsset(input.qrLinks);
  const scanSummary = summarizeScans(input.scanRows, now);
  const storage = summarizeStorage(input.storageObjects, orgId);
  const tagAssetsByRequest = input.tagRequestAssets.reduce((acc, row) => {
    (acc[row.tag_request_id] ??= []).push(row);
    return acc;
  }, {});

  const assets = [...input.assets]
    .sort((a, b) => a.asset_code.localeCompare(b.asset_code))
    .map((asset) => ({
      id: asset.id,
      assetCode: asset.asset_code,
      assetName: asset.asset_name,
      category: asset.category,
      make: asset.make,
      model: asset.model,
      year: asset.year,
      serialNumber: asset.serial_number,
      publicStatus: asset.public_status,
      archivedAt: iso(asset.archived_at),
      rentalOpen: Boolean(asset.active_rental_session_id),
      returnTemplateKey: asset.return_inspection_template_key,
      returnTemplatePinned: Boolean(asset.return_inspection_template_id),
      supportPhoneOverride: phoneClass(asset.support_phone_override),
      supportEmailOverride: emailDomainClass(asset.support_email_override),
      cover: urlSource(asset.cover_image_url, supabaseHost),
      createdAt: iso(asset.created_at),
      updatedAt: iso(asset.updated_at),
      qrLinks: [...(linksByAsset[asset.id] ?? [])]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((link) => {
          let publicUrlHost = null;
          let publicUrlMatchesCode = false;
          try {
            const parsed = new URL(link.public_url);
            publicUrlHost = parsed.hostname.toLowerCase();
            publicUrlMatchesCode = parsed.pathname === `/t/${link.short_code}`;
          } catch {
            publicUrlHost = "unparseable";
          }
          const scans = scanSummary[link.id] ?? { walked: 0, byMonth: {}, byClient: {}, byDevice: {}, last30Days: 0, scanned: null };
          return {
            id: link.id,
            shortCode: link.short_code,
            status: link.status,
            isProductionPrimary: Boolean(link.is_production_primary),
            supersedesQrLinkId: link.supersedes_qr_link_id,
            storedPublicUrlHost: publicUrlHost,
            storedPublicUrlMatchesCode: publicUrlMatchesCode,
            createdAt: iso(link.created_at),
            updatedAt: iso(link.updated_at),
            lastScannedAt: iso(link.last_scanned_at),
            scans: { exactCount: input.scanCounts[link.id] ?? null, ...scans },
          };
        }),
      page: summarizePage(pagesByAsset[asset.id]),
      documents: (docsByAsset[asset.id] ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
        documentType: doc.document_type,
        visibility: doc.visibility,
        hosted: Boolean(doc.storage_path),
        hostedObjectListed: doc.storage_path ? listed.has(`documents/${doc.storage_path}`) : null,
        hostedUnderOrgPrefix: doc.storage_path ? doc.storage_path.startsWith(`org/${orgId}/`) : null,
        link: urlSource(doc.url, supabaseHost),
        linkStatus: doc.link_status,
        lastCheckedAt: iso(doc.last_checked_at),
        createdAt: iso(doc.created_at),
      })),
      rentals: summarizeRentals(sessionsByAsset[asset.id] ?? [], now),
      submissions: summarizeSubmissions(submissionsByAsset[asset.id] ?? [], now),
      acknowledgements: summarizeAcknowledgements(acksByAsset[asset.id] ?? [], now),
    }));

  const knownAssets = new Set(input.assets.map((a) => a.id));
  const coverRefs = input.assets.map((a) => a.cover_image_url).filter((u) => urlSource(u, supabaseHost).kind === "hosted");
  const logoRefs = [org?.logo_url].filter((u) => urlSource(u, supabaseHost).kind === "hosted");

  return {
    tool: "phase-e showcase audit (read-only)",
    generatedAt: now.toISOString(),
    target: { mode: target.mode, host: target.host, ref: target.ref },
    organization: org
      ? {
          id: org.id,
          fixture,
          status: org.status,
          slug: org.slug,
          logo: urlSource(org.logo_url, supabaseHost),
          primaryColor: org.primary_color,
          poweredByLabel: org.powered_by_label,
          supportPhone: phoneClass(org.support_phone),
          supportEmail: emailDomainClass(org.support_email),
          website: urlSource(org.website_url, supabaseHost),
          returnNotificationMode: org.return_notification_mode,
          notify: {
            damageReports: org.notify_damage_reports,
            supportRequests: org.notify_support_requests,
            tagRequestUpdates: org.notify_tag_request_updates,
            urgentReports: org.notify_urgent_reports,
            includePhotoPreviews: org.notify_include_photo_previews,
          },
          notificationEmail: emailDomainClass(org.notification_email),
          urgentNotificationEmail: emailDomainClass(org.urgent_notification_email),
          customerExportsEnabled: org.customer_exports_enabled,
          assetLimit: org.asset_limit,
          createdAt: iso(org.created_at),
        }
      : null,
    counts: {
      assets: input.assets.length,
      qrLinks: input.qrLinks.length,
      scansExact: input.orgScanCount,
      scansWalked: input.scanRows.length,
      scanWalkTruncated: input.scanWalkTruncated,
      pages: input.pages.length,
      documents: input.documents.length,
      rentalSessions: input.sessions.length,
      submissions: input.submissions.length,
      acknowledgements: input.acknowledgements.length,
      profiles: input.profiles.length,
      tagRequests: input.tagRequests.length,
      digestRuns: input.digestRuns.length,
      activityLog: input.activityCount,
      orphanRows: {
        qrLinks: input.qrLinks.filter((r) => !knownAssets.has(r.asset_id)).length,
        documents: input.documents.filter((r) => !knownAssets.has(r.asset_id)).length,
        submissions: input.submissions.filter((r) => !knownAssets.has(r.asset_id)).length,
        sessions: input.sessions.filter((r) => !knownAssets.has(r.asset_id)).length,
      },
    },
    assets,
    profiles: summarizeProfiles(input.profiles),
    tagRequests: [...input.tagRequests]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((request) => ({
        id: request.id,
        status: request.status,
        createdAt: iso(request.created_at),
        updatedAt: iso(request.updated_at),
        deliveredAt: iso(request.delivered_at),
        completedAt: iso(request.completed_at),
        assets: (tagAssetsByRequest[request.id] ?? []).map((row) => ({ assetId: row.asset_id, quantity: row.quantity })),
      })),
    digest: {
      byStatus: tally(input.digestRuns.map((r) => r.status)),
      windows: range(input.digestRuns.map((r) => r.window_end)),
      itemsSent: input.digestRuns.filter((r) => r.status === "sent").reduce((sum, r) => sum + (r.item_count ?? 0), 0),
    },
    templates: {
      equipmentPage: {
        custom: input.pageTemplates.filter((t) => t.organization_id === orgId).map((t) => ({ key: t.key, active: t.is_active })),
        systemKeys: input.pageTemplates.filter((t) => t.is_system).map((t) => t.key).sort(),
      },
      inspection: input.inspectionTemplates.map((t) => ({
        id: t.id,
        familyKey: t.family_key,
        version: t.version,
        status: t.status,
        sourceSystemTemplateKey: t.source_system_template_key,
        publishedAt: iso(t.published_at),
      })),
      categoryDefaults: input.categoryDefaults.map((d) => ({
        category: d.category_value,
        returnTemplateKey: d.return_template_key,
        pinnedTemplate: Boolean(d.return_template_id),
      })),
    },
    storage: {
      listedUnderPrefix: `org/<organization id>/`,
      buckets: storage,
      references: {
        hostedDocuments: referenceStats(
          input.documents.filter((d) => d.storage_path).map((d) => d.storage_path),
          "documents",
          listed,
          orgId
        ),
        submissionMedia: referenceStats(
          input.submissions.flatMap((s) => (Array.isArray(s.media_urls) ? s.media_urls : [])),
          "submissions",
          listed,
          orgId
        ),
        hostedCovers: referenceStats(coverRefs, "public-assets", listed, orgId),
        hostedLogo: referenceStats(logoRefs, "public-assets", listed, orgId),
      },
    },
    otherOrganizations: input.otherOrgs.map((o) => ({
      idPrefix: o.id.slice(0, 8),
      status: o.status,
      assets: o.assetCount,
      class: FIXTURE_ORGS[target.mode]?.[o.id] ? `fixture:${FIXTURE_ORGS[target.mode][o.id]}` : "other",
    })),
  };
}

/**
 * Last line of defence before the report is written: the serialized text must hold no address, storage path,
 * signed-URL marker or key-shaped string. Returns the kinds found (never the matches).
 */
export function redactionProblems(serialized) {
  const checks = [
    ["email address", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ["storage object path", /\borg\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i],
    ["storage URL", /\/storage\/v1\/object\//i],
    ["signed-URL marker", /[?&](token|sig|signature|X-Amz-Signature)=/i],
    ["JWT-shaped string", /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
    ["Supabase secret key", /sb_secret_|service_role/i],
  ];
  return checks.filter(([, re]) => re.test(serialized)).map(([kind]) => kind);
}
