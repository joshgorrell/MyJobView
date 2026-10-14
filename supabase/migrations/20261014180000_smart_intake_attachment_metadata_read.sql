-- Attachment review grants metadata visibility only; binary storage remains private.
-- RLS is inherited from the owning intake's organization and active staff role.
create policy intake_attachments_staff_metadata_read
on public.intake_attachments
for select to authenticated
using (
  exists (
    select 1 from public.intake_messages m
    join public.intake_items i on i.id = m.intake_id
    where m.id = intake_message_id
      and public.smart_intake_staff_can_read(i.organization_id)
  )
);

-- Do not grant access to storage_key, sha256, or raw quarantine objects.
grant select (
  id, intake_message_id, original_filename, mime_type, byte_size,
  scan_status, disposition, expires_at, created_at, deleted_at
) on public.intake_attachments to authenticated;
