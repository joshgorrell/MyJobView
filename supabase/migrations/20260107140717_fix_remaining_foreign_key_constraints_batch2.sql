/*
  # Fix Remaining Foreign Key Constraints - Batch 2

  ## Summary
  Continues fixing NO ACTION foreign key constraints.

  ## Tables Fixed
  - gps_breadcrumbs
  - job_acceptance_log
  - job_completions
  - job_merges
  - job_photos
  - job_split_parts
  - job_splits
  - job_status_history
*/

-- Fix gps_breadcrumbs
DO $$
BEGIN
  ALTER TABLE gps_breadcrumbs DROP CONSTRAINT IF EXISTS gps_breadcrumbs_technician_id_fkey;
  ALTER TABLE gps_breadcrumbs ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE gps_breadcrumbs ADD CONSTRAINT gps_breadcrumbs_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix job_acceptance_log
DO $$
BEGIN
  ALTER TABLE job_acceptance_log DROP CONSTRAINT IF EXISTS job_acceptance_log_technician_id_fkey;
  ALTER TABLE job_acceptance_log ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE job_acceptance_log ADD CONSTRAINT job_acceptance_log_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix job_completions
DO $$
BEGIN
  ALTER TABLE job_completions DROP CONSTRAINT IF EXISTS job_completions_technician_id_fkey;
  ALTER TABLE job_completions ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE job_completions ADD CONSTRAINT job_completions_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix job_merges
DO $$
BEGIN
  ALTER TABLE job_merges DROP CONSTRAINT IF EXISTS job_merges_merged_by_fkey;
  ALTER TABLE job_merges ALTER COLUMN merged_by DROP NOT NULL;
  ALTER TABLE job_merges ADD CONSTRAINT job_merges_merged_by_fkey
    FOREIGN KEY (merged_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix job_photos
DO $$
BEGIN
  ALTER TABLE job_photos DROP CONSTRAINT IF EXISTS job_photos_technician_id_fkey;
  ALTER TABLE job_photos ADD CONSTRAINT job_photos_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix job_split_parts
DO $$
BEGIN
  ALTER TABLE job_split_parts DROP CONSTRAINT IF EXISTS job_split_parts_assigned_to_fkey;
  ALTER TABLE job_split_parts ADD CONSTRAINT job_split_parts_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix job_splits
DO $$
BEGIN
  ALTER TABLE job_splits DROP CONSTRAINT IF EXISTS job_splits_created_by_fkey;
  ALTER TABLE job_splits ALTER COLUMN created_by DROP NOT NULL;
  ALTER TABLE job_splits ADD CONSTRAINT job_splits_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix job_status_history
DO $$
BEGIN
  ALTER TABLE job_status_history DROP CONSTRAINT IF EXISTS job_status_history_technician_id_fkey;
  ALTER TABLE job_status_history ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE job_status_history ADD CONSTRAINT job_status_history_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;
