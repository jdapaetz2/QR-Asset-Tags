import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Wave 3N.3: staff members must stay in their mobile shell when opening shared records, never dropping into the
// desktop admin app, and always able to get back to the scanned asset. Server components → asserted structurally.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

const STAFF = "app/(staff)/staff/t/[shortCode]";

describe("staff workflow links stay in the staff mobile shell (Part A/C)", () => {
  it("the staff asset page routes evidence + submissions to the staff wrappers, not /dashboard", () => {
    const src = read(`${STAFF}/page.tsx`);
    expect(src).toContain("`/staff/t/${shortCode}/evidence/${sessionId}`");
    expect(src).toContain("`/staff/t/${shortCode}/submissions/${baselineId}`");
    expect(src).not.toContain("/dashboard/submissions/");
    expect(src).not.toContain("buildSessionEvidenceHref");
  });

  it("the outbound (blocked) page routes both view links to the staff wrappers", () => {
    const src = read(`${STAFF}/outbound/page.tsx`);
    expect(src).toContain("`/staff/t/${shortCode}/submissions/${baseline.id}`");
    expect(src).toContain("`/staff/t/${shortCode}/evidence/${session.id}`");
    expect(src).not.toContain("/dashboard/submissions/");
  });

  it("the staff return page opens a renter report inside the staff shell", () => {
    expect(read(`${STAFF}/return/page.tsx`)).toContain(
      "`/staff/t/${shortCode}/submissions/${r.id}`"
    );
  });

  it("the return-complete page offers View checklist + evidence + a prominent Back to staff asset", () => {
    const src = read(`${STAFF}/return/complete/page.tsx`);
    expect(src).toContain("`/staff/t/${shortCode}/submissions/${data.id}`");
    expect(src).toContain("`/staff/t/${shortCode}/evidence/${evidenceSessionId}`");
    expect(src).toContain("← Back to staff asset");
    expect(src).toContain("View staff return checklist"); // Staff return checklist terminology
    expect(src).not.toContain("/dashboard/submissions/");
  });
});

describe("thin staff wrappers reuse the shared loaders + components (Part B)", () => {
  const evidence = read(`${STAFF}/evidence/[sessionId]/page.tsx`);
  const submission = read(`${STAFF}/submissions/[submissionId]/page.tsx`);

  it("the evidence wrapper guards by short code + asset pairing and renders the shared record", () => {
    expect(evidence).toContain("requireStaffAssetByShortCode");
    expect(evidence).toContain("getRentalSessionEvidence"); // shared loader, not a forked query
    expect(evidence).toContain("belongsToScannedAsset(evidence.session.asset_id, asset.id)");
    expect(evidence).toContain("<SessionEvidenceRecord"); // shared presentational component
    expect(evidence).toContain("StaffRecordFrame");
    // Keeps the "Open submission" link inside the staff shell.
    expect(evidence).toContain("`/staff/t/${shortCode}/submissions/${id}`");
  });

  it("the submission wrapper guards by short code + asset pairing, is read-only, uses the shared record", () => {
    expect(submission).toContain("requireStaffAssetByShortCode");
    expect(submission).toContain("getSubmissionRecord"); // shared loader
    expect(submission).toContain("belongsToScannedAsset(record.submission.asset_id, asset.id)");
    expect(submission).toContain("<SubmissionDetailRecord");
    expect(submission).toContain("StaffRecordFrame");
    // Read-only: no admin status-mutation controls.
    expect(submission).not.toContain("SubmissionStatusActions");
    expect(submission).not.toContain("MarkReturnedResolveButton");
  });

  it("StaffRecordFrame gives an above-the-fold Back to the scanned asset", () => {
    const frame = read("components/staff/staff-record-frame.tsx");
    expect(frame).toContain("`/staff/t/${shortCode}`");
    expect(frame).toContain("← Back to");
  });
});

describe("admin surfaces keep their dashboard chrome + reuse the same components (Part B)", () => {
  it("admin evidence + submission pages render the shared records and keep /dashboard back links", () => {
    const adminEvidence = read("app/(admin)/dashboard/rentals/[sessionId]/page.tsx");
    expect(adminEvidence).toContain("<SessionEvidenceRecord");
    expect(adminEvidence).toContain('backHref(returnTo, "/dashboard/rentals")');
    const adminSubmission = read("app/(admin)/dashboard/submissions/[submissionId]/page.tsx");
    expect(adminSubmission).toContain("<SubmissionDetailRecord");
    expect(adminSubmission).toContain('backHref(returnTo, "/dashboard/submissions")');
  });

  it("neither admin page signs media inline anymore (shared signMediaPaths)", () => {
    for (const p of [
      "app/(admin)/dashboard/rentals/[sessionId]/page.tsx",
      "app/(admin)/dashboard/submissions/[submissionId]/page.tsx",
    ]) {
      expect(read(p), p).toContain("signMediaPaths");
      expect(read(p), p).not.toContain("createSignedUrl");
    }
  });
});

describe("cold-staff sign-in affordance + renter flow (Part D)", () => {
  const publicPage = read("components/public/public-equipment-page.tsx");

  it("shows a quiet 'Staff member? Sign in' to non-staff viewers, linking to a safe next", () => {
    expect(publicPage).toContain("Staff member? Sign in");
    expect(publicPage).toContain("`/login?next=/staff/t/${shortCode}`");
    expect(publicPage).toContain("{!isStaffViewer ?");
  });

  it("keeps the same-org authorized staff banner", () => {
    expect(publicPage).toContain("Open staff workflow");
    expect(publicPage).toContain("{isStaffViewer ?");
  });

  it("renter primary action is unchanged (Report Damage stays the primary CTA)", () => {
    expect(read("components/public/public-scanner-view.tsx")).toContain("Report Damage");
  });
});

describe("no in-app scanner (Part goal)", () => {
  it("no Scan item is introduced into the navigation", () => {
    // The customer/owner nav never gains a Scan destination (staff reach scan from a physical QR).
    expect(read("lib/auth/nav.ts")).not.toContain('label: "Scan"');
  });
});
