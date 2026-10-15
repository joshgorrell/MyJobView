-- Manual staff submissions are not inbound emails.
-- Preserve email/SMS/MMS evidence semantics and allow manual intake as a first-class channel.
alter table public.intake_items drop constraint if exists intake_items_channel_check;
alter table public.intake_items add constraint intake_items_channel_check
  check (channel in ('email','sms','mms','manual'));
