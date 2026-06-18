-- 0006_documents_public_read.sql — Anon read of PUBLIC hosted documents.
--
-- WHY: Sprint 5D surfaces public documents on the public /t/{short_code} page.
-- External links work already, but hosted files live in the private `documents`
-- bucket (no anon access). This policy lets the anonymous role read ONLY objects
-- backing a `visibility='public'` document of a `public_status='public'` asset,
-- so the public page can mint short-lived signed URLs. Visibility is enforced in
-- the policy (RLS), not the UI. Private documents never match and stay private.
-- No service-role is involved.

create policy "documents public read" on storage.objects for select to anon
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.documents d
      join public.assets a on a.id = d.asset_id
      where d.storage_path = storage.objects.name
        and d.visibility = 'public'
        and a.public_status = 'public'
    )
  );
