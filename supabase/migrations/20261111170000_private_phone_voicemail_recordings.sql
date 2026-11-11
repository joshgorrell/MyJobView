-- Private audio recordings for phone dispatcher.
-- No anon/authenticated storage policies: only server-side workers may access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('phone-voicemail-recordings', 'phone-voicemail-recordings', false,
        26214400, array['audio/mpeg'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
