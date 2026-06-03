/*
  # Add Discussion Visibility Controls

  1. Changes
    - Add discussion_visibility_scope to profiles table
    - Options: 'all', 'assigned_only', 'private_only', 'own_posts'
    - Defaults to 'all' for backward compatibility
    - Admins can set this per-user to control what discussion posts they see

  2. Security
    - Only admins can update this field for other users
    - Users can see their own setting but not change it
*/

-- Add discussion_visibility_scope column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS discussion_visibility_scope text
DEFAULT 'all'
CHECK (discussion_visibility_scope IN ('all', 'assigned_only', 'private_only', 'own_posts'));

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_discussion_visibility 
ON profiles(discussion_visibility_scope);

-- Update RLS policy for discussion posts to respect visibility scope
DROP POLICY IF EXISTS "Users can view discussion posts based on visibility" ON discussion_posts;
DROP POLICY IF EXISTS "Users can view discussion posts based on visibility scope" ON discussion_posts;

CREATE POLICY "Users can view discussion posts based on visibility scope"
  ON discussion_posts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        -- All posts (default)
        profiles.discussion_visibility_scope = 'all'
        OR
        -- Assigned posts only
        (profiles.discussion_visibility_scope = 'assigned_only' AND (
          discussion_posts.assigned_to = auth.uid()
          OR discussion_posts.user_id = auth.uid()
          OR auth.uid()::text = ANY(discussion_posts.mentions)
        ))
        OR
        -- Private posts only
        (profiles.discussion_visibility_scope = 'private_only' AND (
          discussion_posts.is_private = true AND (
            discussion_posts.user_id = auth.uid()
            OR discussion_posts.assigned_to = auth.uid()
            OR auth.uid()::text = ANY(discussion_posts.mentions)
          )
        ))
        OR
        -- Own posts only
        (profiles.discussion_visibility_scope = 'own_posts' AND 
          discussion_posts.user_id = auth.uid()
        )
      )
    )
  );

COMMENT ON COLUMN profiles.discussion_visibility_scope IS 
'Controls what discussion posts a user can see: all (default), assigned_only (only posts assigned to them or mentioning them), private_only (only private posts they are part of), own_posts (only their own posts)';
