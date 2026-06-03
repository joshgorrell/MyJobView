/*
  # Add Multi-Phase Tech Notes to Proposal Line Items

  1. New Tables
    - `proposal_line_item_labor_phases`
      - `id` (uuid, primary key)
      - `line_item_id` (uuid, references proposal_line_items)
      - `labor_phase_id` (uuid, references labor_phases)
      - `hours` (numeric, hours for this phase)
      - `tech_notes` (text, technician notes for this phase - NOT customer facing)
      - `sort_order` (integer)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes
    - Allows proposal line items to have multiple labor phases with tech notes per phase
    - Tech notes are internal only, never shown to customers
    - Each phase can have its own hours and notes for the install report
    - Maintains backward compatibility with single task_notes field

  3. Security
    - Enable RLS on proposal_line_item_labor_phases table
    - Authenticated users can manage line item labor phases
*/

-- Create proposal_line_item_labor_phases table
CREATE TABLE IF NOT EXISTS proposal_line_item_labor_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id uuid NOT NULL REFERENCES proposal_line_items(id) ON DELETE CASCADE,
  labor_phase_id uuid NOT NULL REFERENCES labor_phases(id) ON DELETE CASCADE,
  hours numeric NOT NULL DEFAULT 0,
  tech_notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_line_item_labor_phases_line_item ON proposal_line_item_labor_phases(line_item_id);
CREATE INDEX IF NOT EXISTS idx_line_item_labor_phases_labor_phase ON proposal_line_item_labor_phases(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_line_item_labor_phases_sort_order ON proposal_line_item_labor_phases(line_item_id, sort_order);

-- Enable RLS
ALTER TABLE proposal_line_item_labor_phases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Authenticated users can view line item labor phases" ON proposal_line_item_labor_phases;
CREATE POLICY "Authenticated users can view line item labor phases"
  ON proposal_line_item_labor_phases FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage line item labor phases" ON proposal_line_item_labor_phases;
CREATE POLICY "Authenticated users can manage line item labor phases"
  ON proposal_line_item_labor_phases FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_line_item_labor_phases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_line_item_labor_phases_updated_at ON proposal_line_item_labor_phases;
CREATE TRIGGER update_line_item_labor_phases_updated_at
  BEFORE UPDATE ON proposal_line_item_labor_phases
  FOR EACH ROW
  EXECUTE FUNCTION update_line_item_labor_phases_updated_at();

-- Add index to proposal_rooms for faster scope lookups
CREATE INDEX IF NOT EXISTS idx_proposal_rooms_proposal_id ON proposal_rooms(proposal_id);
