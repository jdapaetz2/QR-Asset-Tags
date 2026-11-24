# Email template placeholders

The onboard commands fill most of these from the setup workbook; fill the rest before sending. The templates use no others (a test checks), and the customer's files use none.

| Placeholder | Meaning |
|---|---|
| `{{company_name}}` | The customer's company name (filled by the tools from the CALL SHEET). |
| `{{contact_first_name}}` | First name of the person you're writing to (filled from the CALL SHEET's first Administrator, else the approver). |
| `{{call_times}}` | Two or three times that suit you for the 30-minute call, or your booking link. |
| `{{sender_name}}` | Your name (filled once you've given it with --sender). |
| `{{missing_count}}` | Number of questions (filled by onboard:check). |
| `{{missing_items}}` | The numbered questions (filled by onboard:check). |
| `{{approver_first_name}}` | The approver's first name (filled from the CALL SHEET). |
| `{{approver_title}}` | The approver's job title (filled from the CALL SHEET). |
| `{{preview_link}}` | The preview link for this version. |
| `{{content_version}}` | The content version being approved, e.g. v1 2026-12-01. |
| `{{asset_count}}` | Number of machines in this version (filled by onboard:check). |
| `{{included_codes_summary}}` | Their unit numbers, in short form (filled by onboard:check). |
| `{{excluded_note}}` | Machines not in this version, with the reason, if any (filled by onboard:check; empty when none). |
| `{{live_count}}` | Number of machines now live (filled by onboard:check; edit it for a partial launch). |
| `{{not_live_note}}` | Machines not live yet, if any (filled by onboard:check; empty when none). |
| `{{tag_status}}` | Where the tags are: in production, shipped or delivered. |
| `{{notification_email}}` | Where renter reports go (filled from the CALL SHEET). |
