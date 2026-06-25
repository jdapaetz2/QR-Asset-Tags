import { describe, expect, it } from "vitest";

import {
  enabledExportTypes,
  isExportTypeEnabled,
  isExportTypeKey,
  parseExportSettingsForm,
  toExportFlags,
} from "./types";

describe("toExportFlags", () => {
  it("defaults every flag to false", () => {
    expect(toExportFlags(null)).toEqual({
      customer_exports_enabled: false,
      export_assets_enabled: false,
      export_qr_mapping_enabled: false,
      export_documents_enabled: false,
      export_submissions_enabled: false,
    });
  });
});

describe("isExportTypeEnabled", () => {
  const flags = toExportFlags({
    customer_exports_enabled: true,
    export_assets_enabled: true,
  });

  it("requires the master flag AND the per-type flag", () => {
    expect(isExportTypeEnabled(flags, "assets")).toBe(true);
    expect(isExportTypeEnabled(flags, "qr_mapping")).toBe(false);
  });

  it("is false for everything when the master flag is off", () => {
    const off = toExportFlags({ export_assets_enabled: true });
    expect(isExportTypeEnabled(off, "assets")).toBe(false);
  });
});

describe("enabledExportTypes", () => {
  it("lists only enabled types, and nothing when the master is off", () => {
    expect(
      enabledExportTypes(
        toExportFlags({ customer_exports_enabled: true, export_assets_enabled: true })
      ).map((t) => t.key)
    ).toEqual(["assets"]);
    expect(enabledExportTypes(toExportFlags({ export_assets_enabled: true }))).toEqual([]);
  });
});

describe("isExportTypeKey", () => {
  it("validates known keys", () => {
    expect(isExportTypeKey("assets")).toBe(true);
    expect(isExportTypeKey("bogus")).toBe(false);
  });
});

describe("parseExportSettingsForm", () => {
  it("treats present checkboxes as true and absent as false", () => {
    const fd = new Map<string, string>([
      ["customer_exports_enabled", "on"],
      ["export_assets_enabled", "on"],
    ]);
    expect(parseExportSettingsForm({ get: (k: string) => fd.get(k) ?? null })).toEqual({
      customer_exports_enabled: true,
      export_assets_enabled: true,
      export_qr_mapping_enabled: false,
      export_documents_enabled: false,
      export_submissions_enabled: false,
    });
  });
});
