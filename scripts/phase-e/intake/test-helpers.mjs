/**
 * Engineering Phase E3 — fixtures for the intake tests: small intakes built directly (the shape read.mjs produces), and
 * a helper to edit a generated workbook the way a customer would.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const record = (values, row, numeric = {}) => ({ row, values, cells: Object.fromEntries(Object.keys(values).map((k) => [k, `R${row}`])), numeric });

export function intakeOf({ company = {}, people = [], assets = [], models = [], files = [], notes = [], issues = [] } = {}) {
  return {
    meta: { source: "test", file: "test.xlsx", workbook_version: "1.0", mapping_version: "1.0.0", notes: [] },
    company: { values: { ...company }, cells: {} },
    people: people.map((p, i) => record({ ...p }, 6 + i)),
    assets: assets.map((a, i) => (a.values ? record({ ...a.values }, 6 + i, a.numeric) : record({ ...a }, 6 + i))),
    models: models.map((m, i) => record({ ...m }, 6 + i)),
    files: files.map((f, i) => record({ ...f }, 6 + i)),
    notes: notes.map((n, i) => record({ ...n }, 6 + i)),
    issues: [...issues],
  };
}

export const GOOD_COMPANY = {
  "company.name": "Test Rentals",
  "company.support_phone": "604-555-0100",
  "company.support_email": "help@example.com",
  "approver.name": "Robin Vale",
  "approver.title": "Owner",
  "approver.email": "robin@example.com",
  "alerts.notification_email": "help@example.com",
};
export const GOOD_PEOPLE = [{ "people.name": "Robin Vale", "people.email": "robin@example.com", "people.role": "Administrator" }];
export const GOOD_MODEL = {
  "model.name": "Big Tex 35SA",
  "model.make": "Big Tex",
  "model.model": "35SA",
  "model.manual": "https://www.example.com/35sa-manual.pdf",
  "model.manual_share": "Link to the maker's copy",
  "model.manual_depends": "No",
  "model.category": "Utility trailer",
  "model.accessories": "2 straps",
};
export const GOOD_ASSET = {
  "asset.code": "00412",
  "asset.name": "Utility trailer 12 ft",
  "asset.model": "Big Tex 35SA",
  "asset.photo": "In Photos folder",
  "asset.tag": "New tag",
  "asset.year": "2022",
  "asset.serial": "DEMO-412",
};
export const GOOD_UPLOAD = [{ path: "Photos/00412/IMG_1.HEIC", bytes: 2_000_000 }];
export const PREPARED_CLEARED = [{ model_name: "Big Tex 35SA", model_key: "bigtex.35sa.12", manual_cleared: true }];

/** Open a generated workbook, let edit(workbook) change cells as a customer would, and return the new bytes. */
export async function editWorkbook(buffer, edit) {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  await edit(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
