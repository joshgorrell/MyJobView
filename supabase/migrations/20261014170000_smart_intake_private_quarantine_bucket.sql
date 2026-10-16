-- Smart Intake temporary attachment storage. Objects are service-role-only
-- until a clean scan verdict and explicit user disposition are recorded.
-- No public bucket, storage SELECT, or signed URL policy is created.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'smart-intake-quarantine',
  'smart-intake-quarantine',
  false,
  15728640,
  array['application/octet-stream']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no storage.objects policies for authenticated/anon.
-- Supabase service-role bypasses RLS for server-side quarantine operations.
