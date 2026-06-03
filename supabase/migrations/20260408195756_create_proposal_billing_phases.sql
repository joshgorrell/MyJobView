/*
  # Create Proposal Billing Phases Table

  ## Overview
  Adds a dedicated table for custom multi-phase billing schedules on proposals.
  When a proposal uses "custom" deposit type, users can define named billing phases
  (e.g., "At Acceptance", "Rough-In Complete", "Final") with either percentage or 
  fixed dollar amounts.

  ## New Tables
  - `proposal_billing_phases`
    - `id` (uuid, primary key)
    - `proposal_id` (uuid, FK to proposals, cascade delete)
    - `phase_order` (integer) - display order of the phase
    - `title` (text) - phase name shown to customer
    - `amount_type` (text) - 'percentage' or 'fixed'
    - `amount` (numeric) - the value (percent or dollars)
    - `notes` (text, nullable) - optional internal notes
    - `created_at`, `updated_at` timestamps

  ## Security
  - RLS enabled
  - Authenticated users can manage phases for proposals in their organization
*/

CREATE TABLE IF NOT EXISTS proposal_billing_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  phase_order integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  amount_type text NOT NULL DEFAULT 'percentage' CHECK (amount_type IN ('percentage', 'fixed')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_billing_phases_proposal_id 
  ON proposal_billing_phases(proposal_id);

CREATE INDEX IF NOT EXISTS idx_proposal_billing_phases_proposal_order 
  ON proposal_billing_phases(proposal_id, phase_order);

ALTER TABLE proposal_billing_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view billing phases for their org proposals"
  ON proposal_billing_phases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = proposal_billing_phases.proposal_id
        AND p.company_id = pr.organization_id
    )
  );

CREATE POLICY "Users can insert billing phases for their org proposals"
  ON proposal_billing_phases FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = proposal_billing_phases.proposal_id
        AND p.company_id = pr.organization_id
    )
  );

CREATE POLICY "Users can update billing phases for their org proposals"
  ON proposal_billing_phases FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = proposal_billing_phases.proposal_id
        AND p.company_id = pr.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = proposal_billing_phases.proposal_id
        AND p.company_id = pr.organization_id
    )
  );

CREATE POLICY "Users can delete billing phases for their org proposals"
  ON proposal_billing_phases FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = proposal_billing_phases.proposal_id
        AND p.company_id = pr.organization_id
    )
  );
