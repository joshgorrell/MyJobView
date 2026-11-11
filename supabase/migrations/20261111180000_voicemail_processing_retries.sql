-- Bounded, durable retry metadata for voicemail processing.
alter table public.voicemail_messages
  add column if not exists retry_count integer not null default 0
    check (retry_count between 0 and 5),
  add column if not exists next_retry_at timestamptz;
create index if not exists voicemail_messages_retry_idx
  on public.voicemail_messages (next_retry_at)
  where state = 'failed' and retry_count < 5;
comment on column public.voicemail_messages.retry_count is
  'Number of failed processing attempts; maximum five before manual review.';
