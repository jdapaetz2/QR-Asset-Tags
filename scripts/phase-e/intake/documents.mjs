/**
 * Engineering Phase E3 — the words of every kit document (kit 2.0), as structured blocks rendered to PDF
 * (render-html.mjs via Chromium) and Word (render-docx.mjs). One source, so the PDF and the DOCX carry the same text.
 *
 * The customer gets one picture-first page (WHAT_TO_EXPECT); everything else is Mulemark's: the scope reference for
 * the commercial review and the four email templates, which the onboard commands fill. Commercial and legal wording
 * carries a visible DRAFT mark until reviewed; set REVIEWED.* to true after that review and rebuild.
 * Spelling follows the app (US: "color", "license").
 */
import { KIT } from "./kit-config.mjs";

/** Flip after the operator-owned reviews, then rebuild: the DRAFT marks disappear from the affected wording. */
export const REVIEWED = { commercial: false, legal: false };

export const DRAFT_COMMERCIAL = "DRAFT: commercial review pending";
export const DRAFT_LEGAL = "DRAFT: legal review pending";

const draft = (kind) => (REVIEWED[kind] ? [] : [{ t: "draft", text: kind === "legal" ? DRAFT_LEGAL : DRAFT_COMMERCIAL }]);

// ------------------------------------------------------------------------------------------------ what to expect

/** The one page a customer gets (kit 2.0): picture-first, about 200 words; a test caps the visible words at 220. */
export const WHAT_TO_EXPECT = {
  id: "what-to-expect",
  file: "mulemark-what-to-expect",
  title: "Getting set up on Mulemark",
  footer: `Mulemark: what to expect · kit ${KIT.workbookVersion}`,
  /** One Letter page: tighter spacing and small drawings (render-html.mjs, render-docx.mjs). */
  compact: true,
  blocks: [
    { t: "cover", title: "Getting set up on Mulemark", subtitle: "About 1–2 hours at your desk, start to finish" },
    {
      t: "steps",
      items: [
        { art: "step-call", n: 1, title: "Call", text: "30 minutes, plus your list", who: "You" },
        { art: "step-prepare", n: 2, title: "We build", text: "Your pages and tags", who: "Mulemark" },
        { art: "step-preview", n: 3, title: "You check", text: "One page per model, on a phone", who: "You" },
        { art: "step-approve", n: 4, title: "You approve", text: "Nothing goes live before that", who: "You" },
        { art: "step-tags", n: 5, title: "You're live", text: "Scan a tag, see its page", who: "Mulemark" },
      ],
    },
    { t: "h2", text: "What we need from you" },
    {
      t: "bullets",
      items: [
        "**Your equipment list**: the machines to tag, as your software exports it. Opened it? Close without saving: zeros like 00412 vanish. No software? Use our template.",
        "**A 30-minute call**: who renters contact, who gets alerts and approves, where tags ship, and your rules.",
        "**20–30 minutes** to check your pages on a phone.",
      ],
    },
    { t: "h2", text: "What we do" },
    { t: "p", text: "Set up your account, find each maker's manual, write your pages and make your tags. Anything missing, we ask once." },
    { t: "h2", text: "Optional" },
    {
      t: "icons",
      columns: 2,
      items: [
        { art: "photo-phone", caption: "**Photos:** add them from your phone, any time." },
        { art: "manual-email", caption: "**Your own manuals or instructions:** just email them." },
      ],
    },
    { t: "h2", text: "Please don't send" },
    {
      t: "frames",
      columns: 5,
      small: true,
      items: [
        { art: "no-password", caption: "Passwords" },
        { art: "no-card", caption: "Card or bank details" },
        { art: "no-id", caption: "ID documents" },
        { art: "no-renter", caption: "Renter details" },
        { art: "no-contract", caption: "Rental contracts" },
      ],
    },
    { t: "h2", text: "Good to know" },
    ...draft("commercial"),
    {
      t: "bullets",
      items: [
        `A preview about ${KIT.reviewReadyBusinessDays} business days after the call: a target, not a promise.`,
        "Serial numbers and unused columns are never shown to renters.",
        `We spend up to ${KIT.researchMinutesPerModel} minutes finding each manual. Photography isn't included.`,
        "Who puts the tags on is set in your agreement.",
      ],
    },
    { t: "p", text: `**Questions?** ${KIT.contactEmail}` },
  ],
};

// ------------------------------------------------------------------------------------------------ scope sheet

/** Internal since kit 2.0: the reference for the commercial review and the pilot agreement. Never sent as is. */
export const SCOPE = {
  id: "scope",
  file: "scope-and-assumptions",
  title: "Scope and assumptions",
  footer: `Mulemark scope and assumptions · kit ${KIT.workbookVersion}`,
  blocks: [
    { t: "cover", title: "Scope and assumptions", subtitle: "Setting up a customer's equipment on Mulemark (internal reference)" },
    ...(REVIEWED.commercial && REVIEWED.legal ? [] : [{ t: "callout", text: "DRAFT for commercial and legal review. Internal reference for the pilot agreement; not a contract, and not sent to customers as is." }]),
    { t: "h2", text: "What's included" },
    {
      t: "bullets",
      items: [
        "A 30-minute setup call, and the customer's equipment list taken exactly as their software exports it.",
        "Setting up the company, the team's first sign-in and the email alerts in Mulemark.",
        "Importing the equipment as private drafts.",
        "An equipment page for each machine, built from the customer's rules and the maker's manuals, using approved reusable templates where they exist.",
        "One consolidated list of anything still missing.",
        "A preview of every page for the customer's approval.",
        "Tags for the approved equipment.",
      ],
    },
    { t: "h2", text: "What the customer provides" },
    {
      t: "bullets",
      items: [
        "Their equipment list: unit numbers, names, makes and models, plus serial numbers or years where a manual depends on them.",
        "On the call: who renters contact, who gets alerts, who approves, where tags ship, and any rules that aren't on their website.",
        "Answers to the one list, if there is one, and an approval before anything goes live.",
        "Optional: photos (from a phone, any time) and their own manuals or instructions.",
      ],
    },
    { t: "h2", text: "Limits" },
    {
      t: "bullets",
      items: [
        `Research: up to about ${KIT.researchMinutesPerModel} minutes per model, using the maker's official sources, with no purchases and no sign-ins. Anything unresolved goes back to the customer in the one list.`,
        "Mulemark doesn't write safety instructions of its own. Page guidance cites the maker's manual or the customer's rules, and the customer approves it.",
        "Custom drawings and research beyond the limit are quoted separately.",
        "Professional photography isn't included. Photos are optional at launch.",
        "A maker's manual is linked from the maker's official copy; a copy is hosted only with the maker's permission on record.",
        "The customer's files are used for their own pages only, and never shared with other companies.",
        "Reusable templates come from makers' manuals. They never include a customer's files, photos or rules.",
      ],
    },
    { t: "h2", text: "Timing" },
    {
      t: "bullets",
      items: [
        "A batch is the equipment set up together. It's complete when the list and the call answers are in.",
        `The working target is a preview ready for review about ${KIT.reviewReadyBusinessDays} business days after a complete batch. It's a target, not a promise.`,
        "Time waiting on the customer, tag manufacturing and Mulemark's hands-on time are recorded separately, to plan the work. What the customer pays is set by their agreement.",
        "Metal tags may take longer than the pages.",
        "Who puts the tags on is set in the agreement. It's still open for this review, and the customer's time estimate (about 1–2 hours at their desk) leaves it out.",
      ],
    },
    { t: "h2", text: "Launching in parts" },
    { t: "p", text: "If some machines aren't ready, the complete ones can go live first, but only when the customer asks. The approval lists what's included and what's left out." },
    { t: "h2", text: "Approval" },
    { t: "p", text: "The customer approves a specific content version for the listed machines (until the in-app record exists, by replying \"Approved\" to the preview email, which quotes the approval wording). The approval records who checked what and when. It isn't an electronic signature, a contract or a waiver, and it doesn't change either company's responsibilities." },
    { t: "h2", text: "The customer's data" },
    {
      t: "bullets",
      items: [
        "Never asked for: passwords, card numbers, ID documents, renter details or rental contracts.",
        "Their list, call answers and files are kept in private storage, never in shared or public folders.",
        "Serial numbers and years help match the right manual. They aren't shown on public pages.",
        "Columns not used from their list, such as rates, are left out and never published.",
        "Daily summaries and charts currently use Pacific Time.",
      ],
    },
    { t: "h2", text: "Commercial terms" },
    { t: "p", text: "Pricing, plan and tag details are set out in the customer's agreement, not here. Scans are unlimited." },
  ],
};

// ------------------------------------------------------------------------------------------------ emails

/** Every placeholder the email templates may use. The tests check the templates use no others. */
export const PLACEHOLDERS = [
  ["company_name", "The customer's company name (filled by the tools from the CALL SHEET)."],
  ["contact_first_name", "First name of the person you're writing to (filled from the CALL SHEET's first Administrator, else the approver)."],
  ["call_times", "Two or three times that suit you for the 30-minute call, or your booking link."],
  ["sender_name", "Your name (filled once you've given it with --sender)."],
  ["missing_count", "Number of questions (filled by onboard:check)."],
  ["missing_items", "The numbered questions (filled by onboard:check)."],
  ["approver_first_name", "The approver's first name (filled from the CALL SHEET)."],
  ["approver_title", "The approver's job title (filled from the CALL SHEET)."],
  ["preview_link", "The preview link for this version."],
  ["content_version", "The content version being approved, e.g. v1 2026-12-01."],
  ["asset_count", "Number of machines in this version (filled by onboard:check)."],
  ["included_codes_summary", "Their unit numbers, in short form (filled by onboard:check)."],
  ["excluded_note", "Machines not in this version, with the reason, if any (filled by onboard:check; empty when none)."],
  ["live_count", "Number of machines now live (filled by onboard:check; edit it for a partial launch)."],
  ["not_live_note", "Machines not live yet, if any (filled by onboard:check; empty when none)."],
  ["tag_status", "Where the tags are: in production, shipped or delivered."],
  ["notification_email", "Where renter reports go (filled from the CALL SHEET)."],
];

/** The approval wording (DECISIONS §3, DRAFT for legal review), as the approver's "Approved" reply confirms it. */
export const APPROVAL_LINES = [
  "Content approval: {{company_name}}, content version {{content_version}}. Included: {{asset_count}} machines ({{included_codes_summary}}).{{excluded_note}}",
  "I confirm, as {{approver_title}}, that I have reviewed the content in this preview. To the best of my knowledge, the equipment facts and files our company supplied are accurate. The content may be published on the public equipment pages for the included machines, and tags may be produced for them.",
  "Mulemark does not author operating or safety instructions. Guidance shown here cites its sources, and our company remains responsible for its equipment, rental terms and safety obligations.",
  "This approval records a division of responsibility for this content version. It does not waive Mulemark's responsibility for defects in its service, or our company's remedies. It is not a rental agreement, a contract amendment or an electronic signature. Commercial and legal terms are agreed separately.",
];

export const EMAILS = [
  {
    file: "01-welcome",
    title: "Welcome email",
    when: "Right after the customer agrees to a pilot. onboard:start writes it as email-1-welcome.txt with the company name filled in. Attach the two files in to-send\\.",
    subject: "Getting {{company_name}} set up on Mulemark",
    body: [
      "Hi {{contact_first_name}},",
      "Thanks for choosing Mulemark. Setting up takes about 1–2 hours of your time at your desk, in total; the attached page shows how it goes.",
      {
        list: [
          "Pick a time for a 30-minute call: {{call_times}}",
          "Before the call, email me the list of machines you want tags on (skip sold units and small tools), exactly as your rental software exports it. CSV or Excel is fine. If you open it to look, close it without saving: saving in Excel can drop the zeros from unit numbers like 00412. No rental software? Any list works, or the attached template.",
        ],
        numbered: true,
      },
      "That's all for now. Please don't send passwords, card numbers, ID documents or renter details.",
      "To see what a finished equipment page looks like, visit getmulemark.com/demo on your phone.",
      "{{sender_name}}\nMulemark",
    ],
  },
  {
    file: "02-questions",
    title: "Questions email",
    when: "Only if something is still missing after the call. onboard:check writes it, filled in, as check\\questions-email.txt, and removes it again once nothing is left to ask.",
    subject: "{{company_name}}: {{missing_count}} quick questions to finish your pages",
    body: [
      "Hi {{contact_first_name}},",
      "Thanks for the call and your list. To finish your pages, we need the answers below. This is the complete list; we won't send another unless something changes.",
      "{{missing_items}}",
      "Just reply to this email. Don't know an answer for a machine? Say so: if you'd like, we'll launch the others first and add it later.",
      "{{sender_name}}\nMulemark",
    ],
  },
  {
    file: "03-preview-ready",
    title: "Preview email (with the approval wording)",
    when: "When the preview is ready. onboard:check writes it as email-3-preview-ready.txt with names, counts and unit numbers filled in; add the preview link and the content version. Save the customer's \"Approved\" reply in the batch folder: until E5A, it is the approval record.",
    review: "legal",
    subject: "Your Mulemark pages are ready to check",
    body: [
      "Hi {{approver_first_name}},",
      "Your pages are ready: {{preview_link}}",
      {
        lead: "Please check them on your phone. Machines of the same model share the same page content, so one page per model is enough, plus the list of names:",
        list: ["Names and models", "Your support phone and email", "The manual buttons", "Your rules"],
      },
      "If everything's right, reply \"Approved\". Want changes? Reply with them, and we'll send a new version. If someone else approves, please forward this email to them.",
      "Replying \"Approved\" confirms this:",
      ...APPROVAL_LINES,
      "{{sender_name}}\nMulemark",
    ],
  },
  {
    file: "04-live",
    title: "Go-live email",
    when: "When the pages are live. onboard:check writes it as email-4-live.txt with names and counts filled in; add the tag status.",
    subject: "{{company_name}} is live on Mulemark",
    body: [
      "Hi {{contact_first_name}},",
      "Your equipment pages are live. Scanning a tag opens the page for that machine.",
      {
        list: [
          "Live now: {{live_count}} machines",
          "Tags: {{tag_status}}",
          "Your team: each person gets their own sign-in link, sent separately. Links are personal; please don't forward them.",
          "Renter reports go to {{notification_email}}.",
          "Photos: add one any time from your phone. Sign in, open the machine under Assets, choose Upload an image under Cover image, then Save changes.",
        ],
      },
      "{{not_live_note}}",
      `If anything looks wrong, reply here or write to ${KIT.contactEmail}.`,
      "{{sender_name}}\nMulemark",
    ],
  },
];

/** The DRAFT note an email carries until its wording is reviewed (shown in the template and on top of each draft). */
export function emailReviewNote(email) {
  if (!email.review || REVIEWED[email.review]) return null;
  return `${email.review === "legal" ? DRAFT_LEGAL : DRAFT_COMMERCIAL}. Don't send the approval wording to a customer until it's reviewed.`;
}
