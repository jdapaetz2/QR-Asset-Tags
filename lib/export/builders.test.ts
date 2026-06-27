import { describe, expect, it } from "vitest";

import {
  buildAssetsCsv,
  buildQrMappingCsv,
  buildDocumentsCsv,
} from "./builders";

describe("buildAssetsCsv", () => {
  it("emits the asset fields incl. lifecycle + rental status", () => {
    const csv = buildAssetsCsv([
      {
        asset_code: "EXC-001",
        asset_name: "Mini Excavator",
        category: "Excavators",
        make: "Acme",
        model: "X1",
        serial_number: "SN9",
        year: 2022,
        public_status: "public",
        archived_at: null,
        active_rental_session_id: "sess-1",
      },
    ]);
    const [, row] = csv.trimEnd().split("\r\n");
    expect(row).toBe("EXC-001,Mini Excavator,Excavators,Acme,X1,SN9,2022,public,active,rented");
  });
});

describe("buildQrMappingCsv", () => {
  it("computes the public URL from the base + short_code, not the stale stored URL", () => {
    const csv = buildQrMappingCsv(
      [
        {
          short_code: "demo-ex017",
          status: "active",
          asset: { asset_code: "EXC-017", asset_name: "Excavator 017" },
        },
      ],
      "https://tags.northridge.example"
    );
    expect(csv).toContain("https://tags.northridge.example/t/demo-ex017");
    expect(csv).not.toContain("app.example.com");
  });
});

describe("buildDocumentsCsv", () => {
  it("marks hosted vs external and never inlines media bytes", () => {
    const csv = buildDocumentsCsv([
      {
        title: "Manual",
        document_type: "manual",
        visibility: "public",
        link_status: "ok",
        storage_path: "org/1/manual.pdf",
        external_url: null,
        asset: { asset_code: "EXC-001" },
      },
      {
        title: "Spec",
        document_type: "spec",
        visibility: "private",
        link_status: "ok",
        storage_path: null,
        external_url: "https://docs.example/spec",
        asset: { asset_code: "EXC-002" },
      },
    ]);
    expect(csv).toContain("hosted file");
    expect(csv).toContain("external link");
    expect(csv).toContain("org/1/manual.pdf");
  });
});
