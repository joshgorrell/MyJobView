/*
# Create state_library_index table

## Purpose
Global reference table tracking the MJV master rule library research status
for all 50 US states. This is metadata about the tax rule library itself,
not organization-scoped data. It is separate from any tax calculation tables
and does not affect any calculation path.

## New Tables
- `state_library_index`
  - `id` (uuid, primary key)
  - `state_code` (char(2), unique, not null) — USPS state code (e.g. 'KS', 'MO')
  - `state_name` (text, not null) — Full state name (e.g. 'Kansas')
  - `library_status` (text, not null, default 'not_researched') — One of:
    'verified' (MJV has published and reviewed rules for this state),
    'needs_review' (rules exist but need review),
    'not_researched' (MJV has not yet published rules)
  - `verified_at` (timestamptz, nullable) — When the state was marked verified
  - `notes` (text, nullable) — Optional admin notes about library status
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Security
- RLS enabled on state_library_index.
- All authenticated users can read (global reference data).
- Only authenticated users can insert/update (admin management).
- No deletes allowed via policy (reference data should not be deleted).

## Seeding
- All 50 US states seeded with full names.
- Kansas = 'verified' (verified_at = now)
- Missouri = 'needs_review'
- Remaining 48 states = 'not_researched'

## Important Notes
1. This table is purely additive metadata. It does NOT alter any tax
   calculation, proposal, invoice, or billing path.
2. No tax rule rows are created for any state. The index only tracks
   research status.
3. No unresolved_rule_count column at this stage. A simple six-classification
   count would be inaccurate for dimensional states like Kansas. A precise
   dimensional count requires infrastructure not justified yet.
4. Kansas remains 'verified' with its existing 22 active master rules.
5. Missouri remains 'needs_review'. No Missouri rules are activated.
6. The remaining 48 states are 'not_researched'. No fabricated rules.
*/

CREATE TABLE IF NOT EXISTS state_library_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code char(2) UNIQUE NOT NULL,
  state_name text NOT NULL,
  library_status text NOT NULL DEFAULT 'not_researched'
    CHECK (library_status IN ('verified', 'needs_review', 'not_researched')),
  verified_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE state_library_index ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read global reference data
DROP POLICY IF EXISTS "read_state_library_index" ON state_library_index;
CREATE POLICY "read_state_library_index"
  ON state_library_index FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users (admins) can insert new state records
DROP POLICY IF EXISTS "insert_state_library_index" ON state_library_index;
CREATE POLICY "insert_state_library_index"
  ON state_library_index FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users (admins) can update state records
DROP POLICY IF EXISTS "update_state_library_index" ON state_library_index;
CREATE POLICY "update_state_library_index"
  ON state_library_index FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

-- No delete policy: reference data should not be deleted via API

-- Seed all 50 US states
INSERT INTO state_library_index (state_code, state_name, library_status, verified_at)
VALUES
  ('AL', 'Alabama', 'not_researched', NULL),
  ('AK', 'Alaska', 'not_researched', NULL),
  ('AZ', 'Arizona', 'not_researched', NULL),
  ('AR', 'Arkansas', 'not_researched', NULL),
  ('CA', 'California', 'not_researched', NULL),
  ('CO', 'Colorado', 'not_researched', NULL),
  ('CT', 'Connecticut', 'not_researched', NULL),
  ('DE', 'Delaware', 'not_researched', NULL),
  ('FL', 'Florida', 'not_researched', NULL),
  ('GA', 'Georgia', 'not_researched', NULL),
  ('HI', 'Hawaii', 'not_researched', NULL),
  ('ID', 'Idaho', 'not_researched', NULL),
  ('IL', 'Illinois', 'not_researched', NULL),
  ('IN', 'Indiana', 'not_researched', NULL),
  ('IA', 'Iowa', 'not_researched', NULL),
  ('KS', 'Kansas', 'verified', now()),
  ('KY', 'Kentucky', 'not_researched', NULL),
  ('LA', 'Louisiana', 'not_researched', NULL),
  ('ME', 'Maine', 'not_researched', NULL),
  ('MD', 'Maryland', 'not_researched', NULL),
  ('MA', 'Massachusetts', 'not_researched', NULL),
  ('MI', 'Michigan', 'not_researched', NULL),
  ('MN', 'Minnesota', 'not_researched', NULL),
  ('MS', 'Mississippi', 'not_researched', NULL),
  ('MO', 'Missouri', 'needs_review', NULL),
  ('MT', 'Montana', 'not_researched', NULL),
  ('NE', 'Nebraska', 'not_researched', NULL),
  ('NV', 'Nevada', 'not_researched', NULL),
  ('NH', 'New Hampshire', 'not_researched', NULL),
  ('NJ', 'New Jersey', 'not_researched', NULL),
  ('NM', 'New Mexico', 'not_researched', NULL),
  ('NY', 'New York', 'not_researched', NULL),
  ('NC', 'North Carolina', 'not_researched', NULL),
  ('ND', 'North Dakota', 'not_researched', NULL),
  ('OH', 'Ohio', 'not_researched', NULL),
  ('OK', 'Oklahoma', 'not_researched', NULL),
  ('OR', 'Oregon', 'not_researched', NULL),
  ('PA', 'Pennsylvania', 'not_researched', NULL),
  ('RI', 'Rhode Island', 'not_researched', NULL),
  ('SC', 'South Carolina', 'not_researched', NULL),
  ('SD', 'South Dakota', 'not_researched', NULL),
  ('TN', 'Tennessee', 'not_researched', NULL),
  ('TX', 'Texas', 'not_researched', NULL),
  ('UT', 'Utah', 'not_researched', NULL),
  ('VT', 'Vermont', 'not_researched', NULL),
  ('VA', 'Virginia', 'not_researched', NULL),
  ('WA', 'Washington', 'not_researched', NULL),
  ('WV', 'West Virginia', 'not_researched', NULL),
  ('WI', 'Wisconsin', 'not_researched', NULL),
  ('WY', 'Wyoming', 'not_researched', NULL)
ON CONFLICT (state_code) DO NOTHING;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_state_library_status
  ON state_library_index (library_status);
