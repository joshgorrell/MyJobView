alter table customer_locations
  add column if not exists location_type text;

alter table customer_locations
  drop constraint if exists customer_locations_location_type_check;

alter table customer_locations
  add constraint customer_locations_location_type_check
  check (
    location_type is null or location_type in (
      'residence',
      'vacation_home',
      'property',
      'building',
      'department',
      'branch',
      'office',
      'campus',
      'other'
    )
  );

comment on table customer_locations is
  'Optional locations/properties for any customer contact, person or business. Examples include homes, buildings, departments, branches, offices, and campuses.';

comment on column customer_locations.customer_contact_id is
  'Owning customer/contact. May reference either a person or business contact; location behavior is identical for both.';

comment on column customer_locations.location_type is
  'Optional descriptive type only; it does not change customer ownership or workflow.';
