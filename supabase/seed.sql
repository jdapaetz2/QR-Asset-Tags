-- seed.sql — Demo data for AssetTag QR (Northridge Rentals, a realistic pilot yard).
--
-- WHAT THIS SEEDS (one demo org, fully self-contained):
--   1 organization  Northridge Rentals (Standard Yard pilot plan)
--   10 assets        excavator, trailer, generator, plate compactor, scissor lift,
--                    light tower, towable air compressor, electrical test set,
--                    skid steer, concrete mixer  (4 canonical + 6 added)
--   10 equipment pages (all published)   10 qr_links (all active, demo-* short codes)
--   7 form_submissions (damage/support/return; new/reviewed/resolved/archived;
--                       one fully-resolved thread; the excavator carries a problem history)
--   ~60 days of weekday-weighted scan_events (varied per asset, non-round)
--   2 tag_requests (+ child assets)      4 documents (public manual links + 1 needs_review)
--
-- Canonical short codes (physical-tag routing, /t/{short_code}):
--   demo-ex017 demo-tr014 demo-gen008 demo-comp003 demo-sl021
--   demo-lt006 demo-ac012 demo-ts004 demo-ss009 demo-cm005
--
-- IDEMPOTENT + ISOLATED: fixed UUIDs + ON CONFLICT DO NOTHING for discrete rows, a
-- NOT EXISTS guard for the scan-events block. Every write is scoped to the demo org
-- id 11111111-…-111111111111 and touches no global/shared rows. Re-runnable safely
-- (insert-only: it adds missing rows and leaves existing rows untouched — it does not
-- self-heal drifted columns). Dated with `now() - interval` so submissions/scans stay
-- recent relative to whenever the DB is reset.
--
-- Apply AFTER supabase/migrations/0001_init.sql … latest migration.
--
-- WHERE THIS RUNS — READ THIS:
--   * This file runs on FRESH LOCAL RESETS ONLY (Supabase CLI `db reset`). It is NOT
--     applied automatically to any live/remote/hosted database.
--   * To refresh a REMOTE demo database, an operator runs THIS FILE manually in the
--     Supabase SQL editor. It is idempotent + demo-org-scoped, so it only ADDS the
--     demo rows and never touches other orgs' data. (No numbered migration carries
--     this demo data — that would auto-run on every environment's deploy.)
--
-- NOTE: `profiles` rows require real `auth.users` and are NOT seeded here — creating
-- the first platform owner / customer admin is manual onboarding (see
-- supabase/seed_profiles.example.sql and docs/ONBOARDING_RUNBOOK.md).
--
-- The `public_url` values below assume a placeholder host — adjust them to match
-- NEXT_PUBLIC_SITE_URL for your environment.

-- Organization --------------------------------------------------------------
-- Standard Yard pilot preset. Prices are stored in CENTS (see lib/plans/money.ts);
-- the legacy monthly_fee stays 0 for an annual plan. Commercial fields are owner-only
-- at runtime (protect_commercial_fields is a BEFORE UPDATE trigger, so this INSERT is fine).
insert into public.organizations (
  id, name, slug, primary_color, support_phone, support_email, website_url,
  powered_by_label, status, plan_name, monthly_fee, asset_limit,
  plan_key, billing_interval, intro_price_cents, renewal_price_cents,
  tag_credit_cents, storage_limit_mb, video_uploads_enabled, plan_notes,
  notification_email, notify_damage_reports, notify_support_requests
) values (
  '11111111-1111-4111-8111-111111111111',
  'Northridge Rentals',
  'northridge-rentals',
  '#1d4ed8',
  '+1-555-0100',
  'support@northridge-rentals.example',
  'https://northridge-rentals.example',
  'Powered by MuleMark',
  'active',
  'Standard Yard',
  0,
  100,
  'standard_yard',
  'annual',
  450000,
  480000,
  50000,
  5000,
  false,
  'Pilot terms — Standard Yard preset (100 covered assets), annual billing with year-one intro pricing and a tag production credit.',
  'dispatch@northridge-rentals.example',
  true,
  true
)
on conflict (id) do nothing;

-- Assets --------------------------------------------------------------------
insert into public.assets (
  id, organization_id, asset_code, asset_name, category, make, model,
  serial_number, year, public_status, cover_image_url, internal_notes
) values
  ('21111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111111',
   'EXCAVATOR-017', 'Excavator 017', 'Mini Excavator', 'Kubota', 'U17',
   'KBU17-2022-0417', 2022, 'public', '/demo-assets/excavator-017.svg',
   'Hydraulic line replaced 2025-02; check tracks.'),
  ('21111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111111',
   'TRAILER-014', 'Trailer 014', 'Utility Trailer', 'Big Tex', '35SA',
   'BTX35SA-2021-0014', 2021, 'public', '/demo-assets/trailer-014.svg',
   'Annual DOT inspection due 2026-09; check tire tread.'),
  ('21111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111111',
   'GEN-008', 'Generator 008', 'Portable Generator', 'Generac', 'XG8000E',
   'GNC8000-2023-0008', 2023, 'public', '/demo-assets/generator-008.svg',
   'Service hours logged in maintenance binder.'),
  ('21111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111111',
   'COMPACTOR-003', 'Plate Compactor 003', 'Plate Compactor', 'Wacker Neuson', 'WP1550',
   'WNP1550-2020-0003', 2020, 'public', '/demo-assets/compactor-003.svg',
   'Belt guard replaced 2024-11.'),
  ('21111111-1111-4111-8111-111111111105', '11111111-1111-4111-8111-111111111111',
   'SCISSOR-021', 'Scissor Lift 021', 'Scissor Lift', 'Genie', 'GS-1930',
   'GNGS1930-2022-0021', 2022, 'public', '/demo-assets/scissor-lift.svg',
   'Battery pack replaced 2025-04; charge fully between rentals.'),
  ('21111111-1111-4111-8111-111111111106', '11111111-1111-4111-8111-111111111111',
   'LIGHT-006', 'Light Tower 006', 'Light Tower', 'Magnum', 'MLT3060',
   'MGMLT3060-2021-0006', 2021, 'public', '/demo-assets/light-tower.svg',
   'LED conversion done 2024-08.'),
  ('21111111-1111-4111-8111-111111111107', '11111111-1111-4111-8111-111111111111',
   'AIRCOMP-012', 'Air Compressor 012', 'Towable Air Compressor', 'Sullair', '185',
   'SUL185-2020-0012', 2020, 'public', '/demo-assets/air-compressor.svg',
   'Air filter and separator serviced 2025-03.'),
  ('21111111-1111-4111-8111-111111111108', '11111111-1111-4111-8111-111111111111',
   'TESTSET-004', 'Insulation Tester 004', 'Electrical Test Equipment', 'Megger', 'MIT430',
   'MGMIT430-2023-0004', 2023, 'public', '/demo-assets/test-equipment.svg',
   'Calibration certificate on file; due 2026-05.'),
  ('21111111-1111-4111-8111-111111111109', '11111111-1111-4111-8111-111111111111',
   'SKID-009', 'Skid Steer 009', 'Skid Steer Loader', 'Bobcat', 'S650',
   'BOBS650-2021-0009', 2021, 'public', '/demo-assets/skid-steer.svg',
   'Quick-attach plate inspected 2025-01.'),
  ('21111111-1111-4111-8111-111111111110', '11111111-1111-4111-8111-111111111111',
   'MIXER-005', 'Concrete Mixer 005', 'Concrete Mixer', 'Multiquip', 'MC94S',
   'MQMC94S-2020-0005', 2020, 'public', '/demo-assets/concrete-mixer.svg',
   'Drum paddles replaced 2024-10.')
on conflict (id) do nothing;

-- Equipment pages (published) ----------------------------------------------
insert into public.equipment_pages (
  id, asset_id, organization_id, headline, quick_start_text, safety_notes,
  fuel_power_notes, return_notes, troubleshooting_notes, emergency_notes, is_published
) values
  ('31111111-1111-4111-8111-111111111101', '21111111-1111-4111-8111-111111111101',
   '11111111-1111-4111-8111-111111111111',
   'Kubota U17 Mini Excavator',
   'Lower the blade, start the engine, and let it warm up for 2 minutes before operating.',
   'Always wear a seatbelt. Keep bystanders clear of the swing radius.',
   'Diesel only. Check fuel and hydraulic levels before each use.',
   'Clean off mud, lower the bucket and blade to the ground, and return the key.',
   'If it will not start, check the safety lever is down and the fuel valve is open.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111102', '21111111-1111-4111-8111-111111111102',
   '11111111-1111-4111-8111-111111111111',
   'Big Tex 35SA Utility Trailer',
   'Couple the trailer to the hitch, latch the coupler, cross and attach the safety chains, and connect the lighting plug. Confirm the lights work before towing.',
   'Do not exceed the rated load. Check tire pressure and that brake/turn lights work before each trip. Distribute the load evenly.',
   null,
   'Sweep out the bed, secure the ramps/gate, lower the jack, and return with the chains coiled.',
   'If the lights do not work, check the plug connection and the tow vehicle fuse. If the coupler will not latch, clear debris and confirm the ball size matches.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111103', '21111111-1111-4111-8111-111111111103',
   '11111111-1111-4111-8111-111111111111',
   'Generac XG8000E Generator',
   'Place on level ground in open air, check oil, then start with the electric start.',
   'Never run indoors or in enclosed spaces — risk of carbon monoxide.',
   'Gasoline. Check oil and fuel before starting; never refuel while running.',
   'Let it cool, wipe down, and return with the fuel topped off.',
   'If it will not start, check the fuel valve, choke position, and oil level.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111104', '21111111-1111-4111-8111-111111111104',
   '11111111-1111-4111-8111-111111111111',
   'Wacker Neuson WP1550 Plate Compactor',
   'Check oil, set the throttle to start, and engage slowly once the engine is running.',
   'Wear hearing and foot protection. Keep hands and feet away from the base plate.',
   'Gasoline. Check engine oil before each use.',
   'Clean the base plate, let it cool, and return with fuel topped off.',
   'If the plate will not move, confirm the throttle is engaged and the belt is intact.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111105', '21111111-1111-4111-8111-111111111105',
   '11111111-1111-4111-8111-111111111111',
   'Genie GS-1930 Scissor Lift',
   'Confirm the battery is charged, disengage the pothole guard check, and raise the platform slowly from the platform controls.',
   'Do not exceed the rated platform load. Keep the rails up and the gate latched. Use only on firm, level ground.',
   'Electric. Charge fully between rentals; do not operate while on charge.',
   'Lower the platform, switch off, and return on charge with the keys.',
   'If the platform will not raise, check the emergency stop is released and the battery charge level.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111106', '21111111-1111-4111-8111-111111111106',
   '11111111-1111-4111-8111-111111111111',
   'Magnum MLT3060 Light Tower',
   'Level the outriggers, raise the mast, aim the lamps, then start the engine and switch on the lights.',
   'Lower the mast fully before moving. Keep clear of overhead power lines when raising the mast.',
   'Diesel. Check fuel and oil before each use.',
   'Lower the mast and outriggers, switch off, and return with the fuel topped off.',
   'If the lights will not come on, confirm the engine is running and the breaker is set.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111107', '21111111-1111-4111-8111-111111111107',
   '11111111-1111-4111-8111-111111111111',
   'Sullair 185 Towable Air Compressor',
   'Chock the wheels, check oil, open the service valve, and start the engine. Let pressure build before connecting tools.',
   'Never point an air hose at anyone. Confirm hose couplings are pinned before use.',
   'Diesel. Check engine oil and compressor oil before each use.',
   'Bleed the pressure, close the valves, let it cool, and return with fuel topped off.',
   'If it will not build pressure, check the service valve is open and the hoses are sealed.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111108', '21111111-1111-4111-8111-111111111108',
   '11111111-1111-4111-8111-111111111111',
   'Megger MIT430 Insulation Tester',
   'Confirm the circuit is de-energized, connect the leads, select the test voltage, and hold to test.',
   'For use by qualified personnel only. Verify the circuit is isolated and dead before connecting.',
   'Rechargeable battery. Check the charge indicator before field use.',
   'Coil the leads, switch off, and return in the case with the calibration certificate.',
   'If readings look wrong, check the leads are seated and the battery is charged; confirm the calibration date.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111109', '21111111-1111-4111-8111-111111111109',
   '11111111-1111-4111-8111-111111111111',
   'Bobcat S650 Skid Steer Loader',
   'Lower the safety bar, start the engine, and confirm the attachment is locked before operating.',
   'Always wear the seatbelt and keep the safety bar down. Keep bystanders clear of the loader arms.',
   'Diesel. Check fuel and hydraulic levels before each use.',
   'Lower the bucket to the ground, clean off debris, and return the key.',
   'If the loader arms will not move, confirm the safety bar is down and the parking brake is released.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true),
  ('31111111-1111-4111-8111-111111111110', '21111111-1111-4111-8111-111111111110',
   '11111111-1111-4111-8111-111111111111',
   'Multiquip MC94S Concrete Mixer',
   'Check oil, position on level ground, start the engine, and engage the drum before adding material.',
   'Keep hands and tools clear of the rotating drum and paddles. Wear eye protection.',
   'Gasoline. Check engine oil before each use.',
   'Rinse the drum thoroughly before the concrete sets, let it cool, and return clean.',
   'If the drum will not turn, confirm the engine is running and the drive belt is intact.',
   'For emergencies call 911. For equipment issues call the support number on this page.',
   true)
on conflict (asset_id) do nothing;

-- QR links (permanent routing) ----------------------------------------------
-- public_url must match NEXT_PUBLIC_SITE_URL; placeholder host shown.
insert into public.qr_links (
  id, organization_id, asset_id, short_code, public_url, status
) values
  ('41111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111101', 'demo-ex017',
   'https://app.example.com/t/demo-ex017', 'active'),
  ('41111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111102', 'demo-tr014',
   'https://app.example.com/t/demo-tr014', 'active'),
  ('41111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111103', 'demo-gen008',
   'https://app.example.com/t/demo-gen008', 'active'),
  ('41111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111104', 'demo-comp003',
   'https://app.example.com/t/demo-comp003', 'active'),
  ('41111111-1111-4111-8111-111111111105', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111105', 'demo-sl021',
   'https://app.example.com/t/demo-sl021', 'active'),
  ('41111111-1111-4111-8111-111111111106', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111106', 'demo-lt006',
   'https://app.example.com/t/demo-lt006', 'active'),
  ('41111111-1111-4111-8111-111111111107', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111107', 'demo-ac012',
   'https://app.example.com/t/demo-ac012', 'active'),
  ('41111111-1111-4111-8111-111111111108', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111108', 'demo-ts004',
   'https://app.example.com/t/demo-ts004', 'active'),
  ('41111111-1111-4111-8111-111111111109', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111109', 'demo-ss009',
   'https://app.example.com/t/demo-ss009', 'active'),
  ('41111111-1111-4111-8111-111111111110', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111110', 'demo-cm005',
   'https://app.example.com/t/demo-cm005', 'active')
on conflict (short_code) do nothing;

-- Documents (public manual links + one needs-review) ------------------------
-- External links only (url set, storage_path null) → no storage objects required.
insert into public.documents (
  id, organization_id, asset_id, title, document_type, url, storage_path,
  visibility, link_status
) values
  ('81111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111101',
   'Kubota U17 Operator Manual', 'manual',
   'https://www.kubotausa.com/getmedia/u17-operator-manual.pdf', null,
   'public', 'ok'),
  ('81111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111101',
   'U17 Daily Start-Up Checklist', 'startup_guide',
   'https://northridge-rentals.example/guides/u17-startup.pdf', null,
   'public', 'ok'),
  ('81111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111103',
   'Generac XG8000E Owner Manual', 'manual',
   'https://www.generac.com/manuals/xg8000e.pdf', null,
   'public', 'ok'),
  ('81111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111102',
   'Big Tex 35SA Wiring Diagram', 'manual',
   'https://bigtextrailers.example/legacy/35sa-wiring.pdf', null,
   'public', 'needs_review')
on conflict (id) do nothing;

-- Form submissions ----------------------------------------------------------
-- Contact fields are columns; form-specific answers live in submission_data_json
-- (keys match lib/forms/validate.ts). media_urls stays [] — the live demo adds a real
-- photo. Dated relatively so the inbox always looks current. The excavator (…101)
-- carries a small problem history: a resolved damage report, a reviewed support
-- request, and a resolved return checklist.
insert into public.form_submissions (
  id, organization_id, asset_id, form_type, submitted_by_name, submitted_by_email,
  submitted_by_phone, submission_data_json, media_urls, status, created_at
) values
  ('51111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111101', 'damage_report',
   'Marcus Reyes', null, '+1-555-0142',
   '{"urgency":"high","description":"Hydraulic hose is weeping at the boom coupling and left a small puddle after use. Tagged it out until it can be looked at."}'::jsonb,
   '[]'::jsonb, 'resolved', now() - interval '41 days'),
  ('51111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111101', 'support_request',
   'Danielle Okafor', 'danielle.okafor@example.com', null,
   '{"preferred_contact_method":"email","description":"Left track tension feels loose. Can someone confirm the correct spec before the next rental goes out?"}'::jsonb,
   '[]'::jsonb, 'reviewed', now() - interval '12 days'),
  ('51111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111101', 'return_checklist',
   'Luis Fernandez', null, null,
   '{"condition_notes":"Cleaned and fueled. Minor scratches on the blade, nothing structural.","fuel_or_charge_level":"Full","cleaned":"yes","accessories_returned":"yes","damage_observed":"no"}'::jsonb,
   '[]'::jsonb, 'resolved', now() - interval '5 days'),
  ('51111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111103', 'damage_report',
   'Priya Nair', null, '+1-555-0188',
   '{"urgency":"medium","description":"Generator shuts off after about ten minutes under load. Might be overheating — smelled hot near the vents."}'::jsonb,
   '[]'::jsonb, 'new', now() - interval '2 days'),
  ('51111111-1111-4111-8111-111111111105', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111102', 'support_request',
   'Sam Whitfield', 'sam.whitfield@example.com', null,
   '{"preferred_contact_method":"phone","description":"One of the trailer running lights is out. What bulb size do I need to pick up a replacement?"}'::jsonb,
   '[]'::jsonb, 'new', now() - interval '1 days'),
  ('51111111-1111-4111-8111-111111111106', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111104', 'return_checklist',
   'Grace Liu', 'grace.liu@example.com', null,
   '{"condition_notes":"Base plate cleaned, ran well the whole job.","fuel_or_charge_level":"3/4","cleaned":"yes","accessories_returned":"yes","damage_observed":"no"}'::jsonb,
   '[]'::jsonb, 'reviewed', now() - interval '8 days'),
  ('51111111-1111-4111-8111-111111111107', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111105', 'damage_report',
   'Tomasz Kowalski', 'tomasz.k@example.com', null,
   '{"urgency":"low","description":"Small scuff on the control panel decal. Cosmetic only, everything works."}'::jsonb,
   '[]'::jsonb, 'archived', now() - interval '33 days')
on conflict (id) do nothing;

-- Scan events (~60 days, weekday-weighted, varied per asset) -----------------
-- Whole-block idempotency: only runs when the demo org has no scan_events yet.
-- Counts are deterministic (hashtext-based) so a reset reproduces the same shape:
-- a small per-asset base + day variation, minus a weekend penalty. Times land in
-- daytime hours. Modulo is written ((h % n) + n) % n to stay non-negative.
insert into public.scan_events (
  id, organization_id, asset_id, qr_link_id, scanned_at, user_agent, ip_hash,
  referrer, device_type
)
select
  gen_random_uuid(),
  c.organization_id,
  c.asset_id,
  c.qr_link_id,
  now()
    - make_interval(days => c.day)
    - make_interval(mins => 480 + (((hashtext(c.short_code || c.day::text || s.n::text) % 540) + 540) % 540)),
  (array[
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
  ])[1 + (((hashtext(c.short_code || s.n::text) % 4) + 4) % 4)],
  md5(c.asset_id::text || c.day::text || s.n::text),
  (array[null, null, 'https://www.google.com/', 'https://m.facebook.com/']::text[])[1 + (((hashtext(c.qr_link_id::text || c.day::text || s.n::text) % 4) + 4) % 4)],
  (array['mobile', 'mobile', 'mobile', 'tablet', 'desktop'])[1 + (((hashtext(c.short_code || c.day::text || s.n::text) % 5) + 5) % 5)]
from (
  select
    q.id as qr_link_id,
    q.organization_id,
    q.asset_id,
    q.short_code,
    d.day,
    greatest(
      0,
      (((hashtext(q.short_code) % 3) + 3) % 3) + 1
        + (((hashtext(q.asset_id::text || d.day::text) % 4) + 4) % 4)
        - (case when extract(dow from (now() - make_interval(days => d.day))) in (0, 6) then 2 else 0 end)
    ) as cnt
  from public.qr_links q
  cross join generate_series(0, 59) as d(day)
  where q.organization_id = '11111111-1111-4111-8111-111111111111'
) c
cross join lateral generate_series(1, c.cnt) as s(n)
where c.cnt > 0
  and not exists (
    select 1 from public.scan_events se
    where se.organization_id = '11111111-1111-4111-8111-111111111111'
  );

-- Tag requests (+ child assets) ---------------------------------------------
-- requested_by_profile_id is NULL (profiles are not seeded). Two live statuses.
insert into public.tag_requests (
  id, organization_id, requested_by_profile_id, status, material, mounting_method,
  tag_size, quantity_notes, production_notes, created_at, delivered_at, completed_at
) values
  ('61111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111111',
   null, 'delivered', 'Anodized aluminum', 'Rivet',
   '2" x 1"', 'Initial fleet — excavator and trailer.',
   'Delivered in the first tag batch.',
   now() - interval '35 days', now() - interval '20 days', now() - interval '20 days'),
  ('61111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111111',
   null, 'in_production', 'Stainless steel', 'Adhesive + screw',
   '1.5" round', 'New arrivals — scissor lift, light tower, air compressor, test set.',
   null,
   now() - interval '6 days', null, null)
on conflict (id) do nothing;

insert into public.tag_request_assets (
  id, tag_request_id, asset_id, quantity, notes
) values
  ('71111111-1111-4111-8111-111111111101', '61111111-1111-4111-8111-111111111101',
   '21111111-1111-4111-8111-111111111101', 2, 'Boom and cab.'),
  ('71111111-1111-4111-8111-111111111102', '61111111-1111-4111-8111-111111111101',
   '21111111-1111-4111-8111-111111111102', 1, null),
  ('71111111-1111-4111-8111-111111111103', '61111111-1111-4111-8111-111111111102',
   '21111111-1111-4111-8111-111111111105', 1, null),
  ('71111111-1111-4111-8111-111111111104', '61111111-1111-4111-8111-111111111102',
   '21111111-1111-4111-8111-111111111106', 1, null),
  ('71111111-1111-4111-8111-111111111105', '61111111-1111-4111-8111-111111111102',
   '21111111-1111-4111-8111-111111111107', 1, null),
  ('71111111-1111-4111-8111-111111111106', '61111111-1111-4111-8111-111111111102',
   '21111111-1111-4111-8111-111111111108', 1, 'Include the calibration QR.')
on conflict (id) do nothing;
