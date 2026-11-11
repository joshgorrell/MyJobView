-- Explicit voicemail department access, independent of broad MJV navigation roles.
-- No implicit access: staff must be granted a voicemail department by an admin.
create table public.phone_voicemail_department_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department text not null check (department in
    ('sales','service','projects','security','accounting','administration')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id,department)
);
alter table public.phone_voicemail_department_access enable row level security;
revoke all on public.phone_voicemail_department_access from anon,authenticated;
grant select,insert,update,delete on public.phone_voicemail_department_access to service_role;
create index phone_voicemail_department_access_user_idx
  on public.phone_voicemail_department_access(user_id,organization_id);
