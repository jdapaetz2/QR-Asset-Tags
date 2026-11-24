/**
 * Engineering Phase E3 — the words of every kit document, as structured blocks rendered to PDF (render-html.mjs via
 * Chromium) and Word (render-docx.mjs). One source, so the PDF and the DOCX carry the same text.
 *
 * Picture-first (operator feedback, E2A): the guide leads with drawings and keeps the words short. Commercial and legal
 * wording carries a visible DRAFT mark until reviewed; set REVIEWED.* to true after that review and rebuild.
 * Spelling follows the app (US: "color", "license").
 */
import { KIT, LISTS } from "./kit-config.mjs";

/** Flip after the operator-owned reviews, then rebuild: the DRAFT marks disappear from the affected wording. */
export const REVIEWED = { commercial: false, legal: false };

export const DRAFT_COMMERCIAL = "DRAFT: commercial review pending";
export const DRAFT_LEGAL = "DRAFT: legal review pending";

const draft = (kind) => (REVIEWED[kind] ? [] : [{ t: "draft", text: kind === "legal" ? DRAFT_LEGAL : DRAFT_COMMERCIAL }]);

// ------------------------------------------------------------------------------------------------ the guide

export const GUIDE = {
  id: "guide",
  file: "mulemark-onboarding-guide",
  title: "Getting your equipment on Mulemark",
  footer: `Mulemark onboarding guide · kit ${KIT.workbookVersion}`,
  blocks: [
    { t: "cover", title: "Getting your equipment on Mulemark", subtitle: "What to send, and what happens next" },
    { t: "h2", text: "How it works" },
    {
      t: "steps",
      items: [
        { art: "step-send", n: 1, title: "You send", text: "The workbook, your photos and your manuals.", who: "You" },
        { art: "step-prepare", n: 2, title: "We prepare", text: "Your pages, from your facts and the maker's manuals.", who: "Mulemark" },
        { art: "step-preview", n: 3, title: "You preview", text: "Check each page on your phone.", who: "You" },
        { art: "step-approve", n: 4, title: "You approve", text: "Your approval covers the exact version you saw.", who: "You" },
        { art: "step-tags", n: 5, title: "Tags, then live", text: "Tags are made for approved equipment.", who: "Mulemark" },
      ],
    },
    ...draft("commercial"),
    { t: "p", text: `**Timing.** Our working target is a preview about ${KIT.reviewReadyBusinessDays} business days after we have everything for a batch. It's a target, not a promise. Metal tags can take longer to make.` },

    { t: "pagebreak" },
    { t: "h1", text: "Fill in the workbook" },
    { t: "figure", art: "tabs-map", width: 420 },
    {
      t: "table",
      widths: [32, 68],
      rows: [
        ["1  COMPANY & PEOPLE", "Support contacts, who approves, email alerts, your team."],
        ["2  MODELS", "One row per model. Identical machines share one row."],
        ["3  ASSETS", "One row per machine, with its model name from MODELS."],
        ["4  FILES & NOTES", "Only unusual files, and anything missing or unclear."],
      ],
    },
    { t: "legend" },
    { t: "p", text: "**Don't know?** Leave it blank, or say why: **Not available** (it doesn't exist), **Not sure** (you'll check) or **Please review** (we take a short look). Never guess. We'll ask once, in one list." },
    { t: "p", text: "**Already have a fleet list?** Send it as it is, straight from your rental software, and skip MODELS and ASSETS. Opening and saving it in Excel first can drop the zeros from codes like 00412. We fill those tabs from your list and send the workbook back for you to check." },
    { t: "p", text: "**See the example.** The EXAMPLE workbook is filled in for a fictional company." },

    { t: "pagebreak" },
    { t: "h1", text: "Photos and files" },
    { t: "figure", art: "folders", width: 400 },
    {
      t: "folder",
      lines: [
        ["Photos/", ""],
        ["  00412/", "one folder per asset code; any file names"],
        ["Model documents/", ""],
        ["  Big Tex 14LP dump/", "manuals, your instructions, one photo for identical machines"],
        ["Company/", "your logo"],
      ],
    },
    {
      t: "frames",
      columns: 3,
      items: [
        { art: "photo-whole", caption: "Whole machine" },
        { art: "photo-plate", caption: "Model plate, if the manual needs the serial" },
        { art: "photo-detail", caption: "Hitch or controls" },
        { art: "photo-face", caption: "No people" },
        { art: "photo-paper", caption: "No paperwork or ID" },
      ],
    },
    {
      t: "bullets",
      items: [
        "Phone photos are fine: JPG, PNG or HEIC. One clear photo per asset, or one per model for identical machines.",
        "Shoot from the side: it keeps people and license plates out.",
        "Professional photography isn't included.",
        "Upload your folders as they are, with the link in our welcome email. Please don't email large attachments or share a public folder.",
      ],
    },

    { t: "pagebreak" },
    { t: "h1", text: "Before you send" },
    { t: "h2", text: "Please don't send" },
    {
      t: "frames",
      columns: 5,
      small: true,
      items: [
        { art: "no-password", caption: "Passwords or sign-ins" },
        { art: "no-card", caption: "Card or bank details" },
        { art: "no-id", caption: "ID documents" },
        { art: "no-renter", caption: "Renter details" },
        { art: "no-contract", caption: "Rental contracts" },
      ],
    },
    { t: "h2", text: "Who sees what" },
    { t: "p", text: "Your photos, logo and instructions appear on your own pages. Manuals follow your answer on MODELS. Something from the maker, or for staff only? List it on FILES & NOTES. We never share your files with other companies." },
    { t: "h2", text: "Review and approval" },
    {
      t: "bullets",
      items: [
        "We send one list of anything missing.",
        "Then a preview of every page.",
        "You approve the exact version. Approval isn't a signature or a contract.",
        "Some machines not ready? We can launch the complete ones first, only if you say so, and we list the ones left out.",
      ],
    },
    { t: "h2", text: "Who does what" },
    ...draft("commercial"),
    {
      t: "table",
      head: ["You", "Mulemark"],
      widths: [50, 50],
      rows: [
        ["Equipment facts and files", "Set-up, import and checks"],
        ["Permission to use your files", "Pages from approved templates and the maker's manuals"],
        ["Quick answers to our one list", "One list of anything missing"],
        ["Approval before go-live", "Tags for approved equipment"],
      ],
    },
    { t: "p", text: `Research is limited to about ${KIT.researchMinutesPerModel} minutes per model, with no purchases. Custom drawings are quoted separately.` },
    { t: "p", text: `**Questions?** ${KIT.contactEmail}` },
  ],
};

// ------------------------------------------------------------------------------------------------ scope sheet

export const SCOPE = {
  id: "scope",
  file: "mulemark-scope-and-assumptions",
  title: "Scope and assumptions",
  footer: `Mulemark scope and assumptions · kit ${KIT.workbookVersion}`,
  blocks: [
    { t: "cover", title: "Scope and assumptions", subtitle: "Setting up your equipment on Mulemark" },
    ...(REVIEWED.commercial && REVIEWED.legal ? [] : [{ t: "callout", text: "DRAFT for commercial and legal review. This sheet is not a contract and does not change one." }]),
    { t: "h2", text: "What's included" },
    {
      t: "bullets",
      items: [
        "Setting up your company, your team and your email alerts in Mulemark.",
        "Importing your equipment as private drafts.",
        "An equipment page for each asset, built from your facts, your rules and the maker's manuals, using approved reusable templates where they exist.",
        "One consolidated list of anything missing.",
        "A preview of every page for your approval.",
        "Tag production for the equipment you approve.",
      ],
    },
    { t: "h2", text: "What you provide" },
    {
      t: "bullets",
      items: [
        "Equipment facts: codes, names, makes and models, plus serial numbers or years where a manual depends on them.",
        "Files: photos, manuals or links to them, and any instructions you already hand out.",
        "How each file may be used on your pages.",
        "Prompt answers to the one list, and an approval before anything goes live.",
      ],
    },
    { t: "h2", text: "Limits" },
    {
      t: "bullets",
      items: [
        `Research: up to about ${KIT.researchMinutesPerModel} minutes per model, using the maker's official sources, with no purchases and no sign-ins. Anything unresolved comes back to you in the one list.`,
        "We don't write safety instructions of our own. Page guidance cites the maker's manual or your rules, and you approve it.",
        "Custom drawings and research beyond the limit are quoted separately.",
        "Professional photography isn't included.",
        "Your files are used for your pages only. We never share them with other companies.",
        "Reusable templates come from makers' manuals. They never include your files, photos or rules.",
      ],
    },
    { t: "h2", text: "Timing" },
    {
      t: "bullets",
      items: [
        "A batch is the equipment you send us together. We name it once everything for it has arrived.",
        `Our working target is a preview ready for your review about ${KIT.reviewReadyBusinessDays} business days after we have a complete, named batch. It's a target, not a promise.`,
        "Time spent waiting for answers, tag manufacturing and our own hands-on time are tracked separately, to plan our work. What you pay is set by your agreement.",
        "Metal tags may take longer than the pages.",
      ],
    },
    { t: "h2", text: "Launching in parts" },
    { t: "p", text: "If some equipment isn't ready, we can launch the complete rows first, but only with your explicit approval. That approval lists what's included and what's left out." },
    { t: "h2", text: "Approval" },
    { t: "p", text: "You approve a specific content version for the listed equipment. The approval records who checked what and when. It isn't an electronic signature, a contract or a waiver, and it doesn't change either company's responsibilities." },
    { t: "h2", text: "Your data" },
    {
      t: "bullets",
      items: [
        "Please don't send passwords, card numbers, ID documents or renter details.",
        "Your workbook and files are kept in private storage, never in shared or public folders.",
        "Serial numbers and years help us match the right manual. They aren't shown on your public pages.",
        "Columns we don't use from your fleet list, such as rates, are left out and never published.",
        "Daily summaries and charts currently use Pacific Time.",
      ],
    },
    { t: "h2", text: "Commercial terms" },
    { t: "p", text: "Pricing, plan and tag details are set out in your agreement, not here. Scans are unlimited." },
  ],
};

// ------------------------------------------------------------------------------------------------ emails

/** Every placeholder the email templates may use. The tests check the templates use no others. */
export const PLACEHOLDERS = [
  ["company_name", "The customer's company name (COMPANY & PEOPLE)."],
  ["contact_first_name", "First name of the person you're writing to."],
  ["approver_first_name", "First name of the approver (COMPANY & PEOPLE)."],
  ["approver_name", "Approver's full name."],
  ["approver_title", "Approver's job title."],
  ["sender_name", "Your name."],
  ["upload_link", "The customer's upload-only folder link (checklist step 2). Never a public folder."],
  ["missing_count", "Number of items in the list (the check tool fills it)."],
  ["missing_items", "The numbered list from the check tool's missing-information email."],
  ["preview_link", "The preview link for this content version."],
  ["content_version", "The content version being reviewed or approved."],
  ["asset_count", "Number of assets in the preview."],
  ["partial_launch_note", "Only for a partial launch: which assets are in and which are left out. Otherwise delete the line."],
  ["approved_at", "Date and time of the approval (from the approval record)."],
  ["included_count", "Number of assets the approval includes."],
  ["included_codes_summary", "The included asset codes, or a short summary with the full list attached."],
  ["excluded_summary", "The asset codes left out, or 'none'."],
  ["tag_timeline", "When tags are expected (from the tag-production handoff)."],
  ["live_count", "Number of assets now live."],
  ["tag_status", "Where the tags are: in production, shipped, delivered."],
  ["notification_email", "Where renter reports go (COMPANY & PEOPLE)."],
  ["included_codes", "Approval form: the included asset codes."],
  ["excluded_codes", "Approval form: the asset codes left out, or 'none'."],
  ["approver_role", "Approval form: the approver's job title."],
];

export const EMAILS = [
  {
    file: "01-welcome",
    title: "Welcome email",
    when: "Right after the customer agrees to a pilot (checklist step 3).",
    subject: "Getting {{company_name}} set up on Mulemark",
    body: [
      "Hi {{contact_first_name}},",
      "Thanks for choosing Mulemark. Here's how to get your equipment set up.",
      {
        list: [
          "Read the attached guide, then open the intake workbook at its START HERE tab. The EXAMPLE workbook shows a finished one.",
          "Fill in what you can. Blank is fine; the guide explains Not available, Not sure and Please review. Please don't guess.",
          "Upload the workbook and your folders of photos and manuals, as they are, here: {{upload_link}}",
        ],
        numbered: true,
      },
      "Already have a fleet list from your rental software? Upload it as it is, without opening and saving it in Excel first, and skip the MODELS and ASSETS tabs. We'll fill them from your list and send the workbook back for you to check.",
      "To see what a finished equipment page looks like, visit getmulemark.com/demo on your phone.",
      "Please don't send passwords, card numbers, ID documents or renter details.",
      `Once we have everything for a batch, our working target is a preview about ${KIT.reviewReadyBusinessDays} business days later. If anything is missing, we'll send one list.`,
      `Questions? Just reply, or write to ${KIT.contactEmail}.`,
      "{{sender_name}}\nMulemark",
    ],
  },
  {
    file: "02-missing-information",
    title: "Consolidated missing-information email",
    when: "Once per batch, after the check (checklist step 6). The check tool fills the list.",
    subject: "{{company_name}}: {{missing_count}} items to finish your setup",
    body: [
      "Hi {{contact_first_name}},",
      "Thanks for sending your equipment details. To finish your preview, we need the items below. This is the complete list for this batch; we won't send another unless something changes.",
      "{{missing_items}}",
      "Reply with your answers, or update the workbook and upload it again: {{upload_link}}. Not available is a fine answer.",
      "If you'd like, we can launch the complete machines first and add the rest later. Just say so, and we'll confirm which ones are in and which are left out.",
      "{{sender_name}}\nMulemark",
    ],
  },
  {
    file: "03-review-request",
    title: "Review request",
    when: "When the preview is ready (checklist step 9).",
    subject: "Your Mulemark pages are ready to review",
    body: [
      "Hi {{approver_first_name}},",
      "The preview for {{company_name}} is ready: {{preview_link}}",
      "Content version {{content_version}}, {{asset_count}} assets.",
      {
        list: [
          "Names, photos and models",
          "Your support phone and email",
          "The manual buttons",
          "Your rules on each page",
        ],
        lead: "Please check on your phone:",
      },
      "To approve, use the Approve button in the preview. Your approval covers exactly this version for the listed assets. It isn't a signature or a contract.",
      "{{partial_launch_note}}",
      "Want changes? Reply with them and we'll send a new version to approve.",
      "{{sender_name}}\nMulemark",
    ],
  },
  {
    file: "04-approval-acknowledgement",
    title: "Approval acknowledgement",
    when: "Right after the approval is recorded (checklist step 10).",
    subject: "Approved: {{company_name}} content version {{content_version}}",
    body: [
      "Hi {{approver_first_name}},",
      "We've recorded your approval:",
      {
        list: [
          "Content version: {{content_version}}",
          "Approved by {{approver_name}}, {{approver_title}}, on {{approved_at}}",
          "Included: {{included_count}} assets ({{included_codes_summary}})",
          "Not included: {{excluded_summary}}",
        ],
      },
      "Next, we publish the approved pages and order tags for the included assets. Tags: {{tag_timeline}}.",
      "This approval records who checked which content. It doesn't change your agreement with us, and your company stays responsible for its equipment and rental terms.",
      "{{sender_name}}\nMulemark",
    ],
  },
  {
    file: "05-go-live",
    title: "Go-live email",
    when: "When the pages are live (checklist step 13).",
    subject: "{{company_name}} is live on Mulemark",
    body: [
      "Hi {{contact_first_name}},",
      "Your equipment pages are live. Scanning a tag opens the page for that machine.",
      {
        list: [
          "Live now: {{live_count}} assets",
          "Tags: {{tag_status}}",
          "Your team: each person gets their own sign-in link from us, sent separately. Links are personal; please don't forward them.",
          "Renter reports go to {{notification_email}}.",
        ],
      },
      `If anything looks wrong, reply here or write to ${KIT.contactEmail}.`,
      "{{sender_name}}\nMulemark",
    ],
  },
];

// ------------------------------------------------------------------------------------------------ approval form

export const APPROVAL_FORM = {
  id: "approval",
  file: "content-approval-form-DRAFT",
  title: "Content review and approval: wording",
  footer: `Content approval wording · ${DRAFT_LEGAL}`,
  blocks: [
    { t: "cover", title: "Content review and approval", subtitle: "Wording for the approval step in the preview" },
    { t: "callout", text: "DRAFT for legal review. Not final. Not an electronic signature, a contract or an amendment to one. Do not send to a customer until reviewed." },
    { t: "h2", text: "What the approver sees" },
    {
      t: "quote",
      lines: [
        "**Content approval: {{company_name}}, content version {{content_version}}**",
        "Included assets: {{included_codes}}. Not included: {{excluded_codes}}.",
        "I confirm, as {{approver_role}}, that I have reviewed the content in this preview. To the best of my knowledge, the equipment facts and files our company supplied are accurate. The content may be published on the public equipment pages for the included assets, and tags may be produced for them.",
        "Mulemark does not author operating or safety instructions. Guidance shown here cites its sources, and our company remains responsible for its equipment, rental terms and safety obligations.",
        "This approval records a division of responsibility for this content version. It does not waive Mulemark's responsibility for defects in its service, or our company's remedies. It is not a rental agreement, a contract amendment or an electronic signature. Commercial and legal terms are agreed separately.",
        "[ Approve this version ]   [ Request changes ]",
      ],
    },
    { t: "h2", text: "What the record stores" },
    { t: "bullets", items: ["The approver's account and role", "Date and time", "The content version and its hash", "Included and excluded asset codes", "The preview reference"] },
    { t: "h2", text: "Rules" },
    {
      t: "bullets",
      items: [
        "Silence, a timeout or a closed preview is never approval.",
        "Any change to the content makes a new version, which needs a new approval.",
        "A partial launch lists both the included and the excluded asset codes.",
        "There is no signature line: approval happens in the app, with the approver's own sign-in.",
      ],
    },
    { t: "h2", text: "Before use" },
    { t: "p", text: "Legal review of this wording is a separate step owned by the operator. Record the reviewer and the date in the work log, then set the kit's legal review flag and rebuild." },
  ],
};

// ------------------------------------------------------------------------------------------------ procedure and tracker

/** The internal checklist (procedure doc and tracker CHECKLIST tab). gate = must be done before the next stage. */
export const CHECKLIST = [
  { stage: "Agree", step: "Customer agrees to a pilot. The agreement itself is handled outside this kit.", who: "Customer and Mulemark", gate: true },
  { stage: "Set up", step: "Create the organization in the owner UI. Plan fields are owner-only.", who: "Mulemark", gate: false },
  { stage: "Set up", step: "Create an upload-only folder for this customer on the approved channel. It must accept whole folders. Never a public folder or email attachments. Paste its link into the welcome email.", who: "Mulemark", gate: true },
  { stage: "Invite", step: "Send the welcome email with the guide, the blank workbook and the example.", who: "Mulemark", gate: false },
  { stage: "Receive", step: "Move the customer's workbook and files into private storage (Mulemark-Customer-Intake/<company>/<batch>), never into Git. Note the batch as complete when everything has arrived.", who: "Mulemark", gate: true },
  { stage: "Check", step: "Run phase-e:intake:check on the workbook (or phase-e:intake:prefill first for a raw fleet list).", who: "Mulemark", gate: false },
  { stage: "Check", step: "Send the one missing-information email the check tool drafted. Log each item on EXCEPTIONS.", who: "Mulemark", gate: true },
  { stage: "Prepare", step: `Prepare pages per model from approved templates, the maker's manuals and the customer's rules. Research up to about ${KIT.researchMinutesPerModel} minutes per model, no purchases, no invented links.`, who: "Mulemark", gate: false },
  { stage: "Prepare", step: "Import the assets as private drafts (publish and QR flags off). Today: the current CSV import; later: the E4B owner import.", who: "Mulemark", gate: false },
  { stage: "Review", step: "Send the review request with the preview link and content version.", who: "Mulemark", gate: false },
  { stage: "Approve", step: "Record the approval: approver, time, content version, included and excluded codes. Silence is never approval. Send the acknowledgement.", who: "Customer", gate: true },
  { stage: "Tags", step: "Fill the tag-production handoff from the owner production CSV, for the included assets only.", who: "Mulemark", gate: false },
  { stage: "Go live", step: "Publish the approved pages. Invite the team; send each person their own sign-in link separately. Send the go-live email.", who: "Mulemark", gate: true },
  { stage: "Close", step: "Record the batch measurements on TOUCH TIME: elapsed days, customer wait, tag manufacturing and hands-on minutes.", who: "Mulemark", gate: false },
];

/** Responsibility matrix (procedure doc and tracker RESPONSIBILITIES tab). D = does it, A = approves, I = kept informed. */
export const RESPONSIBILITIES = {
  columns: ["Customer", "Mulemark", "Tag maker"],
  rows: [
    ["Equipment facts, files and photos", "D", "I", ""],
    ["Permission to use each file", "D", "I", ""],
    ["Answers to the one consolidated list", "D", "I", ""],
    ["Mapping and import as private drafts", "I", "D", ""],
    ["Page content from approved templates and the maker's manuals", "A", "D", ""],
    ["Bounded research (about 45 minutes per model)", "I", "D", ""],
    ["Content approval before go-live", "A", "I", ""],
    ["Publication of approved pages", "I", "D", ""],
    ["Tag production", "I", "A", "D"],
    ["Rental terms and safety obligations", "D", "", ""],
  ],
};

export const EXCEPTION_COLUMNS = ["ID", "Logged", "Batch", "Where (tab and row)", "Asset or model", "Field", "What's wrong", "Effect", "Who acts", "Action", "Resolved on", "Resolution"];
export const EXCEPTION_EFFECTS = ["CUSTOMER_INPUT_REQUIRED", "MULEMARK_REVIEW", "Warning"];
export const TOUCH_ACTIVITIES = ["Setup", "Preflight", "Mapping", "Research", "Authoring", "QA", "Customer contact", "Tag handoff", "Other"];

export const CSV_NOTE = [
  "Mulemark intake: CSV templates",
  "",
  "Only if you prefer CSV to the workbook. Each file matches one workbook tab:",
  "company.csv (Field, Answer), people.csv, models.csv, assets.csv, files.csv, notes.csv.",
  "",
  "- Keep the header row as it is. Leave a cell blank when you don't know.",
  `- Unknown answers: ${LISTS.unknown.join(", ")}.`,
  "- Save as CSV UTF-8.",
  "- Opening a CSV in Excel can drop leading zeros from codes like 00412.",
  "  If your codes have leading zeros, use the workbook, or send your rental software's export as it is.",
  "",
  `Questions: ${KIT.contactEmail}`,
  "",
].join("\r\n");
