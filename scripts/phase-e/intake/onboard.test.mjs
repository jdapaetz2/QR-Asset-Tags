/**
 * Engineering Phase E3 — the onboarding commands (kit 2.0), end to end in a temporary private root outside the repo:
 * onboard:start lays out the batch (inbox folders included), never overwrites one, warns about a near-duplicate
 * customer folder and remembers your name; onboard:check fills MODELS and ASSETS from the customer's list only while
 * ASSETS is empty (after a backup), keeps everything typed, checks, and writes the to-do list and plain-text drafts. It
 * removes a questions email that's no longer needed, never overwrites a tag order, refuses the repository, asks which
 * list to use, reads a list under a title line, says what to do with an old Excel export, flags plain-number unit
 * numbers, and says to close Excel when it can't write the workbook.
 */
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TABS } from "./field-mapping.mjs";
import { PATHS, REPO } from "./kit-config.mjs";
import { INBOX_FOLDERS, TO_SEND, WORKBOOK, checkBatch, companyDir, startBatch } from "./onboard.mjs";
import { readWorkbook } from "./read.mjs";
import { editWorkbook } from "./test-helpers.mjs";

vi.setConfig({ testTimeout: 60_000 });
const FLEET = path.join(REPO, "scripts", "phase-e", "intake", "fixtures", "fleet-export.csv");

let root;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "mulemark-onboard-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const batchDir = (n = 1, company = "Example Rentals") => path.join(companyDir(company, root), `batch-${n}`);
const check = (...parts) => path.join(batchDir(), "check", ...parts);
/** Type answers onto the CALL SHEET of a batch's workbook, by question label. */
async function answer(answers, n = 1) {
  const file = path.join(batchDir(n), WORKBOOK);
  writeFileSync(
    file,
    await editWorkbook(readFileSync(file), (wb) => {
      const call = wb.getWorksheet(TABS.company);
      for (let r = 1; r <= 80; r++) {
        const label = call.getCell(r, 2).value;
        if (label in answers) call.getCell(r, 3).value = answers[label];
      }
    }),
  );
}

describe("onboard:start", () => {
  it("lays out the batch: the setup workbook with the name, inbox and its folders, the two files to send and the welcome email", async () => {
    const { dir, warnings } = await startBatch("Example Rentals", { root });
    expect(dir).toBe(batchDir());
    expect(readdirSync(dir).sort()).toEqual(["email-1-welcome.txt", "inbox", WORKBOOK, "to-send"].sort());
    expect(readdirSync(path.join(dir, "inbox")).sort()).toEqual([...INBOX_FOLDERS].sort());
    expect(readdirSync(path.join(dir, "to-send")).sort()).toEqual([...TO_SEND].sort());
    for (const f of TO_SEND) expect(Buffer.compare(readFileSync(path.join(dir, "to-send", f)), readFileSync(path.join(PATHS.customer, f))), f).toBe(0);
    const intake = await readWorkbook(readFileSync(path.join(dir, WORKBOOK)));
    expect(intake.company.values["company.name"]).toBe("Example Rentals");
    expect(intake.assets).toEqual([]);
    const welcome = readFileSync(path.join(dir, "email-1-welcome.txt"), "utf8");
    expect(welcome.startsWith("Subject: Getting Example Rentals set up on Mulemark\n")).toBe(true);
    expect(welcome).not.toMatch(/\*\*/);
    expect([...welcome.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()).toEqual(["call_times", "contact_first_name", "sender_name"]);
    // Until the commercial review, it says the one-pager isn't ready for a real customer.
    expect(warnings.some((w) => w.includes("DRAFT wording"))).toBe(true);
  });

  it("remembers your name once given, and fills it into every draft", async () => {
    await startBatch("Example Rentals", { root, sender: "Sam Example" });
    expect(readFileSync(path.join(root, "sender.txt"), "utf8")).toBe("Sam Example\n");
    expect(readFileSync(path.join(batchDir(), "email-1-welcome.txt"), "utf8")).toMatch(/\nSam Example\nMulemark\n$/);
    const { dir } = await startBatch("Other Rentals", { root });
    expect(readFileSync(path.join(dir, "email-1-welcome.txt"), "utf8")).toMatch(/\nSam Example\nMulemark\n$/);
    copyFileSync(FLEET, path.join(batchDir(), "inbox", "fleet.csv"));
    await checkBatch("Example Rentals", { root });
    expect(readFileSync(check("email-4-live.txt"), "utf8")).toMatch(/\nSam Example\nMulemark\n$/);
  });

  it("never overwrites a batch; a new one needs --batch", async () => {
    await startBatch("Example Rentals", { root });
    await expect(startBatch("Example Rentals", { root })).rejects.toThrow(/already exists.*onboard:check.*--batch 2/);
    const { dir } = await startBatch("Example Rentals", { root, batch: 2 });
    expect(dir).toBe(batchDir(2));
  });

  it("warns when a similarly named customer folder already exists", async () => {
    await startBatch("Example Rentals", { root });
    const { warnings } = await startBatch("Example Rentals, LLC", { root });
    expect(warnings.some((w) => w.startsWith("A similar customer folder already exists") && w.includes("example-rentals"))).toBe(true);
  });

  it("refuses a folder inside the repository and a name that makes no folder", async () => {
    await expect(startBatch("Example Rentals", { root: path.join(REPO, "docs") })).rejects.toThrow(/Refusing/);
    await expect(startBatch("!!!", { root })).rejects.toThrow(/doesn't make a folder name/);
    await expect(startBatch("", { root })).rejects.toThrow(/Name the customer/);
  });
});

describe("onboard:check", () => {
  it("before the list arrives: says so, lists what to ask, and writes no drafts", async () => {
    await startBatch("Example Rentals", { root });
    const { filled, run, notes } = await checkBatch("Example Rentals", { root });
    expect(filled).toBeNull();
    expect(notes).toEqual(["No equipment list in inbox\\ yet: save the customer's list there (CSV or Excel), then run this again."]);
    expect(run.summary.total).toBe(0);
    const todo = readFileSync(check("to-do.md"), "utf8");
    expect(todo).toContain("**No machines yet.**");
    expect(todo).toContain("Which phone number or email should renters use to reach you?");
    expect(todo).toContain("Where should we ship the tags, and who will sign for them?");
    for (const f of ["email-3-preview-ready.txt", "email-4-live.txt", "tag-order.xlsx"]) expect(existsSync(check(f)), f).toBe(false);
  });

  it("fills MODELS and ASSETS from the list once, after a backup, keeping the call sheet; then only checks", async () => {
    await startBatch("Example Rentals", { root });
    await answer({ "Who approves the pages: name": "Robin Vale" });
    const typed = readFileSync(path.join(batchDir(), WORKBOOK));
    copyFileSync(FLEET, path.join(batchDir(), "inbox", "Example fleet.csv"));

    const first = await checkBatch("Example Rentals", { root });
    expect(first.filled).toEqual({ from: "Example fleet.csv", backup: "setup-workbook.before-fill.xlsx", rows: 5 });
    expect(Buffer.compare(readFileSync(path.join(batchDir(), "setup-workbook.before-fill.xlsx")), typed)).toBe(0);
    const intake = await readWorkbook(readFileSync(path.join(batchDir(), WORKBOOK)));
    expect(intake.assets.map((a) => a.values["asset.code"])).toEqual(["00412", "00413", "00414", "E20-07", "PC-11"]);
    expect(intake.company.values).toMatchObject({ "company.name": "Example Rentals", "approver.name": "Robin Vale" });
    // New models start with "Manual changes by year or serial?" = Not sure, so checking it is on the to-do list.
    expect(intake.models.map((m) => m.values["model.manual_depends"])).toEqual(["Not sure", "Not sure", "Not sure"]);
    expect(JSON.parse(readFileSync(check("fleet-mapping.json"), "utf8")).unmapped_columns).toEqual(["Daily Rate", "Location"]);
    expect(first.run.manifest).toMatchObject({ written: true, valid: true, assets: 5 });
    expect(first.run.inbox).toEqual({ checked: true, files: 1 });
    expect(readdirSync(check()).sort()).toEqual(["current-import.csv", "email-3-preview-ready.txt", "email-4-live.txt", "fleet-mapping.json", "manifest.json", "questions-email.txt", "readiness.xlsx", "run.json", "tag-order.xlsx", "to-do.md"]);
    expect(readFileSync(check("questions-email.txt"), "utf8")).toContain("PC-11 (Plate compactor): which make and model is it?");

    const again = await checkBatch("Example Rentals", { root });
    expect(again.filled).toBeNull();
    expect(readdirSync(batchDir()).filter((n) => n.startsWith("setup-workbook.before-fill"))).toEqual(["setup-workbook.before-fill.xlsx"]);
    expect(again.run.summary).toEqual(first.run.summary);
  });

  it("removes the questions email once there's nothing left to ask, and never overwrites the tag order", async () => {
    await startBatch("Example Rentals", { root });
    writeFileSync(path.join(batchDir(), "inbox", "fleet.csv"), "Unit #,Description,Make,Model\r\nT-1,Utility trailer 12 ft,Big Tex,35SA\r\n");
    await checkBatch("Example Rentals", { root });
    expect(existsSync(check("questions-email.txt"))).toBe(true);
    const order = readFileSync(check("tag-order.xlsx"));
    // The call answers everything.
    const file = path.join(batchDir(), WORKBOOK);
    writeFileSync(
      file,
      await editWorkbook(readFileSync(file), (wb) => {
        const call = wb.getWorksheet(TABS.company);
        const set = (label, v) => {
          for (let r = 1; r <= 80; r++) if (call.getCell(r, 2).value === label) call.getCell(r, 3).value = v;
        };
        set("Support phone renters see", "604-555-0100");
        set("Who approves the pages: name", "Robin Vale");
        set("Approver's job title", "Owner");
        set("Approver's email", "robin@example.com");
        set("Where renter reports go (one email)", "rentals@example.com");
        set("Ship tags to", "100 Example Street, Example City");
        call.getCell(6, 6).value = "Robin Vale";
        call.getCell(6, 7).value = "robin@example.com";
        call.getCell(6, 8).value = "Administrator";
      }),
    );
    const { run } = await checkBatch("Example Rentals", { root });
    expect(run.items.customer).toBe(0);
    expect(run.questions_email).toMatch(/^not needed/);
    expect(existsSync(check("questions-email.txt"))).toBe(false);
    // The tag order already existed (you may have started filling it), so the second check left it alone.
    expect(Buffer.compare(readFileSync(check("tag-order.xlsx")), order)).toBe(0);
  });

  it("asks which list to use when inbox\\ has several, and takes --list", async () => {
    await startBatch("Example Rentals", { root });
    copyFileSync(FLEET, path.join(batchDir(), "inbox", "a.csv"));
    copyFileSync(FLEET, path.join(batchDir(), "inbox", "b.csv"));
    await expect(checkBatch("Example Rentals", { root })).rejects.toThrow(/2 spreadsheets \(a\.csv, b\.csv\).*--list/);
    const { filled } = await checkBatch("Example Rentals", { root, list: "b.csv" });
    expect(filled.from).toBe("b.csv");
  });

  it("reads a list below a title line, and refuses one with no unit-number column", async () => {
    await startBatch("Example Rentals", { root });
    writeFileSync(path.join(batchDir(), "inbox", "fleet.csv"), `Example Rentals - Equipment Master List\r\nPrinted 2026-11-24\r\n\r\n${readFileSync(FLEET, "utf8")}`);
    const { filled, report } = await checkBatch("Example Rentals", { root });
    expect(filled.rows).toBe(5);
    expect(report.reader_notes).toEqual(["Skipped 3 lines above the header row."]);
    await startBatch("Example Rentals", { root, batch: 2 });
    writeFileSync(path.join(batchDir(2), "inbox", "fleet.csv"), "Name,Price\r\nTrailer,59\r\n");
    await expect(checkBatch("Example Rentals", { root })).rejects.toThrow(/no header row with a unit number column/);
  });

  it("says what to do with an old Excel export", async () => {
    await startBatch("Example Rentals", { root });
    writeFileSync(path.join(batchDir(), "inbox", "fleet.xls"), "not really excel");
    const { notes, run } = await checkBatch("Example Rentals", { root });
    expect(notes).toEqual(["inbox\\fleet.xls is an old Excel or text export: open it in Excel and Save As .xlsx into inbox\\, then run this again."]);
    expect(run.items.mulemark).toBeGreaterThan(0);
    expect(readFileSync(check("to-do.md"), "utf8")).toContain("inbox\\fleet.xls: an old Excel or text export the check can't read.");
  });

  it("flags plain-number unit numbers once (a note asks the customer), merges model spellings and leaves out category codes", async () => {
    await startBatch("Example Rentals", { root });
    writeFileSync(
      path.join(batchDir(), "inbox", "fleet.csv"),
      ["Unit #,Description,Mfr,Model #,Class", "401,Utility trailer,Big Tex,30SA-12,TRL-UTIL", "402,Utility trailer,Big Tex,30SA-12,TRL-UTIL", "403,Utility trailer,BIG TEX,30SA12,TRL-UTIL", "PC-4,Plate compactor,Wacker Neuson,,COMP"].join("\r\n"),
    );
    const { report } = await checkBatch("Example Rentals", { root });
    expect(report.plain_number_codes).toBe("401–403");
    expect(report.merged_model_spellings).toEqual([{ kept: "Big Tex 30SA-12", merged: ["BIG TEX 30SA12"] }]);
    expect(report.category_codes_not_used).toEqual(["TRL-UTIL"]);
    const intake = await readWorkbook(readFileSync(path.join(batchDir(), WORKBOOK)));
    expect(intake.models.map((m) => m.values["model.name"])).toEqual(["Big Tex 30SA-12"]);
    expect(intake.models[0].values["model.category"]).toBeNull();
    expect(intake.assets.every((a) => !a.values["asset.category"])).toBe(true);
    expect(intake.notes.map((n) => n.values["note.about"])).toEqual(["Unit numbers"]);
    const questions = readFileSync(check("questions-email.txt"), "utf8");
    expect(questions).toContain("Your list has unit numbers like 401–403. Are they exactly like that on your machines, or do they start with zeros (like 00401)?");
    expect(questions).toContain("PC-4 (Plate compactor): which Wacker Neuson model is it?");
    expect(questions).not.toContain("Wacker Neuson (1 machine)");
  });

  it("uses the latest batch unless told otherwise, and picks up prepared.json", async () => {
    await startBatch("Example Rentals", { root });
    await startBatch("Example Rentals", { root, batch: 2 });
    copyFileSync(FLEET, path.join(batchDir(2), "inbox", "fleet.csv"));
    writeFileSync(path.join(batchDir(2), "prepared.json"), JSON.stringify([{ model_name: "Big Tex 35SA", model_key: "bigtex.35sa.12" }]));
    const { dir, run } = await checkBatch("Example Rentals", { root });
    expect(dir).toBe(batchDir(2));
    expect(run.batch_id).toBe("example-rentals-batch-2");
    expect(run.prepared_models).toEqual(["Big Tex 35SA"]);
    await expect(checkBatch("Example Rentals", { root, batch: 5 })).rejects.toThrow(/no batch-5/);
    await expect(checkBatch("Nobody Yet", { root })).rejects.toThrow(/No batch for "Nobody Yet" yet/);
  });

  it("says to close the workbook in Excel when it can't be written, and changes nothing", async () => {
    await startBatch("Example Rentals", { root });
    copyFileSync(FLEET, path.join(batchDir(), "inbox", "fleet.csv"));
    const wbPath = path.join(batchDir(), WORKBOOK);
    const before = readFileSync(wbPath);
    chmodSync(wbPath, 0o444);
    try {
      await expect(checkBatch("Example Rentals", { root })).rejects.toThrow(/setup-workbook\.xlsx is open in another program\. Close it in Excel/);
    } finally {
      chmodSync(wbPath, 0o666);
    }
    expect(Buffer.compare(readFileSync(wbPath), before)).toBe(0);
    expect(existsSync(path.join(batchDir(), "setup-workbook.before-fill.xlsx"))).toBe(false);
  });

  it("says to close a check output in Excel before rewriting anything", async () => {
    await startBatch("Example Rentals", { root });
    copyFileSync(FLEET, path.join(batchDir(), "inbox", "fleet.csv"));
    await checkBatch("Example Rentals", { root });
    const todo = readFileSync(check("to-do.md"));
    chmodSync(check("readiness.xlsx"), 0o444);
    try {
      await expect(checkBatch("Example Rentals", { root })).rejects.toThrow(/readiness\.xlsx is open in another program/);
    } finally {
      chmodSync(check("readiness.xlsx"), 0o666);
    }
    expect(Buffer.compare(readFileSync(check("to-do.md")), todo)).toBe(0);
  });
});
