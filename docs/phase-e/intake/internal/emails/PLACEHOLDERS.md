# Email template placeholders

Fill these before sending. The templates use no others (a test checks), and nothing in the customer packet uses them.

| Placeholder | Meaning |
|---|---|
| `{{company_name}}` | The customer's company name (COMPANY & PEOPLE). |
| `{{contact_first_name}}` | First name of the person you're writing to. |
| `{{approver_first_name}}` | First name of the approver (COMPANY & PEOPLE). |
| `{{approver_name}}` | Approver's full name. |
| `{{approver_title}}` | Approver's job title. |
| `{{sender_name}}` | Your name. |
| `{{upload_link}}` | The customer's upload-only folder link (checklist step 2). Never a public folder. |
| `{{missing_count}}` | Number of items in the list (the check tool fills it). |
| `{{missing_items}}` | The numbered list from the check tool's missing-information email. |
| `{{preview_link}}` | The preview link for this content version. |
| `{{content_version}}` | The content version being reviewed or approved. |
| `{{asset_count}}` | Number of assets in the preview. |
| `{{partial_launch_note}}` | Only for a partial launch: which assets are in and which are left out. Otherwise delete the line. |
| `{{approved_at}}` | Date and time of the approval (from the approval record). |
| `{{included_count}}` | Number of assets the approval includes. |
| `{{included_codes_summary}}` | The included asset codes, or a short summary with the full list attached. |
| `{{excluded_summary}}` | The asset codes left out, or 'none'. |
| `{{tag_timeline}}` | When tags are expected (from the tag-production handoff). |
| `{{live_count}}` | Number of assets now live. |
| `{{tag_status}}` | Where the tags are: in production, shipped, delivered. |
| `{{notification_email}}` | Where renter reports go (COMPANY & PEOPLE). |
| `{{included_codes}}` | Approval form: the included asset codes. |
| `{{excluded_codes}}` | Approval form: the asset codes left out, or 'none'. |
| `{{approver_role}}` | Approval form: the approver's job title. |
