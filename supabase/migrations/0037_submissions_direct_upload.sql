-- 0037_submissions_direct_upload.sql — close anonymous direct writes to the private submissions bucket.
--
-- Public submission photos now reach Storage through server-issued, path-bound signed upload URLs
-- (lib/forms/upload-prepare.ts). They are minted only after the honeypot, the shared rate limiter, live public-tag
-- resolution and the app's type/size/count caps, and every object is verified server-side (stored type, extension,
-- leading bytes, size) before a submission row references it (lib/forms/media-verify.ts). The no-JavaScript fallback
-- uploads through the prefix-scoped service-role helper (lib/forms/upload-intake.ts).
--
-- Nothing legitimate needs anon INSERT on `submissions` any more, so the unscoped policy that let anyone write
-- objects under any `org/…` path — a storage-spam and cost vector — is dropped. Anon still has no SELECT, UPDATE or
-- DELETE. The authenticated org policies are unchanged: staff checklists sign their uploads with their own session.
--
-- The bucket limits are tightened to the app's own: 10 MB per object, JPEG / PNG / WebP only (the bucket previously
-- allowed 100 MB, HEIC and video, which the app has never accepted for submissions).
--
-- Deploy order: CODE FIRST. The code that no longer needs anon INSERT must be live before this is applied.

drop policy if exists "submissions public insert" on storage.objects;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'submissions';
