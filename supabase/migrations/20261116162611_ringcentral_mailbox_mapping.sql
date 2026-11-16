-- Mapping is configured by an active tenant administrator through the service-only RPC.
alter table public.ringcentral_mailboxes
  add column extension_number text,
  add column extension_type text,
  add column default_department text check(default_department in ('sales','service','projects','security','accounting','administration')),
  add column primary_user_id uuid references auth.users(id) on delete set null,
  add column escalation_minutes integer not null default 120 check(escalation_minutes between 5 and 10080),
  add column version integer not null default 0,
  add constraint ringcentral_mailboxes_id_org_unique unique(id,organization_id);
alter table public.voicemail_messages
  add column ai_department text,
  add column service_request_id uuid references public.service_requests(id) on delete set null,
  add constraint voicemail_messages_id_org_unique unique(id,organization_id);
create table public.ringcentral_mailbox_recipients (
  mailbox_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_role text not null check(recipient_role in ('responsible','backup')),
  email_enabled boolean not null default false,
  primary key(mailbox_id,user_id),
  foreign key(mailbox_id,organization_id) references public.ringcentral_mailboxes(id,organization_id) on delete cascade
);
alter table public.ringcentral_mailbox_recipients enable row level security;
revoke all on public.ringcentral_mailbox_recipients from anon,authenticated;
grant all on public.ringcentral_mailbox_recipients to service_role;

create or replace function public.save_ringcentral_mailbox_mapping(
 p_organization_id uuid,p_mailbox_id uuid,p_version integer,p_enabled boolean,
 p_department text,p_primary_user_id uuid,p_escalation_minutes integer,p_recipients jsonb
) returns boolean language plpgsql set search_path='' as $$
declare m record;
begin
 select * into m from public.ringcentral_mailboxes where id=p_mailbox_id and organization_id=p_organization_id for update;
 if not found or m.version<>p_version then return false; end if;
 if jsonb_typeof(p_recipients)<>'array' or jsonb_array_length(p_recipients)>50 then raise exception 'invalid recipients'; end if;
 if exists(select 1 from jsonb_to_recordset(p_recipients) r(user_id uuid,recipient_role text,email_enabled boolean)
   where r.recipient_role not in ('responsible','backup') or r.recipient_role is null or r.email_enabled is null
    or not exists(select 1 from public.profiles p where p.id=r.user_id and p.organization_id=p_organization_id and p.is_active and p.my_job_view_enabled))
 then raise exception 'recipient unavailable or MJV access disabled'; end if;
 if (select count(*)<>count(distinct user_id) from jsonb_to_recordset(p_recipients) r(user_id uuid)) then raise exception 'duplicate recipients'; end if;
 if p_enabled and (p_department is null or p_primary_user_id is null) then raise exception 'department and owner required'; end if;
 if p_primary_user_id is not null and not exists(select 1 from jsonb_to_recordset(p_recipients) r(user_id uuid,recipient_role text) where r.user_id=p_primary_user_id and r.recipient_role='responsible') then raise exception 'owner must be responsible recipient'; end if;
 update public.ringcentral_mailboxes set enabled=p_enabled,default_department=p_department,primary_user_id=p_primary_user_id,
 escalation_minutes=p_escalation_minutes,version=version+1,updated_at=now() where id=m.id;
 delete from public.ringcentral_mailbox_recipients where mailbox_id=m.id and organization_id=p_organization_id;
 insert into public.ringcentral_mailbox_recipients(mailbox_id,organization_id,user_id,recipient_role,email_enabled)
 select m.id,p_organization_id,r.user_id,r.recipient_role,r.email_enabled from jsonb_to_recordset(p_recipients) r(user_id uuid,recipient_role text,email_enabled boolean);
 -- Explicit mapping grants department access. Removing a mapping does not revoke independent department access.
 if p_department is not null then
 insert into public.phone_voicemail_department_access(organization_id,user_id,department)
 select p_organization_id,r.user_id,p_department from jsonb_to_recordset(p_recipients) r(user_id uuid)
 on conflict do nothing;
 end if;
 return true;
end; $$;
revoke all on function public.save_ringcentral_mailbox_mapping(uuid,uuid,integer,boolean,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_ringcentral_mailbox_mapping(uuid,uuid,integer,boolean,text,uuid,integer,jsonb) to service_role;

-- Durable, voicemail-owned email receipts. No transcript or recording is stored here.
create table public.phone_voicemail_email_deliveries (
 voicemail_id uuid not null,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('new','escalation')),
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','unknown')),
 attempts integer not null default 0,
 lease_until timestamptz,
 next_attempt_at timestamptz not null default now(),
 provider_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(voicemail_id,user_id,kind),
 foreign key(voicemail_id,organization_id) references public.voicemail_messages(id,organization_id) on delete cascade
);
alter table public.phone_voicemail_email_deliveries enable row level security;
revoke all on public.phone_voicemail_email_deliveries from anon,authenticated;
grant all on public.phone_voicemail_email_deliveries to service_role;
create or replace function public.claim_phone_voicemail_email(p_organization_id uuid,p_voicemail_id uuid,p_user_id uuid,p_kind text)
returns boolean language plpgsql set search_path='' as $$
declare claimed boolean;
begin
 insert into public.phone_voicemail_email_deliveries(organization_id,voicemail_id,user_id,kind)
 values(p_organization_id,p_voicemail_id,p_user_id,p_kind) on conflict do nothing;
 -- Provider idempotency expires after 24h; ambiguous old sends require review, never a blind resend.
 update public.phone_voicemail_email_deliveries set state='unknown',updated_at=now()
 where organization_id=p_organization_id and voicemail_id=p_voicemail_id and user_id=p_user_id and kind=p_kind
 and state in ('sending','failed') and created_at<now()-interval '23 hours';
 update public.phone_voicemail_email_deliveries set state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now()
 where organization_id=p_organization_id and voicemail_id=p_voicemail_id and user_id=p_user_id and kind=p_kind
 and attempts<5 and next_attempt_at<=now() and (state in ('pending','failed') or (state='sending' and lease_until<now()));
 claimed=found;
 return claimed;
end; $$;
revoke all on function public.claim_phone_voicemail_email(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_phone_voicemail_email(uuid,uuid,uuid,text) to service_role;

create or replace function public.match_phone_voicemail_contact(p_organization_id uuid,p_phone text)
returns uuid language sql stable set search_path='' as $$
 with matches as (
 select c.id from public.contacts c where c.organization_id=p_organization_id
 and length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) in (10,11)
 and right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),10) in
 (right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10),right(regexp_replace(coalesce(c.mobile_phone,''),'[^0-9]','','g'),10),right(regexp_replace(coalesce(c.business_phone,''),'[^0-9]','','g'),10)) limit 2
 ) select case when count(*)=1 then (array_agg(id))[1] else null end from matches;
$$;
revoke all on function public.match_phone_voicemail_contact(uuid,text) from public,anon,authenticated;
grant execute on function public.match_phone_voicemail_contact(uuid,text) to service_role;
-- New email receipts are FK-owned; escalation notifications use the existing voicemail polymorphic identity.
create or replace function public.cleanup_phone_voicemail_delivery_snapshots() returns trigger
language plpgsql set search_path='' as $$
begin
 delete from public.notifications where organization_id=old.organization_id and related_id=old.id and type='phone_voicemail';
 delete from public.flow_events where organization_id=old.organization_id and source_table='voicemail_messages' and source_id=old.id;
 return old;
end; $$;
revoke all on function public.cleanup_phone_voicemail_delivery_snapshots() from public,anon,authenticated;
create trigger cleanup_phone_voicemail_delivery_snapshots before delete on public.voicemail_messages for each row execute function public.cleanup_phone_voicemail_delivery_snapshots();

alter table public.service_requests add column source_phone_voicemail_id uuid unique references public.voicemail_messages(id) on delete set null;
create or replace function public.link_service_request_phone_voicemail() returns trigger
language plpgsql security definer set search_path='' as $$
declare v record; actor record;
begin
 if new.source_phone_voicemail_id is null then return new; end if;
 select * into actor from public.profiles where id=auth.uid() and organization_id=new.organization_id and is_active and my_job_view_enabled;
 if not found or new.created_by<>actor.id then raise exception 'voicemail request actor forbidden'; end if;
 select * into v from public.voicemail_messages where id=new.source_phone_voicemail_id and organization_id=new.organization_id for update;
 if not found or v.state not in ('ready','review') or v.service_request_id is not null then raise exception 'voicemail unavailable or already linked'; end if;
 if actor.role<>'admin' and not exists(select 1 from public.phone_voicemail_department_access where organization_id=new.organization_id and user_id=actor.id and department=v.department) then raise exception 'voicemail department forbidden'; end if;
 update public.voicemail_messages set service_request_id=new.id,workflow_status='in_progress',updated_at=now() where id=v.id and organization_id=new.organization_id;
 return new;
end; $$;
revoke all on function public.link_service_request_phone_voicemail() from public,anon,authenticated;
create trigger link_service_request_phone_voicemail after insert on public.service_requests for each row execute function public.link_service_request_phone_voicemail();
-- Source identity is immutable after creation; FK cleanup can clear a deleted voicemail.
create or replace function public.protect_service_request_voicemail_source() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.source_phone_voicemail_id is not null and new.source_phone_voicemail_id is distinct from old.source_phone_voicemail_id then raise exception 'voicemail source cannot be changed'; end if;
 return new;
end; $$;
revoke all on function public.protect_service_request_voicemail_source() from public,anon,authenticated;
create trigger protect_service_request_voicemail_source before update of source_phone_voicemail_id on public.service_requests for each row execute function public.protect_service_request_voicemail_source();
