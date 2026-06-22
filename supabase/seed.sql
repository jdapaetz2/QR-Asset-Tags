-- seed.sql — Demo data for AssetTag QR (Northridge Rentals + 4 canonical assets).
--
-- Canonical demo set (see docs/PILOT_CUSTOMER_DEMO.md):
--   demo-ex017   EXCAVATOR-017  Excavator 017        Mini Excavator
--   demo-tr014   TRAILER-014    Trailer 014          Utility Trailer
--   demo-gen008  GEN-008        Generator 008        Portable Generator
--   demo-comp003 COMPACTOR-003  Plate Compactor 003  Plate Compactor
--
-- Idempotent: fixed UUIDs + ON CONFLICT, so it can be re-run safely.
-- Apply AFTER supabase/migrations/0001_init.sql and 0002_storage.sql.
--
-- NOTE: `profiles` rows require real `auth.users` and so are NOT seeded here —
-- creating the first platform owner / customer admin is part of Sprint 1 /
-- manual onboarding (see docs/MVP_SCOPE.md, docs/OPEN_QUESTIONS.md #4).
--
-- The `public_url` values below assume the platform host below — adjust them to
-- match NEXT_PUBLIC_SITE_URL for your environment.

-- Organization --------------------------------------------------------------
insert into public.organizations (
  id, name, slug, primary_color, support_phone, support_email, website_url,
  powered_by_label, status, plan_name, monthly_fee, asset_limit
) values (
  '11111111-1111-4111-8111-111111111111',
  'Northridge Rentals',
  'northridge-rentals',
  '#1d4ed8',
  '+1-555-0100',
  'support@northridge-rentals.example',
  'https://northridge-rentals.example',
  'Powered by AssetTag QR',
  'active',
  'pilot',
  0,
  100
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
   'Belt guard replaced 2024-11.')
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
   'https://app.example.com/t/demo-comp003', 'active')
on conflict (short_code) do nothing;
