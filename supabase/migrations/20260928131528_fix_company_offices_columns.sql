-- Add is_active column to company_offices (defaults to true for existing rows)
ALTER TABLE company_offices ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Add a name column as an alias for office_name to support queries that use 'name'
ALTER TABLE company_offices ADD COLUMN IF NOT EXISTS name text GENERATED ALWAYS AS (office_name) STORED;
