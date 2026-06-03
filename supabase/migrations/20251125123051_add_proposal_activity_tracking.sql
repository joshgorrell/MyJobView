/*
  # Add Proposal Activity Tracking

  1. New Table
    - `proposal_activity` - tracks all customer interactions with proposals
      - `id` (uuid, primary key)
      - `proposal_id` (uuid, references proposals)
      - `activity_type` (text) - 'viewed', 'downloaded', 'shared', 'accepted', 'declined'
      - `user_agent` (text) - browser/device info
      - `ip_address` (text) - customer IP
      - `duration_seconds` (integer) - time spent viewing
      - `metadata` (jsonb) - additional tracking data
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Allow insert from portal users and authenticated users
    - Allow select for authenticated users only

  3. Function
    - Helper function to log proposal activity
*/

CREATE TABLE IF NOT EXISTS proposal_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('viewed', 'downloaded', 'shared', 'accepted', 'declined', 'time_spent')),
  user_agent text,
  ip_address text,
  duration_seconds integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_proposal_activity_proposal_id ON proposal_activity(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_activity_created_at ON proposal_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_activity_type ON proposal_activity(activity_type);

-- Enable RLS
ALTER TABLE proposal_activity ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users can view all activity
CREATE POLICY "Authenticated users can view proposal activity"
  ON proposal_activity FOR SELECT
  TO authenticated
  USING (true);

-- Policies: Anyone can insert activity (for portal tracking)
CREATE POLICY "Anyone can log proposal activity"
  ON proposal_activity FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Function to get proposal activity summary
CREATE OR REPLACE FUNCTION get_proposal_activity_summary(p_proposal_id uuid)
RETURNS TABLE (
  total_views bigint,
  total_time_seconds bigint,
  last_viewed_at timestamptz,
  unique_sessions bigint,
  activity_timeline jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE activity_type = 'viewed') as total_views,
    SUM(duration_seconds) FILTER (WHERE activity_type = 'time_spent') as total_time_seconds,
    MAX(created_at) FILTER (WHERE activity_type = 'viewed') as last_viewed_at,
    COUNT(DISTINCT ip_address) as unique_sessions,
    jsonb_agg(
      jsonb_build_object(
        'type', activity_type,
        'created_at', created_at,
        'duration', duration_seconds
      ) ORDER BY created_at DESC
    ) FILTER (WHERE activity_type IN ('viewed', 'downloaded', 'accepted', 'declined')) as activity_timeline
  FROM proposal_activity
  WHERE proposal_id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
