-- Quality360 · Buckets privados de Supabase Storage para E3 (D20). Idempotente.
-- Local: lo aplica `npm run local` (o `npm run db:buckets` en infrastructure/).
-- Nube: infrastructure/nube/003_certificaciones_e3_nube.sql hace lo mismo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidencias', 'evidencias', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('certificados', 'certificados', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
