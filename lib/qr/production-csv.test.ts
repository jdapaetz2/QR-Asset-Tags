import { describe, expect, it } from "vitest";

import { buildPublicQrUrl } from "./url";
import {
  buildProductionCsv,
  PRODUCTION_CSV_HEADERS,
  type ProductionAssetRow,
  type ProductionMeta,
} from "./production-csv";

const meta: ProductionMeta = {
  tag_size: "2in square",
  material: "anodized aluminum",
  mounting_method: "adhesive",
  qr_style_preset: "scan-safe",
  error_correction_level: "H",
  logo_enabled: "no",
  production_notes: "handle with care",
};

function row(overrides: Partial<ProductionAssetRow> = {}): ProductionAssetRow {
  return {
    organization_name: "Northridge Rentals",
    asset_code: "EXCAVATOR-017",
    asset_name: "Mini Excavator",
    category: "earthmoving",
    make: "Bobcat",
    model: "E35",
    short_code: "demo-ex017",
    short_url: buildPublicQrUrl("https://tags.example.com", "demo-ex017"),
    qr_status: "active",
    asset_public_status: "public",
    equipment_page_published: true,
    manual_available: true,
    startup_guide_available: false,
    ...overrides,
  };
}

describe("buildProductionCsv", () => {
  it("emits the exact header order on the first line", () => {
    const csv = buildProductionCsv([], meta);
    expect(csv.split("\r\n")[0]).toBe(PRODUCTION_CSV_HEADERS.join(","));
  });

  it("uses the computed /t/<short> URL and never the stale placeholder host", () => {
    const csv = buildProductionCsv([row()], meta);
    expect(csv).toContain("https://tags.example.com/t/demo-ex017");
    expect(csv).not.toContain("app.example.com");
  });

  it("renders booleans as yes/no and repeats batch metadata per row", () => {
    const csv = buildProductionCsv([row()], meta);
    const dataLine = csv.split("\r\n")[1];
    // equipment_page_published, manual_available, startup_guide_available
    expect(dataLine).toContain(",yes,yes,no,");
    expect(dataLine).toContain("2in square");
    expect(dataLine).toContain("anodized aluminum");
    expect(dataLine).toContain("scan-safe");
  });

  it("guards spreadsheet formula injection in notes and escapes commas/quotes", () => {
    const csv = buildProductionCsv([row({ asset_name: 'Loader, "big"' })], {
      ...meta,
      production_notes: "=cmd()|calc",
    });
    // Formula-trigger value is prefixed with a quote so spreadsheets treat it
    // as text (no comma/quote here, so no extra RFC-4180 wrapping).
    expect(csv).toContain(`'=cmd()|calc`);
    // Field with a comma + quotes is wrapped and inner quotes doubled.
    expect(csv).toContain(`"Loader, ""big"""`);
  });

  it("ends with a trailing CRLF", () => {
    expect(buildProductionCsv([row()], meta).endsWith("\r\n")).toBe(true);
  });
});
