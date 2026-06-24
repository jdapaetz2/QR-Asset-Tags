import { describe, expect, it } from "vitest";

import { buildSubmissionEmail, buildTagStatusEmail } from "./email";

describe("buildSubmissionEmail", () => {
  const email = buildSubmissionEmail({
    orgName: "Northridge Rentals",
    formTypeLabel: "Damage report",
    asset: { code: "EXC-001", name: "Mini Excavator", category: "Excavators" },
    submittedBy: { name: "Jamie", email: "jamie@site.test", phone: null },
    summary: "Hydraulic leak near the boom.",
    adminUrl: "https://app.test/dashboard/submissions/abc",
  });

  it("includes org, asset code, form type, submitter, summary, and admin link", () => {
    expect(email.subject).toMatch(/damage report/i);
    expect(email.subject).toContain("EXC-001");
    expect(email.text).toContain("Northridge Rentals");
    expect(email.text).toContain("EXC-001");
    expect(email.text).toContain("Mini Excavator");
    expect(email.text).toContain("Excavators");
    expect(email.text).toContain("Jamie");
    expect(email.text).toContain("jamie@site.test");
    expect(email.text).toContain("Hydraulic leak near the boom.");
    expect(email.text).toContain("https://app.test/dashboard/submissions/abc");
  });

  it("never leaks media URLs and escapes HTML", () => {
    const e = buildSubmissionEmail({
      orgName: "Acme <b>",
      formTypeLabel: "Support request",
      asset: { code: null, name: null, category: null },
      submittedBy: { name: null, email: null, phone: null },
      summary: "",
      adminUrl: "https://app.test/dashboard/submissions/x",
    });
    expect(e.text).not.toMatch(/storage|media|signed|\.jpg|\.png/i);
    expect(e.html).toContain("Acme &lt;b&gt;");
    expect(e.text).toContain("Anonymous");
  });
});

describe("buildTagStatusEmail", () => {
  it("includes org, status, and a manage link", () => {
    const e = buildTagStatusEmail({
      orgName: "Northridge Rentals",
      statusLabel: "In production",
      manageUrl: "https://app.test/dashboard/tag-requests",
    });
    expect(e.subject).toMatch(/tag request update/i);
    expect(e.subject).toContain("In production");
    expect(e.text).toContain("Northridge Rentals");
    expect(e.text).toContain("In production");
    expect(e.text).toContain("https://app.test/dashboard/tag-requests");
  });
});
