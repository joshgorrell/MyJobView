-- Store only month and day, not a full date of birth.
alter table public.profiles
  add column if not exists birthday_mmdd text,
  add column if not exists birthday_visible boolean not null default true;

alter table public.profiles
  add constraint profiles_birthday_mmdd_valid
  check (
    birthday_mmdd is null or (
      birthday_mmdd ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      and to_char(to_date('2000-' || birthday_mmdd, 'YYYY-MM-DD'), 'MM-DD') = birthday_mmdd
    )
  );

-- The ticker only needs today's employee names. Do not expose all birthdays
-- through a broad cross-employee profile query.
create or replace function public.get_todays_company_birthdays()
returns table (full_name text)
language sql stable security definer set search_path = public
as $$
  select p.full_name::text
  from public.profiles p
  join public.profiles viewer
    on viewer.id = auth.uid()
   and viewer.is_active = true
   and viewer.organization_id = p.organization_id
  where p.is_active = true
    and p.employment_classification = 'employee'
    and p.birthday_visible = true
    and p.birthday_mmdd is not null
    and (
      p.birthday_mmdd = to_char(now() at time zone 'America/Chicago', 'MM-DD')
      or (
        p.birthday_mmdd = '02-29'
        and to_char(now() at time zone 'America/Chicago', 'MM-DD') = '02-28'
        and extract(day from (date_trunc('year', now() at time zone 'America/Chicago') + interval '2 months - 1 day')) = 28
      )
    )
  order by p.full_name;
$$;
revoke all on function public.get_todays_company_birthdays() from public, anon;
grant execute on function public.get_todays_company_birthdays() to authenticated;
