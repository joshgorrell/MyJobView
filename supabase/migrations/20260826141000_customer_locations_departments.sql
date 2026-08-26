-- Customer locations / departments
-- Keeps the customer relationship on contacts while allowing proposals/projects/service
-- to point to the specific building, department, branch, or site where work occurs.

create table if not exists customer_locations (
  id uuid primary key default gen_random_uuid(),
  customer_contact_id uuid not null references contacts(id) on delete cascade,
  name text not null,
  department text,
  building_name text,
  street_address text,
  address_line_2 text,
  city text,
  state text,
  zip_code text,
  country text default 'USA',
  primary_contact_id uuid references contacts(id) on delete set null,
  phone text,
  email text,
  notes text,
  access_instructions text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_locations_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists idx_customer_locations_customer on customer_locations(customer_contact_id);
create index if not exists idx_customer_locations_active on customer_locations(customer_contact_id, is_active);
create index if not exists idx_customer_locations_primary_contact on customer_locations(primary_contact_id);

-- Only one default site per customer.
create unique index if not exists idx_customer_locations_one_default
  on customer_locations(customer_contact_id)
  where is_default = true and is_active = true;

alter table proposals add column if not exists customer_location_id uuid references customer_locations(id) on delete set null;
create index if not exists idx_proposals_customer_location on proposals(customer_location_id);

alter table projects add column if not exists customer_location_id uuid references customer_locations(id) on delete set null;
create index if not exists idx_projects_customer_location on projects(customer_location_id);

alter table work_orders add column if not exists customer_location_id uuid references customer_locations(id) on delete set null;
create index if not exists idx_work_orders_customer_location on work_orders(customer_location_id);

alter table service_requests add column if not exists customer_location_id uuid references customer_locations(id) on delete set null;
create index if not exists idx_service_requests_customer_location on service_requests(customer_location_id);

-- Keep updated_at current.
create or replace function touch_customer_location_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_customer_location_updated_at on customer_locations;
create trigger trg_touch_customer_location_updated_at
before update on customer_locations
for each row execute function touch_customer_location_updated_at();

-- If a site is made the default, clear the previous default for that customer.
create or replace function enforce_customer_location_default()
returns trigger
language plpgsql
as $$
begin
  if new.is_default = true and new.is_active = true then
    update customer_locations
      set is_default = false
      where customer_contact_id = new.customer_contact_id
        and id <> new.id
        and is_default = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_customer_location_default on customer_locations;
create trigger trg_enforce_customer_location_default
before insert or update of is_default, customer_contact_id, is_active on customer_locations
for each row execute function enforce_customer_location_default();

alter table customer_locations enable row level security;

-- Match the CRM's authenticated-user model; customer locations contain ordinary CRM data
-- and follow the same access boundary as contacts/proposals.
drop policy if exists "Authenticated users can view customer locations" on customer_locations;
create policy "Authenticated users can view customer locations"
on customer_locations for select
to authenticated
using (true);

drop policy if exists "Authenticated users can add customer locations" on customer_locations;
create policy "Authenticated users can add customer locations"
on customer_locations for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update customer locations" on customer_locations;
create policy "Authenticated users can update customer locations"
on customer_locations for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can delete customer locations" on customer_locations;
create policy "Authenticated users can delete customer locations"
on customer_locations for delete
to authenticated
using (true);
