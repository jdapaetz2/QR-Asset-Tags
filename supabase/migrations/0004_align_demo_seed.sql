-- 0004_align_demo_seed.sql — Align the Northridge demo data to the canonical
-- demo codes/names (see docs/PILOT_CUSTOMER_DEMO.md).
--
-- WHY: earlier seed (0003_seed.sql / seed.sql) used non-canonical codes
-- (EX017DEMO, "Scissor Lift", …). This is a forward, idempotent correction that
-- aligns an ALREADY-PROVISIONED database in place — no reset required. It
-- supersedes the historical demo-data inserts in 0003_seed.sql.
--
-- SAFETY: every statement is keyed by the stable demo UUID, so it is idempotent
-- (re-runs are no-ops) and preserves all row IDs. qr_link row IDs are unchanged,
-- so existing scan_events foreign keys remain valid. No DELETEs; profiles/auth
-- are untouched. If your database was provisioned with different UUIDs than the
-- standard seed (…101–104 / …111), these UPDATEs simply match nothing.
--
-- APPLY: `supabase db push` (runs this migration only), or paste into the
-- Supabase SQL editor. Safe to run more than once.

-- Assets --------------------------------------------------------------------
update public.assets set
  asset_code = 'EXCAVATOR-017',
  asset_name = 'Excavator 017',
  category   = 'Mini Excavator'
where id = '21111111-1111-4111-8111-111111111101';

-- Repurpose the former Scissor Lift as Trailer 014.
update public.assets set
  asset_code    = 'TRAILER-014',
  asset_name    = 'Trailer 014',
  category      = 'Utility Trailer',
  make          = 'Big Tex',
  model         = '35SA',
  serial_number = 'BTX35SA-2021-0014'
where id = '21111111-1111-4111-8111-111111111102';

update public.assets set
  asset_code    = 'GEN-008',
  asset_name    = 'Generator 008',
  category      = 'Portable Generator',
  serial_number = 'GNC8000-2023-0008'
where id = '21111111-1111-4111-8111-111111111103';

update public.assets set
  asset_code = 'COMPACTOR-003',
  asset_name = 'Plate Compactor 003',
  category   = 'Plate Compactor'
where id = '21111111-1111-4111-8111-111111111104';

-- Equipment page for the repurposed trailer (scissor-lift copy → trailer copy).
update public.equipment_pages set
  headline              = 'Big Tex 35SA Utility Trailer',
  quick_start_text      = 'Couple the trailer to the hitch, latch the coupler, cross and attach the safety chains, and connect the lighting plug. Confirm the lights work before towing.',
  safety_notes          = 'Do not exceed the rated load. Check tire pressure and that brake/turn lights work before each trip. Distribute the load evenly.',
  fuel_power_notes      = null,
  return_notes          = 'Sweep out the bed, secure the ramps/gate, lower the jack, and return with the chains coiled.',
  troubleshooting_notes = 'If the lights do not work, check the plug connection and the tow vehicle fuse. If the coupler will not latch, clear debris and confirm the ball size matches.',
  emergency_notes       = 'For emergencies call 911. For equipment issues call the support number on this page.'
where id = '31111111-1111-4111-8111-111111111102';

-- QR links — set canonical short codes; preserve row IDs (scan_events FKs stay valid).
update public.qr_links set
  short_code = 'demo-ex017',
  public_url = 'https://app.example.com/t/demo-ex017'
where id = '41111111-1111-4111-8111-111111111101';

update public.qr_links set
  short_code = 'demo-tr014',
  public_url = 'https://app.example.com/t/demo-tr014'
where id = '41111111-1111-4111-8111-111111111102';

update public.qr_links set
  short_code = 'demo-gen008',
  public_url = 'https://app.example.com/t/demo-gen008'
where id = '41111111-1111-4111-8111-111111111103';

update public.qr_links set
  short_code = 'demo-comp003',
  public_url = 'https://app.example.com/t/demo-comp003'
where id = '41111111-1111-4111-8111-111111111104';
