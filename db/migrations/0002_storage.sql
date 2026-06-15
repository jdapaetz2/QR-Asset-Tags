-- 0002_storage.sql — Storage buckets + RLS for AssetTag QR.
--
-- Target: Supabase Storage. Objects live under org-scoped paths:
--     org/{organization_id}/...
-- so policies can derive the owning org from the path. Precise server-side org
-- derivation on public uploads lands in Sprint 4; this sets the safe defaults.
--
-- See docs/SECURITY_MODEL.md "Submissions and uploads".

-- ---------------------------------------------------------------------------
-- Buckets
--   public-assets : public read (cover images, public documents)
--   submissions   : private (form-upload media, private documents)
-- Caps reflect docs/OPEN_QUESTIONS.md defaults; app also validates type/size.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'public-assets', 'public-assets', true,
    26214400, -- 25 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
  ),
  (
    'submissions', 'submissions', false,
    104857600, -- 100 MB (video)
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects (RLS is already enabled by Supabase).
-- Path helpers: (storage.foldername(name))[1] = 'org',
--               (storage.foldername(name))[2] = organization_id::text
-- ---------------------------------------------------------------------------

-- public-assets: anyone may read; org members (and owner) write to their path.
create policy "public-assets read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-assets');

create policy "public-assets write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] = 'org'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );

create policy "public-assets update" on storage.objects for update to authenticated
  using (
    bucket_id = 'public-assets'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );

create policy "public-assets delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'public-assets'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );

-- submissions: public may INSERT only (under an org/ path); NO public read/list.
create policy "submissions public insert" on storage.objects for insert to anon
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = 'org'
    and (storage.foldername(name))[2] is not null
  );

-- submissions: org members (and owner) read/manage only their org's objects.
create policy "submissions org read" on storage.objects for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );

create policy "submissions org write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = 'org'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );

create policy "submissions org delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );
