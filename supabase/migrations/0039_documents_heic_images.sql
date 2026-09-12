-- 0039_documents_heic_images.sql — Keep phone and camera image originals as private hosted documents.
--
-- WHY (Engineering Phase D4.1): an iPhone photo kept in its original format, a Windows HEIC or an AVIF export could
-- not be added as a hosted document, because the private `documents` bucket (0005) allowed only JPEG/PNG/WebP images.
-- Documents are records kept as uploaded (a warranty photo, a signed sheet photographed on a phone), so they are
-- stored as the original file rather than converted. The app identifies the type from the file's bytes and verifies
-- the stored object before any row references it (lib/documents/upload.ts, lib/documents/storage.ts).
--
-- Adds image/heic, image/heif and image/avif. The bucket stays private at 50 MB; its policies (0005, 0006) are
-- unchanged; no other bucket changes (submissions and public-assets still take only JPEG/PNG/WebP). Existing objects
-- are unaffected. Compatible with the previous code, which never sends these types.

update storage.buckets
set allowed_mime_types = array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'image/heic', 'image/heif', 'image/avif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
where id = 'documents';
