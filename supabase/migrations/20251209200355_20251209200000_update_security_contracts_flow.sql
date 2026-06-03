/*
  # Update Security Contracts Flow

  1. Changes
    - Remove equipment tracking (keep table but make it optional/unused)
    - Update emergency contacts to remove relationship and phone
    - Add password (codeword) field to emergency contacts for monitoring station authorization
    - Add payment method fields to contracts table for recurring billing

  2. Security
    - Maintain existing RLS policies
*/

-- Add password field to emergency contacts (codeword for monitoring station)
ALTER TABLE security_contract_emergency_contacts
DROP COLUMN IF EXISTS relationship,
DROP COLUMN IF EXISTS phone_number,
ADD COLUMN IF NOT EXISTS password_codeword text;

-- Add payment method fields to contracts table
ALTER TABLE security_contracts
ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('credit_card', 'ach')),
ADD COLUMN IF NOT EXISTS payment_token text,
ADD COLUMN IF NOT EXISTS last_four text,
ADD COLUMN IF NOT EXISTS qbo_payment_method_id text;