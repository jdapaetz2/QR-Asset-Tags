import { describe, expect, it } from "vitest";

import { buildSubmissionEmail, buildTagStatusEmail } from "./email";

const PROD = "https://mulemark.io";

function submission(overrides: Partial<Parameters<typeof buildSubmissionEmail>[0]> = {}) {
  return buildSubmissionEmail({
    orgName: "Northridge Rentals",
    formType: "damage_report",
    formTypeLabel: "Damage report",
    asset: { code: "EXC-001", name: "Mini Excavator", category: "Excavators" },
    submittedBy: { name: "Jamie", email: "jamie@site.test", phone: null },
    reference: "SUB-2026-A1B2C3",
    summary: "Hydraulic leak near the boom.",
    adminUrl: `${PROD}/dashboard/submissions/abc`,
    settingsUrl: `${PROD}/dashboard/settings`,
    ...overrides,
  });
}

describe("buildSubmissionEmail", () => {
  it("includes org, asset, form type, submitter, reference, summary, and admin link", () => {
    const email = submission();
    expect(email.text).toContain("Northridge Rentals");
    expect(email.text).toContain("EXC-001");
    expect(email.text).toContain("Mini Excavator");
    expect(email.text).toContain("Excavators");
    expect(email.text).toContain("Jamie");
    expect(email.text).toContain("jamie@site.test");
    expect(email.text).toContain("SUB-2026-A1B2C3");
    expect(email.text).toContain("Hydraulic leak near the boom.");
    expect(email.text).toContain(`${PROD}/dashboard/submissions/abc`);
  });

  it("never leaks media URLs and escapes HTML", () => {
    const e = submission({
      orgName: "Acme <b>",
      formType: "support_request",
      formTypeLabel: "Support request",
      asset: { code: null, name: null, category: null },
      submittedBy: { name: null, email: null, phone: null },
      summary: "",
    });
    expect(e.text).not.toMatch(/storage|media|signed|\.jpg|\.png/i);
    expect(e.html).toContain("Acme &lt;b&gt;");
    expect(e.text).toContain("Anonymous");
  });

  /**
   * Phase B4 — transactional subject lines. A specific operational subject naming the asset code is
   * both what a yard manager needs at a glance and what keeps the message out of a promotions/spam
   * bucket. The asset CODE alone, not "code — name", so it survives a phone notification.
   */
  describe("subjects (B4)", () => {
    it("uses the exact operational subject per form type", () => {
      expect(submission().subject).toBe("New damage report — EXC-001");
      expect(
        submission({ formType: "support_request", formTypeLabel: "Support request" }).subject
      ).toBe("Support request — EXC-001");
      expect(
        submission({ formType: "return_checklist", formTypeLabel: "Return checklist" }).subject
      ).toBe("Return checklist submitted — EXC-001");
    });

    it("falls back to the asset name, then a neutral phrase, when there is no code", () => {
      expect(submission({ asset: { code: null, name: "Mini Excavator", category: null } }).subject).toBe(
        "New damage report — Mini Excavator"
      );
      expect(submission({ asset: { code: null, name: null, category: null } }).subject).toBe(
        "New damage report — unidentified asset"
      );
    });

    it("carries no urgency or marketing hook", () => {
      for (const formType of ["damage_report", "support_request", "return_checklist"]) {
        const s = submission({ formType }).subject;
        expect(s).not.toMatch(/urgent|act now|!|free|offer|don't miss/i);
      }
    });
  });

  describe("recipient reason line (B4)", () => {
    it("names the org, the topic, and where to turn it off", () => {
      const e = submission();
      expect(e.text).toContain("You are receiving this because Northridge Rentals has email notifications enabled for damage reports.");
      expect(e.text).toContain(`${PROD}/dashboard/settings`);
    });

    it("uses the right topic per form type", () => {
      expect(submission({ formType: "support_request", formTypeLabel: "Support request" }).text)
        .toContain("enabled for support requests");
      expect(submission({ formType: "return_checklist", formTypeLabel: "Return checklist" }).text)
        .toContain("enabled for return checklists");
    });

    it("omits the settings link rather than emitting a broken one", () => {
      const e = submission({ settingsUrl: null });
      expect(e.text).toContain("has email notifications enabled for damage reports.");
      expect(e.text).not.toContain("/dashboard/settings");
    });
  });

  describe("transactional deliverability rules (B4)", () => {
    it("sends a real plain-text part alongside the HTML", () => {
      const e = submission();
      expect(e.text.length).toBeGreaterThan(50);
      expect(e.text).not.toContain("<p>");
      expect(e.html).toContain("<p>");
    });

    it("has no image, no tracking pixel, and no attachment", () => {
      const html = submission().html;
      expect(html).not.toMatch(/<img|background-image|<script|<iframe/i);
    });

    it("links straight to the canonical host — no shortener, no redirect wrapper", () => {
      const e = submission();
      const links = e.html.match(/href="([^"]+)"/g) ?? [];
      expect(links.length).toBe(1);
      expect(links[0]).toContain(`${PROD}/dashboard/submissions/abc`);
      expect(e.text).not.toMatch(/bit\.ly|tinyurl|t\.co\/|\/r\/|click\?/i);
    });

    it("puts every URL on the production host, never a preview or localhost one", () => {
      const e = submission();
      for (const url of e.text.match(/https?:\/\/\S+/g) ?? []) {
        expect(url.startsWith(PROD)).toBe(true);
      }
      expect(e.text).not.toContain("vercel.app");
      expect(e.text).not.toContain("localhost");
    });
  });
});

describe("buildTagStatusEmail", () => {
  const tag = buildTagStatusEmail({
    orgName: "Northridge Rentals",
    statusLabel: "In production",
    reference: "tr-9",
    manageUrl: `${PROD}/dashboard/tag-requests`,
    settingsUrl: `${PROD}/dashboard/settings`,
  });

  it("includes org, status, reference, and a manage link", () => {
    expect(tag.text).toContain("Northridge Rentals");
    expect(tag.text).toContain("In production");
    expect(tag.text).toContain("tr-9");
    expect(tag.text).toContain(`${PROD}/dashboard/tag-requests`);
  });

  /**
   * Named for the ORGANIZATION rather than the status: a customer with several requests open needs to
   * know who it is about first, and the status is the opening line of the body.
   */
  it("uses the exact operational subject (B4)", () => {
    expect(tag.subject).toBe("Tag request updated — Northridge Rentals");
  });

  it("explains why the recipient got it, and stays free of images and shorteners (B4)", () => {
    expect(tag.text).toContain("enabled for tag request updates");
    expect(tag.html).not.toMatch(/<img|<script|<iframe/i);
    expect(tag.text).not.toMatch(/bit\.ly|tinyurl/i);
  });

  it("keeps From/Reply-To out of the body — they are transport concerns, set once in the sender", () => {
    expect(tag.text).not.toContain("notifications@");
    expect(tag.text).not.toContain("support@mulemark.io");
  });
});
