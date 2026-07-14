import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { nextStatusActions } from "./status-actions";

const targets = (status: string, opts?: { hideResolve?: boolean }) =>
  nextStatusActions(status, opts).map((a) => a.status);

describe("nextStatusActions — direct transitions", () => {
  it("never offers the current status", () => {
    for (const s of ["new", "reviewed", "resolved", "archived"]) {
      expect(targets(s)).not.toContain(s);
    }
  });

  it("new → mark reviewed / resolve / archive", () => {
    expect(targets("new")).toEqual(["reviewed", "resolved", "archived"]);
  });

  it("reviewed → reopen as new / resolve / archive", () => {
    expect(targets("reviewed")).toEqual(["new", "resolved", "archived"]);
    expect(nextStatusActions("reviewed").find((a) => a.status === "new")?.label).toBe("Reopen as new");
  });

  it("resolved → reopen as reviewed / archive (no direct resolve)", () => {
    expect(targets("resolved")).toEqual(["reviewed", "archived"]);
    expect(nextStatusActions("resolved").find((a) => a.status === "reviewed")?.label).toBe(
      "Reopen as reviewed"
    );
  });

  it("archived → restore as reviewed only", () => {
    const a = nextStatusActions("archived");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ status: "reviewed", label: "Restore as reviewed" });
  });

  it("archive action carries the confirm tone", () => {
    expect(nextStatusActions("new").find((a) => a.status === "archived")?.tone).toBe("archive");
  });

  it("hideResolve drops the ordinary Resolve (active renter return)", () => {
    expect(targets("new", { hideResolve: true })).toEqual(["reviewed", "archived"]);
    expect(targets("reviewed", { hideResolve: true })).toEqual(["new", "archived"]);
  });

  it("an unknown status yields no actions", () => {
    expect(nextStatusActions("bogus")).toEqual([]);
  });
});

describe("setSubmissionStatus resolve guard (structural)", () => {
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "actions.ts"),
    "utf8"
  );
  it("rejects ordinary Resolve of an active renter return, pointing to Mark returned & resolve", () => {
    expect(src).toContain('status === "resolved"');
    expect(src).toContain('row.form_type === "return_checklist"');
    expect(src).toContain('row.submission_origin !== "staff"');
    expect(src).toContain("Use Mark returned & resolve");
  });
});
