/*
  # Fix Remaining Foreign Key Constraints - Batch 3

  ## Summary
  Fixes the last batch of NO ACTION foreign key constraints.

  ## Tables Fixed
  - jobs.appointments
  - jobs.message_threads
  - And any other remaining tables
*/

-- Fix appointments (in jobs schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'jobs' AND table_name = 'appointments'
  ) THEN
    ALTER TABLE jobs.appointments DROP CONSTRAINT IF EXISTS appointments_created_by_fkey;
    ALTER TABLE jobs.appointments ADD CONSTRAINT appointments_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix message_threads (in jobs schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'jobs' AND table_name = 'message_threads'
  ) THEN
    ALTER TABLE jobs.message_threads DROP CONSTRAINT IF EXISTS message_threads_created_by_fkey;
    ALTER TABLE jobs.message_threads ADD CONSTRAINT message_threads_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Check for any other NO ACTION constraints and log them
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN 
    SELECT 
      conrelid::regclass AS table_name,
      conname AS constraint_name
    FROM pg_constraint
    WHERE confrelid = 'profiles'::regclass
      AND confdeltype = 'a'
    LIMIT 50
  LOOP
    RAISE NOTICE 'Remaining NO ACTION constraint: %.%', constraint_record.table_name, constraint_record.constraint_name;
  END LOOP;
END $$;
