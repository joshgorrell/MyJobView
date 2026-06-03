/*
  # Add shop_time and training appointment types

  Updates the appointments table CHECK constraint on appointment_type
  to allow two new values: 'shop_time' and 'training'.

  These correspond to the internal session types created via the
  Internal Sessions Management system.
*/

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_appointment_type_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_appointment_type_check
  CHECK (appointment_type = ANY (ARRAY[
    'customer_meeting'::text,
    'personal'::text,
    'work_order'::text,
    'shop_time'::text,
    'training'::text,
    'other'::text
  ]));
