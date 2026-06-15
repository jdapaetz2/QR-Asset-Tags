# QR Asset Tags Project Rules

## Product

Build a web-based QR equipment info system for rental businesses.

Each rental asset gets a durable QR tag. When scanned, the QR opens a mobile-friendly equipment page with startup instructions, manuals, return info, damage report, and support contact.

This is not a native app.

## MVP priorities

1. Manual customer onboarding
2. Multi-tenant customer organizations
3. Public QR scan pages
4. Equipment info page editor
5. Damage/support/return forms
6. Photo/video upload for form submissions
7. Admin dashboard
8. QR SVG export for physical tag production
9. Basic scan/submission analytics
10. Safe public/private data separation

## Non-goals

Do not build these unless explicitly requested:

- CMMS
- Maintenance scheduling
- Work orders
- Rental booking
- Rental contracts
- E-signatures
- GPS tracking
- Native mobile app
- Offline mode
- Custom form builder
- Automated self-signup
- Stripe billing
- AI-generated safety instructions

## Branding

The product name is temporary.

Use generic, easy-to-change placeholder branding.

Use “Powered by [Product Name]” in the public page footer.

Do not hard-code final company identity.

## Tech stack

Preferred stack:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui where useful
- Supabase for Postgres, auth, storage, and RLS
- Vercel deployment

## Security

- Public QR pages must not require login.
- Public QR pages must not expose private business data.
- Public users can create form submissions but cannot read/list submissions.
- Customer admins can only access their own organization data.
- Platform owner can manage all organizations.
- Use Supabase RLS from day one.
- Store uploads in organization-specific paths.
- Do not store raw IP addresses unless necessary.

## Workflow

- Use plan mode before multi-file changes.
- Build vertical slices, not broad unfinished layers.
- Each chunk must produce something demoable.
- Run lint, typecheck, tests, and build after meaningful changes.
- Show command output after checks.
- Keep code simple, boring, and maintainable.
- Avoid premature abstractions.
