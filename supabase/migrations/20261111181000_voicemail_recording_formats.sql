-- Accept only recognized voicemail audio formats detected by worker magic bytes.
update storage.buckets
set allowed_mime_types = array['audio/mpeg','audio/wav','audio/ogg','audio/mp4']
where id = 'phone-voicemail-recordings' and public = false;
