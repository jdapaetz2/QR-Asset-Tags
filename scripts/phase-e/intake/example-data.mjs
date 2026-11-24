/**
 * Engineering Phase E3 — the completed synthetic example: Northridge Rentals, the fictional showcase company.
 *
 * Fictional throughout: people and addresses use example.com and 555-01xx numbers, serials carry the DEMO- prefix
 * (contract hard rule 4), and the models are the four real showcase models with the official manual links from
 * docs/phase-e/packs/SOURCES_REGISTER.json. It is built to show the workbook's ideas, not to be perfect: 40 identical
 * trailers share one MODELS row, a code has leading zeros, a name carries quotes and a comma, an E20 is missing the
 * serial its manual depends on, a compactor's model is "Not sure", the Cat manual is "Please review", and FILES & NOTES
 * holds only two exceptions (a staff-only checklist and a maker's card meant for renters).
 */

export const EXAMPLE = {
  company: {
    "company.name": "Northridge Rentals",
    "company.support_phone": "604-555-0142",
    "company.support_email": "rentals@example.com",
    "company.support_hours": "Mon–Fri 7 am–5 pm, Sat 8 am–noon",
    "company.website": "https://www.example.com",
    "company.brand_color": "#1F5C3A",
    "company.logo_file": "northridge logo.png",
    "approver.name": "Dana Whitlock",
    "approver.title": "Operations manager",
    "approver.email": "dana.whitlock@example.com",
    "alerts.notification_email": "rentals@example.com",
    "alerts.damage": "Yes",
    "alerts.support": "Yes",
    "alerts.urgent_email": "yard.lead@example.com",
    "alerts.return_mode": "Daily exceptions summary",
    "alerts.tag_updates": "Yes",
    "alerts.photo_previews": "Yes",
    "tags.ship_to": "100 Example Street, Example City, BC",
    "tags.contact": "Sam Ortega, 604-555-0177",
    "tags.mounting": "Rivet",
    "tags.size": "2in square",
    "tags.material": "Anodized aluminum",
    "rules.fuel": "Return with a full tank, or we refuel at the posted rate.",
    "rules.cleaning": "Return clean. Hose off mud before you bring it back.",
    "rules.accessories": "Everything we send out comes back: straps, pins, remotes and keys.",
    "rules.damage_late": "Report damage right away with the Report button on the tag page.",
    "rules.other": "Call us before moving a machine to a different job site.",
  },
  people: [
    { "people.name": "Dana Whitlock", "people.email": "dana.whitlock@example.com", "people.role": "Administrator", "people.notes": "Approves our pages" },
    { "people.name": "Sam Ortega", "people.email": "sam.ortega@example.com", "people.role": "Staff", "people.notes": "Yard lead" },
    { "people.name": "Priya Nand", "people.email": "priya.nand@example.com", "people.role": "Staff", "people.notes": "Counter" },
    { "people.name": "J. O'Neil-Baptiste", "people.email": "jo@example.com", "people.role": "Staff", "people.notes": "Weekend counter" },
  ],
  models: [
    {
      "model.name": "Big Tex 35SA utility 12 ft",
      "model.make": "Big Tex",
      "model.model": "35SA",
      "model.manual": "https://www.bigtextrailers.com/wp-content/uploads/2023/11/Big-Tex-Trailers_Owners-Manual_2020.pdf",
      "model.manual_share": "Link to the maker's copy",
      "model.version": "12 ft deck",
      "model.category": "Utility trailer",
      "model.manual_depends": "No",
      "model.instructions": "Big Tex 35SA quick start.pdf",
      "model.photo": "35SA side.jpg",
      "model.photo_permission": "We took it",
      "model.fuel": "None",
      "model.accessories": "2 ratchet straps, safety chains, spare tire",
      "model.return_rules": "Return swept out, with the straps rolled up.",
      "model.questions": "How do I lower the ramp gate? Which ball size do I need?",
    },
    {
      "model.name": "Big Tex 14LP dump 14 ft",
      "model.make": "Big Tex",
      "model.model": "14LP",
      "model.manual": "https://www.bigtextrailers.com/wp-content/uploads/2023/11/Big-Tex-Trailers_Owners-Manual_2020-Dump-Trailers-2.pdf",
      "model.manual_share": "Link to the maker's copy",
      "model.version": "14 ft, low profile",
      "model.category": "Dump trailer",
      "model.manual_depends": "No",
      "model.photo": "Use asset photos",
      "model.fuel": "Battery",
      "model.accessories": "Hoist remote, tarp",
      "model.return_rules": "Return with the bed empty and lowered.",
      "model.questions": "Why won't the bed go up?",
    },
    {
      "model.name": "Bobcat E20",
      "model.make": "Bobcat",
      "model.model": "E20",
      "model.manual": "https://shop.bobcat.com/ca/e20-excavator-operation-and-maintenance-digital-manual-7255004enuspdf",
      "model.manual_share": "Link to the maker's copy",
      "model.version": "Canopy",
      "model.category": "Compact excavator",
      "model.manual_depends": "Yes",
      "model.instructions": "Bobcat E20 handover sheet.pdf",
      "model.photo": "Use asset photos",
      "model.fuel": "Diesel",
      "model.accessories": "Keys, bucket pin",
      "model.return_rules": "Return with a full tank and the bucket scraped clean.",
      "model.questions": "How do I switch the control pattern?",
    },
    {
      "model.name": "Cat 301.5",
      "model.make": "Caterpillar",
      "model.model": "301.5",
      "model.manual": "Please review",
      "model.manual_share": "Not sure",
      "model.version": "Canopy",
      "model.category": "Mini excavator",
      "model.manual_depends": "Not sure",
      "model.photo": "Please review",
      "model.fuel": "Diesel",
      "model.accessories": "Keys",
      "model.return_rules": "Return with a full tank.",
      "model.notes": "New to our fleet this spring.",
    },
  ],
  // The varied machines lead, so the first screen of ASSETS shows every model and every kind of answer; the 40
  // identical trailers follow. Category is left blank wherever it's the same as the model's (the hint says so).
  assets: [
    {
      "asset.code": "E20-01",
      "asset.name": "Compact excavator E20",
      "asset.model": "Bobcat E20",
      "asset.photo": "In Photos folder",
      "asset.tag": "New tag",
      "asset.year": "2022",
      "asset.serial": "DEMO-B3BL11001",
    },
    {
      "asset.code": "E20-02",
      "asset.name": "Compact excavator E20",
      "asset.model": "Bobcat E20",
      "asset.photo": "In Photos folder",
      "asset.tag": "New tag",
      "asset.year": "2023",
      "asset.serial": "DEMO-B3BL11002",
      "asset.fitted": "Hydraulic thumb",
    },
    {
      "asset.code": "E20-03",
      "asset.name": "Compact excavator E20",
      "asset.model": "Bobcat E20",
      "asset.photo": "In Photos folder",
      "asset.tag": "New tag",
    },
    {
      "asset.code": "C301-1",
      "asset.name": "Mini excavator 301.5",
      "asset.model": "Cat 301.5",
      "asset.photo": "In Photos folder",
      "asset.tag": "New tag",
      "asset.year": "2021",
      "asset.serial": "DEMO-FH500101",
    },
    {
      "asset.code": "C301-2",
      "asset.name": "Mini excavator 301.5",
      "asset.model": "Cat 301.5",
      "asset.photo": "In Photos folder",
      "asset.tag": "New tag",
      "asset.year": "2021",
      "asset.serial": "DEMO-FH500102",
    },
    {
      "asset.code": "DT-14",
      "asset.name": `Dump trailer 7' x 14' "HD", 14LP`,
      "asset.model": "Big Tex 14LP dump 14 ft",
      "asset.photo": "In Photos folder",
      "asset.tag": "New tag",
      "asset.unit_support": "604-555-0199 ext 2",
    },
    {
      "asset.code": "PC-07",
      "asset.name": "Plate compactor",
      "asset.model": "Not sure",
      "asset.photo": "No photo yet",
      "asset.tag": "No tag for now",
      "asset.category": "Plate compactor",
      "asset.notes": "Bought used; the model plate is worn off.",
    },
    ...Array.from({ length: 40 }, (_, i) => {
      const code = String(101 + i).padStart(5, "0");
      const row = {
        "asset.code": code,
        "asset.name": "Utility trailer 12 ft",
        "asset.model": "Big Tex 35SA utility 12 ft",
        "asset.photo": i < 5 ? "In Photos folder" : "Use model photo",
        "asset.tag": "New tag",
      };
      if (code === "00107") row["asset.fitted"] = "Spare tire";
      if (code === "00112") row["asset.differences"] = "Ramp gate replaced with a 4 ft gate.";
      return row;
    }),
  ],
  // Only exceptions: everything in the standard folders follows the folder defaults (the guide and START HERE say so).
  files: [
    { "file.name": "35SA yard checklist.pdf", "file.kind": "Your instructions", "file.for": "Big Tex 35SA utility 12 ft", "file.source": "We made it or took it", "file.audience": "Staff only", "file.notes": "For our yard team, not renters" },
    { "file.name": "E20 quick reference card.pdf", "file.kind": "Manual", "file.for": "Bobcat E20", "file.source": "From the maker", "file.audience": "Renters, on our pages", "file.notes": "The dealer gave us this card" },
  ],
  notes: [
    { "note.about": "PC-07", "note.text": "Bought used; the model plate is worn off. We'll send photos when it's back from service." },
    { "note.about": "Company", "note.text": "Please use our green, not the black from the logo." },
  ],
};

/** The upload that goes with the example: folder paths and sizes only (no real files). */
export const EXAMPLE_UPLOAD = [
  { path: "Company/northridge logo.png", bytes: 48213 },
  ...["00101", "00102", "00103", "00104", "00105"].map((code, i) => ({ path: `Photos/${code}/IMG_44${10 + i}.HEIC`, bytes: 2_310_000 + i * 1000 })),
  { path: "Photos/00103/Photo café.jpg", bytes: 1_204_331 },
  { path: "Photos/E20-01/IMG_5001.HEIC", bytes: 2_402_118 },
  { path: "Photos/E20-02/IMG_5002.HEIC", bytes: 2_388_905 },
  { path: "Photos/E20-03/IMG_5003.HEIC", bytes: 2_391_442 },
  { path: "Photos/C301-1/IMG_6001.jpg", bytes: 3_101_552 },
  { path: "Photos/C301-2/IMG_6002.jpg", bytes: 3_087_219 },
  { path: "Photos/DT-14/IMG 7001.jpg", bytes: 2_855_120 },
  { path: "Model documents/Big Tex 35SA utility 12 ft/35SA side.jpg", bytes: 1_844_210 },
  { path: "Model documents/Big Tex 35SA utility 12 ft/Big Tex 35SA quick start.pdf", bytes: 412_008 },
  { path: "Model documents/Big Tex 35SA utility 12 ft/35SA yard checklist.pdf", bytes: 98_115 },
  { path: "Model documents/Bobcat E20/Bobcat E20 handover sheet.pdf", bytes: 233_410 },
  { path: "Model documents/Bobcat E20/E20 quick reference card.pdf", bytes: 1_120_774 },
];

/** Models that already have an approved reusable pack (docs/phase-e/packs); their page content is not new work. */
export const EXAMPLE_PREPARED = [
  { model_name: "Big Tex 35SA utility 12 ft", model_key: "bigtex.35sa.12", pack: "docs/phase-e/packs/bigtex.35sa.12/pack.json" },
  { model_name: "Big Tex 14LP dump 14 ft", model_key: "bigtex.14lp.14", pack: "docs/phase-e/packs/bigtex.14lp.14/pack.json" },
  { model_name: "Bobcat E20", model_key: "bobcat.e20.b3bl-canopy", pack: "docs/phase-e/packs/bobcat.e20.b3bl-canopy/pack.json" },
];

export const EXAMPLE_BATCH_ID = "northridge-example-1";

export const EXAMPLE_BANNER = "EXAMPLE: a completed workbook for a fictional company (Northridge Rentals). Use the blank workbook for your own equipment.";
