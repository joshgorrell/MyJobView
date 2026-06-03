/*
  # Add Proposal Activity View Tracking

  1. New Table
    - `proposal_activity_views` - Tracks when users last viewed a proposal's activity
      - `id` (uuid, primary key)
      - `proposal_id` (uuid, foreign key to proposals)
      - `user_id` (uuid, foreign key to auth.users)
      - `last_viewed_at` (timestamptz) - When user last viewed activity
      - `organization_id` (uuid, foreign key to organizations)
      - Unique constraint on (proposal_id, user_id)

  2. Security
    - Enable RLS
    - Users can only see/update their own activity views
    
  3. Function
    - `mark_proposal_activity_viewed()` - Upserts the view timestamp
*/

-- Create the table
CREATE TABLE IF NOT EXISTS proposal_activity_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(proposal_id, user_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_proposal_activity_views_proposal_id ON proposal_activity_views(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_activity_views_user_id ON proposal_activity_views(user_id);
CREATE INDEX IF NOT EXISTS idx_proposal_activity_views_organization_id ON proposal_activity_views(organization_id);

-- Enable RLS
ALTER TABLE proposal_activity_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see and manage their own activity views
CREATE POLICY "Users can view own activity views"
  ON proposal_activity_views
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own activity views"
  ON proposal_activity_views
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own activity views"
  ON proposal_activity_views
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Function to mark activity as viewed
CREATE OR REPLACE FUNCTION mark_proposal_activity_viewed(
  p_proposal_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
BEGIN
  -- Use provided user_id or get from auth context
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  -- Get organization_id from proposal
  SELECT organization_id INTO v_organization_id
  FROM proposals
  WHERE id = p_proposal_id;

  -- Upsert the view record
  INSERT INTO proposal_activity_views (proposal_id, user_id, organization_id, last_viewed_at)
  VALUES (p_proposal_id, v_user_id, v_organization_id, now())
  ON CONFLICT (proposal_id, user_id)
  DO UPDATE SET
    last_viewed_at = now(),
    updated_at = now();
END;
$$;