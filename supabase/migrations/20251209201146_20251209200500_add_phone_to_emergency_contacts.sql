/*
  # Add Phone Number to Emergency Contacts

  1. Changes
    - Add phone_number back to emergency contacts table
    - This is required for the monitoring station call list

  2. Notes
    - Monitoring station calls these contacts in priority order
    - Each contact needs: name, phone, and unique password for verification
*/

ALTER TABLE security_contract_emergency_contacts
ADD COLUMN IF NOT EXISTS phone_number text NOT NULL DEFAULT '';