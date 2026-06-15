-- seed.sql — Demo data for AssetTag QR (Northridge Rentals + 4 assets).
--
-- Idempotent: fixed UUIDs + ON CONFLICT, so it can be re-run safely.
-- Apply AFTER db/migrations/0001_init.sql and 0002_storage.sql.
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
  serial_number, year, public_status, internal_notes
) values
  ('21111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111111',
   'EXCAVATOR-017', 'Mini Excavator', 'Mini Excavator', 'Kubota', 'U17',
   'KBU17-2022-0417', 2022, 'public', 'Hydraulic line replaced 2025-02; check tracks.'),
  ('21111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111111',
   'SCISSOR-204', 'Scissor Lift', 'Aerial Lift', 'Genie', 'GS-1930',
   'GEN1930-2021-0204', 2021, 'public', 'Annual inspection due 2026-09.'),
  ('21111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111111',
   'GENERATOR-051', 'Towable Generator', 'Power Generation', 'Generac', 'XG8000E',
   'GNC8000-2023-0051', 2023, 'public', 'Service hours logged in maintenance binder.'),
  ('21111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111111',
   'COMPACTOR-088', 'Plate Compactor', 'Compaction', 'Wacker Neuson', 'WP1550',
   'WNP1550-2020-0088', 2020, 'public', 'Belt guard replaced 2024-11.')
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
   'Genie GS-1930 Scissor Lift',
   'Connect the battery, check the emergency stop is out, and test controls at ground level first.',
   'Do not exceed the rated load. Use the guardrails and never climb on them.',
   'Electric. Charge fully before returning; do not operate while charging.',
   'Fully lower the platform, charge the batteries, and coil the charging cord.',
   'If the platform will not raise, verify the battery charge and that the e-stop is released.',
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
   '21111111-1111-4111-8111-111111111101', 'EX017DEMO',
   'https://app.example.com/t/EX017DEMO', 'active'),
  ('41111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111102', 'SL204DEMO',
   'https://app.example.com/t/SL204DEMO', 'active'),
  ('41111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111103', 'GN051DEMO',
   'https://app.example.com/t/GN051DEMO', 'active'),
  ('41111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111111',
   '21111111-1111-4111-8111-111111111104', 'PC088DEMO',
   'https://app.example.com/t/PC088DEMO', 'active')
on conflict (short_code) do nothing;
