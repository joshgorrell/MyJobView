-- Full birth dates are sensitive: store them separately from broadly readable profiles.
create table if not exists public.employee_birth_dates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date not null,
  updated_at timestamptz not null default now(),
  constraint employee_birth_dates_reasonable check (birth_date >= date '1900-01-01' and birth_date <= current_date)
);
alter table public.employee_birth_dates enable row level security;
revoke all on public.employee_birth_dates from anon, authenticated;

create or replace function public.get_employee_birth_date(p_user_id uuid)
returns date language plpgsql stable security definer set search_path = public
as $$
declare result date;
begin
  if not exists (
    select 1 from public.profiles viewer
    join public.profiles subject on subject.id = p_user_id
    where viewer.id = auth.uid() and viewer.role = 'admin'
      and viewer.is_active and viewer.organization_id = subject.organization_id
  ) then raise exception 'Not authorized'; end if;
  select birth_date into result from public.employee_birth_dates where user_id = p_user_id;
  return result;
end $$;

create or replace function public.set_employee_birth_date(p_user_id uuid, p_birth_date date)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles viewer
    join public.profiles subject on subject.id = p_user_id
    where viewer.id = auth.uid() and viewer.role = 'admin'
      and viewer.is_active and viewer.organization_id = subject.organization_id
  ) then raise exception 'Not authorized'; end if;
  if p_birth_date is not null and (p_birth_date < date '1900-01-01' or p_birth_date > current_date)
  then raise exception 'Invalid birth date'; end if;
  if p_birth_date is null then
    delete from public.employee_birth_dates where user_id = p_user_id;
  else
    insert into public.employee_birth_dates(user_id, birth_date)
    values(p_user_id, p_birth_date)
    on conflict(user_id) do update set birth_date = excluded.birth_date, updated_at = now();
  end if;
end $$;
revoke all on function public.get_employee_birth_date(uuid) from public, anon;
revoke all on function public.set_employee_birth_date(uuid,date) from public, anon;
grant execute on function public.get_employee_birth_date(uuid) to authenticated;
grant execute on function public.set_employee_birth_date(uuid,date) to authenticated;

-- Preserve previously entered MM-DD values for annual greetings.
-- Full DOB cannot be inferred from MM-DD; admins must supply the year.
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
  left join public.employee_birth_dates b on b.user_id = p.id
  where p.is_active = true
    and p.employment_classification = 'employee'
    and p.birthday_visible = true
    and (
      to_char(b.birth_date, 'MM-DD') = to_char(now() at time zone 'America/Chicago', 'MM-DD')
      or (b.birth_date is null and p.birthday_mmdd = to_char(now() at time zone 'America/Chicago', 'MM-DD'))
      or (
        (to_char(b.birth_date, 'MM-DD') = '02-29' or (b.birth_date is null and p.birthday_mmdd = '02-29'))
        and to_char(now() at time zone 'America/Chicago', 'MM-DD') = '02-28'
        and extract(day from (date_trunc('year', now() at time zone 'America/Chicago') + interval '2 months - 1 day')) = 28
      )
    )
  order by p.full_name;
$$;
revoke all on function public.get_todays_company_birthdays() from public, anon;
grant execute on function public.get_todays_company_birthdays() to authenticated;
