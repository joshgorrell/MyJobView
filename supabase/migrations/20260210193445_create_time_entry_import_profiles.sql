/*
  # Time Entry Import Profiles and History

  1. New Tables
    - `time_entry_import_profiles`
      - Stores saved column mapping profiles for reusable CSV imports
      - Users can save mappings from frequently used CSV formats
      - Includes profile name, column mappings, and metadata
    
    - `time_entry_import_history`
      - Tracks all import operations with timestamps and stats
      - Allows rollback functionality by tracking batch IDs
      - Records success/failure counts and processing details

  2. Security
    - Enable RLS on both tables
    - Users can manage their own profiles
    - Import history is visible to admins and the importing user
    - Rollback requires admin or original importer permissions
*/

-- Create time_entry_import_profiles table
CREATE TABLE IF NOT EXISTS time_entry_import_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  column_mapping jsonb NOT NULL,
  file_format_hint text,
  last_used_at timestamptz,
  use_count integer DEFAULT 0,
  is_shared boolean DEFAULT false
);

-- Create time_entry_import_history table
CREATE TABLE IF NOT EXISTS time_entry_import_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  imported_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  batch_id uuid UNIQUE DEFAULT gen_random_uuid(),
  file_name text,
  profile_id uuid REFERENCES time_entry_import_profiles(id) ON DELETE SET NULL,
  total_rows integer NOT NULL,
  successful_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  processing_time_ms integer,
  error_details jsonb,
  rollback_at timestamptz,
  rollback_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed', 'rolled_back'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_import_profiles_created_by ON time_entry_import_profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_import_profiles_shared ON time_entry_import_profiles(is_shared) WHERE is_shared = true;
CREATE INDEX IF NOT EXISTS idx_import_history_batch_id ON time_entry_import_history(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_history_imported_by ON time_entry_import_history(imported_by);
CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON time_entry_import_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_history_status ON time_entry_import_history(status);

-- Add batch_id to time_entries for rollback tracking
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES time_entry_import_history(batch_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_import_batch ON time_entries(import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Enable RLS
ALTER TABLE time_entry_import_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entry_import_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for time_entry_import_profiles
CREATE POLICY "Users can view own and shared profiles"
  ON time_entry_import_profiles FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR is_shared = true);

CREATE POLICY "Users can create own profiles"
  ON time_entry_import_profiles FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own profiles"
  ON time_entry_import_profiles FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own profiles"
  ON time_entry_import_profiles FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policies for time_entry_import_history
CREATE POLICY "Users can view own import history"
  ON time_entry_import_history FOR SELECT
  TO authenticated
  USING (
    imported_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'production_manager', 'dispatch')
    )
  );

CREATE POLICY "Users can create import history"
  ON time_entry_import_history FOR INSERT
  TO authenticated
  WITH CHECK (imported_by = auth.uid());

CREATE POLICY "Users can update own import history"
  ON time_entry_import_history FOR UPDATE
  TO authenticated
  USING (
    imported_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    imported_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to rollback an import
CREATE OR REPLACE FUNCTION rollback_time_entry_import(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
  v_import_record record;
BEGIN
  -- Get the import record
  SELECT * INTO v_import_record
  FROM time_entry_import_history
  WHERE batch_id = p_batch_id
  AND status = 'completed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Import batch not found or already rolled back'
    );
  END IF;

  -- Check permission (must be admin or original importer)
  IF v_import_record.imported_by != auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Permission denied'
      );
    END IF;
  END IF;

  -- Delete time entries from this batch
  DELETE FROM time_entries
  WHERE import_batch_id = p_batch_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Update import history
  UPDATE time_entry_import_history
  SET 
    status = 'rolled_back',
    rollback_at = now(),
    rollback_by = auth.uid()
  WHERE batch_id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count
  );
END;
$$;
