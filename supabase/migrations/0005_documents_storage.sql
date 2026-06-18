-- 0005_documents_storage.sql — Private storage bucket for hosted asset documents.
--
-- WHY: hosted documents (PDF manuals, etc.) need a bucket. The existing
-- `submissions` bucket is private but disallows application/pdf; `public-assets`
-- allows PDF but is public-read (would expose private documents). The smallest
-- safe fix is a dedicated PRIVATE `documents` bucket with org-scoped policies
-- mirroring `submissions`. Documents stay private; public surfacing (Sprint 5D)
-- will serve only `visibility='public'` docs via server-generated signed URLs.
--
-- Objects live under: org/{organization_id}/asset/{asset_id}/documents/{document_id}/...
-- so the org segment (foldername[2]) drives the policies, same as submissions.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false,
  52428800, -- 50 MB
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do nothing;

-- Org members (and platform owner) may write to their own org's path.
create policy "documents org write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'org'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );

-- Org members (and owner) may read only their own org's objects (admin UI +
-- server-generated signed URLs). No anon policy — documents are private here.
create policy "documents org read" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );

create policy "documents org delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      is_platform_owner()
      or (storage.foldername(name))[2] = current_org_id()::text
    )
  );
