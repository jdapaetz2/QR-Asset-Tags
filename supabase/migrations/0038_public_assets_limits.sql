-- 0038_public_assets_limits.sql — Tighten the public-assets bucket to what the app stores there.
--
-- WHY: 0002 created `public-assets` at 25 MB with HEIC and PDF allowed, back when public documents were
-- expected to live there. Hosted documents moved to the private `documents` bucket (0005), so the only
-- objects this public-read bucket holds are asset cover images (≤ 5 MB) and organization logos (≤ 2 MB),
-- both JPEG/PNG/WebP (lib/assets/cover.ts, lib/org/logo.ts). Admin cover uploads now go browser → storage
-- through signed upload URLs, so the bucket limit is a real second line of defence rather than a formality.
--
-- Existing objects are unaffected by a limit change; only new uploads are checked. Policies are unchanged.
-- Compatible with both the previous and the new code (both already enforce these caps).

update storage.buckets
set file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'public-assets';
