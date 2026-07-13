import { describe, expect, it } from "vitest";

import {
  buildImportTemplateCsv,
  IMPORT_COLUMNS,
  parseImportBool,
  parseImportRows,
  type ImportColumn,
} from "./import";

const HEADER = IMPORT_COLUMNS.join(",");

/** Build a data row from named fields (robust against column-order/count changes). */
function row(fields: Partial<Record<ImportColumn, string>>): string {
  return IMPORT_COLUMNS.map((c) => fields[c] ?? "").join(",");
}

function csv(...dataRows: string[]): string {
  return [HEADER, ...dataRows].join("\n");
}

describe("parseImportBool", () => {
  it("accepts common truthy/falsey spellings and defaults empty to false", () => {
    expect(parseImportBool("true", "x")).toEqual({ value: true });
    expect(parseImportBool("YES", "x")).toEqual({ value: true });
    expect(parseImportBool("1", "x")).toEqual({ value: true });
    expect(parseImportBool("", "x")).toEqual({ value: false });
    expect(parseImportBool("no", "x")).toEqual({ value: false });
    expect("error" in parseImportBool("maybe", "x")).toBe(true);
  });
});

describe("parseImportRows", () => {
  it("parses a valid row with a template and flags", () => {
    const { rows } = parseImportRows(
      csv(
        row({
          asset_code: "EX-1",
          asset_name: "Excavator",
          category: "Mini Excavator",
          make: "Kubota",
          model: "U17",
          year: "2022",
          template_key: "mini_excavator",
          create_qr_link: "true",
          publish_equipment_page: "true",
        })
      )
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].asset?.asset_code).toBe("EX-1");
    expect(rows[0].flags).toMatchObject({
      templateKey: "mini_excavator",
      createQrLink: true,
      publishAsset: false,
      publishEquipmentPage: true,
    });
  });

  it("requires asset_code and asset_name (non-blank rows)", () => {
    const { rows } = parseImportRows(csv(row({ category: "Mini Excavator" })));
    expect(rows[0].errors.join(" ")).toMatch(/asset code/i);
  });

  it("flags an in-file duplicate asset_code", () => {
    const { rows } = parseImportRows(
      csv(
        row({ asset_code: "EX-1", asset_name: "A" }),
        row({ asset_code: "EX-1", asset_name: "B" })
      )
    );
    expect(rows[1].errors.join(" ")).toMatch(/duplicate/i);
  });

  it("rejects a bad year", () => {
    const { rows } = parseImportRows(
      csv(row({ asset_code: "EX-1", asset_name: "A", year: "1700" }))
    );
    expect(rows[0].errors.join(" ")).toMatch(/year/i);
  });

  it("rejects an invalid email", () => {
    const { rows } = parseImportRows(
      csv(
        row({
          asset_code: "EX-1",
          asset_name: "A",
          support_email_override: "bad-email",
        })
      )
    );
    expect(rows[0].errors.join(" ")).toMatch(/email/i);
  });

  it("rejects an unsafe cover image", () => {
    const { rows } = parseImportRows(
      csv(
        row({
          asset_code: "EX-1",
          asset_name: "A",
          cover_image_url: "javascript:alert(1)",
        })
      )
    );
    expect(rows[0].errors.join(" ")).toMatch(/cover|image/i);
  });

  it("rejects an invalid boolean flag", () => {
    const { rows } = parseImportRows(
      csv(row({ asset_code: "EX-1", asset_name: "A", create_qr_link: "notabool" }))
    );
    expect(rows[0].errors.join(" ")).toMatch(/create_qr_link/i);
  });

  it("warns on an unknown template_key but still allows import", () => {
    const { rows } = parseImportRows(
      csv(row({ asset_code: "EX-1", asset_name: "A", template_key: "forklift" }))
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings.join(" ")).toMatch(/unknown template/i);
    expect(rows[0].flags?.templateKey).toBeNull();
  });

  it("accepts an organization custom template key via extraKeys", () => {
    const { rows } = parseImportRows(
      csv(
        row({
          asset_code: "EX-1",
          asset_name: "A",
          template_key: "electrical_meter_kit",
          // An explicit return-inspection key keeps the warning list empty.
          return_inspection_template_key: "generic",
        })
      ),
      new Set(["electrical_meter_kit"])
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toEqual([]);
    expect(rows[0].flags?.templateKey).toBe("electrical_meter_kit");
  });

  it("ignores an organization_id column and warns", () => {
    const text = [
      "organization_id," + HEADER,
      "attacker-org," + row({ asset_code: "EX-1", asset_name: "A" }),
    ].join("\n");
    const { rows, fileWarnings } = parseImportRows(text);
    expect(fileWarnings.join(" ")).toMatch(/organization_id column is ignored/i);
    expect(rows[0].asset).not.toHaveProperty("organization_id");
  });

  it("accepts a valid /demo-assets cover image path", () => {
    const { rows } = parseImportRows(
      csv(
        row({
          asset_code: "EX-1",
          asset_name: "A",
          cover_image_url: "/demo-assets/excavator-017.svg",
        })
      )
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].asset?.cover_image_url).toBe("/demo-assets/excavator-017.svg");
  });

  // --- Return-inspection template assignment (Phase 1A) ---

  it("assigns an explicit valid return_inspection_template_key", () => {
    const { rows } = parseImportRows(
      csv(
        row({
          asset_code: "GEN-1",
          asset_name: "Generator",
          category: "Something odd",
          return_inspection_template_key: "portable_generator",
        })
      )
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].flags?.returnInspectionTemplateKey).toBe("portable_generator");
    expect(rows[0].flags?.returnInspectionSource).toBe("assigned");
  });

  it("suggests a return template from an exact category alias (no warning)", () => {
    const { rows } = parseImportRows(
      csv(row({ asset_code: "TR-1", asset_name: "Trailer", category: "Dump Trailer" }))
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toEqual([]);
    expect(rows[0].flags?.returnInspectionTemplateKey).toBe("utility_trailer");
    expect(rows[0].flags?.returnInspectionSource).toBe("suggested");
  });

  it("falls back to Generic with a non-blocking warning when nothing matches", () => {
    const { rows } = parseImportRows(
      csv(row({ asset_code: "X-1", asset_name: "Widget", category: "Widget" }))
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].flags?.returnInspectionTemplateKey).toBe("generic");
    expect(rows[0].flags?.returnInspectionSource).toBe("generic");
    expect(rows[0].warnings.join(" ")).toMatch(/generic/i);
  });

  it("treats an unknown explicit return key as a row error", () => {
    const { rows } = parseImportRows(
      csv(
        row({
          asset_code: "X-1",
          asset_name: "Widget",
          return_inspection_template_key: "spaceship",
        })
      )
    );
    expect(rows[0].errors.join(" ")).toMatch(/return_inspection_template_key/i);
    // An error row carries no flags (nothing is imported for it).
    expect(rows[0].flags).toBeUndefined();
  });

  // Phase 1B — organization category defaults feed the same resolver.
  it("resolves an unassigned row via the organization category default", () => {
    const { rows } = parseImportRows(
      csv(row({ asset_code: "W-1", asset_name: "Widget", category: "Widget Cart" })),
      new Set(),
      { "widget cart": "plate_compactor" }
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toEqual([]);
    expect(rows[0].flags?.returnInspectionTemplateKey).toBe("plate_compactor");
    expect(rows[0].flags?.returnInspectionSource).toBe("category_default");
  });

  it("lets an explicit CSV key win over the organization category default", () => {
    const { rows } = parseImportRows(
      csv(
        row({
          asset_code: "W-1",
          asset_name: "Widget",
          category: "Widget Cart",
          return_inspection_template_key: "utility_trailer",
        })
      ),
      new Set(),
      { "widget cart": "plate_compactor" }
    );
    expect(rows[0].flags?.returnInspectionTemplateKey).toBe("utility_trailer");
    expect(rows[0].flags?.returnInspectionSource).toBe("assigned");
  });
});

describe("buildImportTemplateCsv", () => {
  it("starts with the column header and includes example rows", () => {
    const out = buildImportTemplateCsv();
    expect(out.split("\r\n")[0]).toBe(IMPORT_COLUMNS.join(","));
    expect(out).toContain("mini_excavator");
    expect(out).toContain("electrical_test_equipment");
  });

  it("emits a value in every column for each example row", () => {
    const lines = buildImportTemplateCsv().trimEnd().split("\r\n");
    for (const line of lines) {
      expect(line.split(",")).toHaveLength(IMPORT_COLUMNS.length);
    }
  });
});
