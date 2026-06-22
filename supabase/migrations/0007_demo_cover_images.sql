-- 0007_demo_cover_images.sql — Give the four canonical demo assets local cover
-- images so the public scanner page demos with real hero art (Wave 2A.1).
--
-- WHY: the demo assets had no cover_image_url, so /t/demo-* showed an empty
-- placeholder. The images are bundled in the app (public/demo-assets/*.svg), so
-- the column just needs to point at those durable local paths — no external URLs
-- that could rot, no storage upload.
--
-- SAFETY: forward, idempotent UPDATEs keyed by the stable demo UUIDs (…101–104),
-- matching the 0004 pattern. Re-runs are no-ops; no reset, no DELETEs; rows that
-- don't exist (different seed UUIDs) simply match nothing.
--
-- APPLY: `supabase db push` (runs this migration only), or paste into the
-- Supabase SQL editor. Safe to run more than once.

update public.assets set cover_image_url = '/demo-assets/excavator-017.svg'
where id = '21111111-1111-4111-8111-111111111101';

update public.assets set cover_image_url = '/demo-assets/trailer-014.svg'
where id = '21111111-1111-4111-8111-111111111102';

update public.assets set cover_image_url = '/demo-assets/generator-008.svg'
where id = '21111111-1111-4111-8111-111111111103';

update public.assets set cover_image_url = '/demo-assets/compactor-003.svg'
where id = '21111111-1111-4111-8111-111111111104';
