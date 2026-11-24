# Content review and approval

_Wording for the approval step in the preview_

> **DRAFT for legal review. Not final. Not an electronic signature, a contract or an amendment to one. Do not send to a customer until reviewed.**

## What the approver sees

> **Content approval: {{company_name}}, content version {{content_version}}**
>
> Included assets: {{included_codes}}. Not included: {{excluded_codes}}.
>
> I confirm, as {{approver_role}}, that I have reviewed the content in this preview. To the best of my knowledge, the equipment facts and files our company supplied are accurate. The content may be published on the public equipment pages for the included assets, and tags may be produced for them.
>
> Mulemark does not author operating or safety instructions. Guidance shown here cites its sources, and our company remains responsible for its equipment, rental terms and safety obligations.
>
> This approval records a division of responsibility for this content version. It does not waive Mulemark's responsibility for defects in its service, or our company's remedies. It is not a rental agreement, a contract amendment or an electronic signature. Commercial and legal terms are agreed separately.
>
> [ Approve this version ]   [ Request changes ]

## What the record stores

- The approver's account and role
- Date and time
- The content version and its hash
- Included and excluded asset codes
- The preview reference

## Rules

- Silence, a timeout or a closed preview is never approval.
- Any change to the content makes a new version, which needs a new approval.
- A partial launch lists both the included and the excluded asset codes.
- There is no signature line: approval happens in the app, with the approver's own sign-in.

## Before use

Legal review of this wording is a separate step owned by the operator. Record the reviewer and the date in the work log, then set the kit's legal review flag and rebuild.
