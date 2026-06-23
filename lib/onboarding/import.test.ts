import { describe, expect, it } from "vitest";

import {
  buildImportTemplateCsv,
  IMPORT_COLUMNS,
  parseImportBool,
  parseImportRows,
} from "./import";

const HEADER = IMPORT_COLUMNS.join(",");

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
        "EX-1,Excavator,Mini Excavator,Kubota,U17,,2022,,,,mini_excavator,true,false,true"
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
    // A row with some content but missing code/name → validated (not skipped).
    const { rows } = parseImportRows(csv(",,Mini Excavator,,,,,,,,,,,"));
    expect(rows[0].errors.join(" ")).toMatch(/asset code/i);
  });

  it("flags an in-file duplicate asset_code", () => {
    const { rows } = parseImportRows(
      csv("EX-1,A,,,,,,,,,,,,", "EX-1,B,,,,,,,,,,,,")
    );
    expect(rows[1].errors.join(" ")).toMatch(/duplicate/i);
  });

  it("rejects a bad year", () => {
    const { rows } = parseImportRows(csv("EX-1,A,,,,,1700,,,,,,,"));
    expect(rows[0].errors.join(" ")).toMatch(/year/i);
  });

  it("rejects an invalid email", () => {
    const { rows } = parseImportRows(csv("EX-1,A,,,,,,,bad-email,,,,,"));
    expect(rows[0].errors.join(" ")).toMatch(/email/i);
  });

  it("rejects an unsafe cover image", () => {
    const { rows } = parseImportRows(
      csv("EX-1,A,,,,,,,,javascript:alert(1),,,,")
    );
    expect(rows[0].errors.join(" ")).toMatch(/cover|image/i);
  });

  it("rejects an invalid boolean flag", () => {
    const { rows } = parseImportRows(csv("EX-1,A,,,,,,,,,,notabool,,"));
    expect(rows[0].errors.join(" ")).toMatch(/create_qr_link/i);
  });

  it("warns on an unknown template_key but still allows import", () => {
    const { rows } = parseImportRows(
      csv("EX-1,A,,,,,,,,,forklift,false,false,false")
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings.join(" ")).toMatch(/unknown template/i);
    expect(rows[0].flags?.templateKey).toBeNull();
  });

  it("accepts an organization custom template key via extraKeys", () => {
    const { rows } = parseImportRows(
      csv("EX-1,A,,,,,,,,,electrical_meter_kit,false,false,false"),
      new Set(["electrical_meter_kit"])
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toEqual([]);
    expect(rows[0].flags?.templateKey).toBe("electrical_meter_kit");
  });

  it("ignores an organization_id column and warns", () => {
    const text = [
      "organization_id," + HEADER,
      "attacker-org,EX-1,A,,,,,,,,,,,",
    ].join("\n");
    const { rows, fileWarnings } = parseImportRows(text);
    expect(fileWarnings.join(" ")).toMatch(/organization_id column is ignored/i);
    expect(rows[0].asset).not.toHaveProperty("organization_id");
  });

  it("accepts a valid /demo-assets cover image path", () => {
    const { rows } = parseImportRows(
      csv("EX-1,A,,,,,,,,/demo-assets/excavator-017.svg,,,,")
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].asset?.cover_image_url).toBe("/demo-assets/excavator-017.svg");
  });
});

describe("buildImportTemplateCsv", () => {
  it("starts with the column header and includes example rows", () => {
    const out = buildImportTemplateCsv();
    expect(out.split("\r\n")[0]).toBe(IMPORT_COLUMNS.join(","));
    expect(out).toContain("mini_excavator");
    expect(out).toContain("electrical_test_equipment");
  });
});
