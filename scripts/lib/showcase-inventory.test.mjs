import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COLUMNS,
  FIXTURE_ORGS,
  auditRefusal,
  buildReport,
  classifyStorageObject,
  emailDomainClass,
  parseAuditArgs,
  phoneClass,
  redactionProblems,
  referenceStats,
  storagePathOf,
  summarizeRentals,
  summarizeScans,
  summarizeSubmissions,
  urlSource,
  userAgentClass,
} from "./showcase-inventory.mjs";

// The Phase E0 read-only showcase inventory (scripts/lib/showcase-inventory.mjs + scripts/phase-e/showcase-audit.mjs).

const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";
const PROD_QA = "c0000000-0000-4000-8000-00000000c0a1";
const STAGING_QA_A = "5ac00000-0000-4000-8000-00000057a610";
const ASSET = "21111111-1111-4111-8111-111111111101";
const LINK = "41111111-1111-4111-8111-111111111101";
const SUPABASE_HOST = "apeiswnkheiwrpvumder.supabase.co";
const NOW = new Date("2026-10-14T20:00:00Z");

describe("arguments and target", () => {
  it("requires --target and --org and nothing else", () => {
    expect(parseAuditArgs([`--target=production`, `--org=${NORTHRIDGE}`])).toEqual({
      args: { target: "production", org: NORTHRIDGE },
    });
    expect(parseAuditArgs([`--org=${NORTHRIDGE}`]).error).toMatch(/--target is required/);
    expect(parseAuditArgs(["--target=production"]).error).toMatch(/--org is required/);
    expect(parseAuditArgs(["--target=production", "--target=staging"]).error).toMatch(/given twice/);
  });

  it("never echoes the value of an unknown argument", () => {
    const { error } = parseAuditArgs(["--key=sb_secret_abcdef"]);
    expect(error).toMatch(/unknown argument "--key"/);
    expect(error).not.toMatch(/sb_secret/);
  });

  it("allows only the fixture organizations of the stated target", () => {
    expect(auditRefusal({ target: "production", org: NORTHRIDGE })).toBeNull();
    expect(auditRefusal({ target: "production", org: PROD_QA })).toBeNull();
    expect(auditRefusal({ target: "staging", org: STAGING_QA_A })).toBeNull();
    expect(auditRefusal({ target: "production", org: STAGING_QA_A })).toMatch(/not an allowlisted production fixture/);
    expect(auditRefusal({ target: "staging", org: PROD_QA })).toMatch(/not an allowlisted staging fixture/);
    expect(auditRefusal({ target: "production", org: "4a863fa0-0000-4000-8000-000000000000" })).toMatch(/not an allowlisted/);
    expect(auditRefusal({ target: "local", org: NORTHRIDGE })).toMatch(/production or staging/);
    expect(auditRefusal({ target: "production", org: "northridge" })).toMatch(/full organization id/);
  });

  it("keeps the allowlist to the published showcase and the QA fixtures", () => {
    expect(FIXTURE_ORGS.production).toEqual({ [NORTHRIDGE]: "northridge", [PROD_QA]: "production-qa" });
    expect(Object.values(FIXTURE_ORGS.staging).sort()).toEqual(["northridge", "staging-qa-a", "staging-qa-b"]);
  });

  it("never selects personal or free-text columns", () => {
    const selected = Object.values(COLUMNS).join(", ");
    for (const banned of [
      "internal_notes",
      "submitted_by_name",
      "submitted_by_phone",
      "submission_data_json",
      "renter_label",
      "rental_reference",
      "statement",
      "production_notes",
      "quantity_notes",
      " name,",
      " phone",
      "ip_hash",
      "referrer",
    ]) {
      expect(selected).not.toContain(banned);
    }
  });
});

describe("classifiers", () => {
  it("reduces an address to a domain class", () => {
    expect(emailDomainClass(null)).toBe("none");
    expect(emailDomainClass("  ")).toBe("none");
    expect(emailDomainClass("no-at-sign")).toBe("malformed");
    expect(emailDomainClass("qa+1@mulemark-qa.invalid")).toBe("reserved-invalid");
    expect(emailDomainClass("renter@example.com")).toBe("reserved-example");
    expect(emailDomainClass("renter@yard.test")).toBe("reserved-example");
    expect(emailDomainClass("delivered@resend.dev")).toBe("resend-sandbox");
    expect(emailDomainClass("Support@Mulemark.io")).toBe("mulemark");
    expect(emailDomainClass("someone@gmail.com")).toBe("other");
  });

  it("flags support numbers nobody can dial", () => {
    expect(phoneClass(null)).toBe("none");
    expect(phoneClass("+1-555-1122")).toBe("not-dialable");
    expect(phoneClass("604-555-0142")).toBe("fictional-555");
    expect(phoneClass("+1 (604) 555-2380")).toBe("set");
  });

  it("reduces a URL to hosted or an external host", () => {
    expect(urlSource(null, SUPABASE_HOST)).toEqual({ kind: "none" });
    expect(urlSource("not a url", SUPABASE_HOST)).toEqual({ kind: "unparseable" });
    expect(urlSource(`https://${SUPABASE_HOST}/storage/v1/object/public/public-assets/org/x/cover/y.jpg`, SUPABASE_HOST)).toEqual({
      kind: "hosted",
      sameProject: true,
    });
    expect(urlSource("https://kwserenxwjxozztyigmw.supabase.co/storage/v1/object/public/x", SUPABASE_HOST)).toEqual({
      kind: "hosted",
      sameProject: false,
    });
    expect(urlSource("https://CDN.dealerspike.com/a/b.jpg?token=abc", SUPABASE_HOST)).toEqual({
      kind: "external",
      host: "cdn.dealerspike.com",
    });
  });

  it("classifies user agents without keeping them", () => {
    expect(userAgentClass(null)).toBe("unknown");
    expect(userAgentClass("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe("automated");
    expect(userAgentClass("facebookexternalhit/1.1")).toBe("link-preview");
    expect(userAgentClass("Slackbot-LinkExpanding 1.0")).toBe("link-preview");
    expect(userAgentClass("Mozilla/5.0 (Windows NT 10.0) HeadlessChrome/120.0")).toBe("automated");
    expect(userAgentClass("curl/8.4.0")).toBe("automated");
    expect(userAgentClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1")).toBe("mobile-browser");
    expect(userAgentClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36")).toBe("desktop-browser");
  });

  it("classifies managed Storage paths by kind and asset", () => {
    const sub = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(classifyStorageObject(`org/${NORTHRIDGE}/asset/${ASSET}/submission/${sub}/photo-1.jpg`, NORTHRIDGE)).toEqual({
      kind: "submission",
      inOrg: true,
      assetId: ASSET,
    });
    expect(classifyStorageObject(`org/${NORTHRIDGE}/asset/${ASSET}/documents/${sub}/${sub}.pdf`, NORTHRIDGE).kind).toBe("document");
    expect(classifyStorageObject(`org/${NORTHRIDGE}/asset/${ASSET}/cover/${sub}.jpg`, NORTHRIDGE).kind).toBe("cover");
    expect(classifyStorageObject(`org/${NORTHRIDGE}/logo/${sub}.png`, NORTHRIDGE)).toEqual({ kind: "logo", inOrg: true, assetId: null });
    expect(classifyStorageObject(`org/${NORTHRIDGE}/asset/${ASSET}/legacy/file.pdf`, NORTHRIDGE)).toEqual({
      kind: "other",
      inOrg: true,
      assetId: ASSET,
    });
  });

  it("resolves stored references to bucket paths, and counts them without naming them", () => {
    const objectPath = `org/${NORTHRIDGE}/asset/${ASSET}/cover/c.jpg`;
    expect(storagePathOf(objectPath, "public-assets")).toBe(objectPath);
    expect(storagePathOf(`https://${SUPABASE_HOST}/storage/v1/object/public/public-assets/${objectPath}`, "public-assets")).toBe(objectPath);
    expect(storagePathOf(`https://${SUPABASE_HOST}/storage/v1/object/public/documents/${objectPath}`, "public-assets")).toBeNull();
    const listed = new Set([`public-assets/${objectPath}`]);
    expect(referenceStats([objectPath, `org/${NORTHRIDGE}/asset/${ASSET}/cover/gone.jpg`, "elsewhere/x.jpg"], "public-assets", listed, NORTHRIDGE)).toEqual({
      references: 3,
      found: 1,
      missing: 2,
      outsideOrgPrefix: 1,
      notThisBucket: 0,
    });
  });
});

describe("summaries", () => {
  it("measures rental durations and finds overlapping sessions", () => {
    const summary = summarizeRentals(
      [
        { status: "returned", started_at: "2026-09-01T15:00:00Z", returned_at: "2026-09-03T15:00:00Z" },
        { status: "returned", started_at: "2026-09-02T15:00:00Z", returned_at: "2026-09-02T21:00:00Z" },
        { status: "cancelled", started_at: "2026-09-02T16:00:00Z", returned_at: null },
        { status: "active", started_at: "2026-10-10T15:00:00Z", returned_at: null },
      ],
      NOW
    );
    expect(summary).toMatchObject({
      total: 4,
      byStatus: { returned: 2, cancelled: 1, active: 1 },
      returnedDurationHours: { min: 6, median: 27, max: 48 },
      overlappingPairs: 1,
      openSince: ["2026-10-10T15:00:00.000Z"],
    });
  });

  it("counts submissions by type, origin, status and photos", () => {
    const summary = summarizeSubmissions([
      { form_type: "damage_report", status: "new", submission_origin: "public", media_urls: ["a", "b"], created_at: "2026-09-01T00:00:00Z", submitted_by_email: "x@gmail.com" },
      { form_type: "return_checklist", status: "resolved", submission_origin: "staff", media_urls: [], rental_session_id: "s", submitted_by_profile_id: "p", inspection_template_key: "trailer_return", created_at: "2026-10-02T00:00:00Z" },
    ], NOW);
    expect(summary).toMatchObject({
      total: 2,
      byType: { damage_report: 1, return_checklist: 1 },
      byOrigin: { public: 1, staff: 1 },
      byStatus: { new: 1, resolved: 1 },
      byMonth: { "2026-09": 1, "2026-10": 1 },
      last30Days: 1,
      withPhotos: 1,
      photoCount: 2,
      withoutPhotos: 1,
      linkedToRental: 1,
      staffSubmitted: 1,
      submitterEmailClasses: { other: 1, none: 1 },
      returnTemplateKeys: { trailer_return: 1 },
    });
  });

  it("groups scans per QR row by month, client class and the last 30 days", () => {
    const perLink = summarizeScans(
      [
        { qr_link_id: LINK, scanned_at: "2026-07-01T10:00:00Z", user_agent: "curl/8", device_type: "desktop" },
        { qr_link_id: LINK, scanned_at: "2026-10-10T10:00:00Z", user_agent: "Mozilla/5.0 (iPhone) Mobile", device_type: "mobile" },
      ],
      NOW
    );
    expect(perLink[LINK]).toEqual({
      walked: 2,
      scanned: { first: "2026-07-01T10:00:00.000Z", last: "2026-10-10T10:00:00.000Z" },
      last30Days: 1,
      byMonth: { "2026-07": 1, "2026-10": 1 },
      byClient: { automated: 1, "mobile-browser": 1 },
      byDevice: { desktop: 1, mobile: 1 },
    });
  });
});

describe("the report", () => {
  const SECRET_VALUES = [
    "Jane Renter",
    "jane.renter@gmail.com",
    "604-555-2380",
    "Do not rent to Jane",
    "Bucket of nails left in the cab",
    "RNT-2026-ABC123",
    "Jane (cash)",
    "signedtoken123",
    `org/${NORTHRIDGE}/asset/${ASSET}/submission/`,
  ];

  const input = {
    target: { mode: "production", host: SUPABASE_HOST, ref: "apeiswnkheiwrpvumder" },
    orgId: NORTHRIDGE,
    supabaseHost: SUPABASE_HOST,
    now: NOW,
    org: {
      id: NORTHRIDGE,
      name: "Northridge Rentals",
      status: "active",
      slug: "northridge-rentals",
      logo_url: "https://wesgroupequipment.com/media/site-logos/logo.png",
      support_phone: "+1-555-1122",
      support_email: "support@mulemark.io",
      notification_email: "support@mulemark.io",
      return_notification_mode: "instant_renter",
    },
    assets: [
      {
        id: ASSET,
        asset_code: "EXCAVATOR-017",
        asset_name: "Excavator 017",
        make: "Kubota",
        model: "U17",
        public_status: "public",
        internal_notes: "Do not rent to Jane",
        cover_image_url: `https://${SUPABASE_HOST}/storage/v1/object/public/public-assets/org/${NORTHRIDGE}/asset/${ASSET}/cover/c.jpg`,
        support_phone_override: "604-555-2380",
        created_at: "2026-05-01T00:00:00Z",
      },
    ],
    qrLinks: [
      {
        id: LINK,
        asset_id: ASSET,
        short_code: "demo-ex017",
        public_url: "https://qr-asset-tags.vercel.app/t/demo-ex017",
        status: "active",
        is_production_primary: true,
        created_at: "2026-05-01T00:00:00Z",
      },
    ],
    pages: [{ asset_id: ASSET, is_published: true, headline: "Excavator 017", safety_notes: "Max side slope - 10 degrees" }],
    documents: [
      {
        id: "d1",
        asset_id: ASSET,
        title: "Kubota U17-3 Manual",
        document_type: "manual",
        storage_path: `org/${NORTHRIDGE}/asset/${ASSET}/documents/x/y.pdf`,
        url: null,
        visibility: "public",
      },
    ],
    sessions: [
      { id: "s1", asset_id: ASSET, status: "returned", started_at: "2026-09-01T00:00:00Z", returned_at: "2026-09-02T00:00:00Z", renter_label: "Jane (cash)", rental_reference: "RNT-2026-ABC123" },
    ],
    submissions: [
      {
        id: "f1",
        asset_id: ASSET,
        form_type: "damage_report",
        status: "new",
        created_at: "2026-09-01T00:00:00Z",
        submitted_by_name: "Jane Renter",
        submitted_by_email: "jane.renter@gmail.com",
        submitted_by_phone: "604-555-2380",
        submission_data_json: { description: "Bucket of nails left in the cab" },
        media_urls: [`org/${NORTHRIDGE}/asset/${ASSET}/submission/f1/p.jpg`, "https://x.supabase.co/storage/v1/object/sign/submissions/a?token=signedtoken123"],
      },
    ],
    acknowledgements: [{ id: "a1", asset_id: ASSET, name: "Jane Renter", email: "jane.renter@gmail.com", acknowledged_at: "2026-09-01T00:00:00Z" }],
    profiles: [{ id: "p1", role: "customer_admin", status: "active", name: "Jane Renter", email: "jane.renter@gmail.com" }],
    tagRequests: [{ id: "t1", status: "delivered", created_at: "2026-07-01T00:00:00Z", production_notes: "Do not rent to Jane" }],
    tagRequestAssets: [{ tag_request_id: "t1", asset_id: ASSET, quantity: 1, notes: "Jane (cash)" }],
    digestRuns: [{ status: "skipped_quiet", window_end: "2026-10-14T13:00:00Z", item_count: 0 }],
    pageTemplates: [{ key: "mini_excavator", is_system: true, organization_id: null }],
    inspectionTemplates: [],
    categoryDefaults: [],
    activityCount: 0,
    orgScanCount: 1,
    scanCounts: { [LINK]: 1 },
    scanRows: [{ qr_link_id: LINK, scanned_at: "2026-10-01T00:00:00Z", user_agent: "Mozilla/5.0 (iPhone) Mobile", device_type: "mobile" }],
    scanWalkTruncated: false,
    storageObjects: [
      { bucket: "documents", path: `org/${NORTHRIDGE}/asset/${ASSET}/documents/x/y.pdf`, size: 1000, createdAt: "2026-06-01T00:00:00Z" },
      { bucket: "submissions", path: `org/${NORTHRIDGE}/asset/${ASSET}/submission/f1/p.jpg`, size: 500, createdAt: "2026-09-01T00:00:00Z" },
    ],
    otherOrgs: [{ id: "4a863fa0-1234-4000-8000-000000000000", name: "Real Customer Ltd", status: "active", assetCount: 3 }],
  };

  it("keeps names, addresses, notes, free text, paths and signed URLs out of the serialized report", () => {
    const serialized = JSON.stringify(buildReport(input), null, 2);
    for (const value of [...SECRET_VALUES, "Real Customer Ltd", "Northridge Rentals", "support@mulemark.io"]) {
      expect(serialized).not.toContain(value);
    }
    expect(redactionProblems(serialized)).toEqual([]);
  });

  it("still carries the evidence the archive boundary needs", () => {
    const report = buildReport(input);
    expect(report.organization).toMatchObject({
      fixture: "northridge",
      logo: { kind: "external", host: "wesgroupequipment.com" },
      supportPhone: "not-dialable",
      notificationEmail: "mulemark",
      returnNotificationMode: "instant_renter",
    });
    const [asset] = report.assets;
    expect(asset).toMatchObject({ assetCode: "EXCAVATOR-017", make: "Kubota", model: "U17", cover: { kind: "hosted", sameProject: true } });
    expect(asset.qrLinks[0]).toMatchObject({
      shortCode: "demo-ex017",
      isProductionPrimary: true,
      storedPublicUrlHost: "qr-asset-tags.vercel.app",
      storedPublicUrlMatchesCode: true,
      scans: { exactCount: 1, walked: 1 },
    });
    expect(asset.documents[0]).toMatchObject({ title: "Kubota U17-3 Manual", hosted: true, hostedObjectListed: true, hostedUnderOrgPrefix: true });
    expect(asset.page.filledFields).toMatchObject({ headline: 13, safety_notes: 27, quick_start_text: 0 });
    expect(asset.submissions).toMatchObject({ total: 1, photoCount: 2, submitterEmailClasses: { other: 1 } });
    // The signed-URL reference resolves to a path outside the organization's prefix that was never listed.
    expect(report.storage.references.submissionMedia).toEqual({ references: 2, found: 1, missing: 1, outsideOrgPrefix: 1, notThisBucket: 0 });
    expect(report.otherOrganizations).toEqual([{ idPrefix: "4a863fa0", status: "active", assets: 3, class: "other" }]);
    expect(report.counts.orphanRows).toEqual({ qrLinks: 0, documents: 0, submissions: 0, sessions: 0 });
  });

  it("catches each kind of leak if one ever slips through", () => {
    expect(redactionProblems('{"a":"jane@gmail.com"}')).toEqual(["email address"]);
    expect(redactionProblems(`{"a":"org/${NORTHRIDGE}/asset/x"}`)).toEqual(["storage object path"]);
    expect(redactionProblems('{"a":"https://h/storage/v1/object/sign/b/p?token=abc"}')).toEqual(["storage URL", "signed-URL marker"]);
    expect(redactionProblems('{"a":"eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9"}')).toEqual(["JWT-shaped string"]);
    expect(redactionProblems('{"a":"sb_secret_123"}')).toEqual(["Supabase secret key"]);
  });
});

describe("read-only by construction", () => {
  it("the audit and its library make no write, RPC, signed-URL, download, auth-admin or fetch call", () => {
    for (const file of ["./showcase-inventory.mjs", "../phase-e/showcase-audit.mjs"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(
        /\.\s*(insert|update|upsert|delete|rpc|remove|upload|download|move|copy|createSignedUrls?|createSignedUploadUrl|uploadToSignedUrl)\s*\(/
      );
      expect(source).not.toMatch(/auth\s*\.\s*admin/);
      expect(source).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
