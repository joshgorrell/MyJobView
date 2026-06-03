/*
  # Add Admin Access to Sticky Notes

  1. Changes
    - Add admin policies to allow viewing all sticky notes
    - Add admin policies to allow editing/deactivating any sticky note
    - Maintain existing user-only access for non-admins

  2. Security
    - Admins can view all sticky notes
    - Admins can update any sticky note (for moderation/deactivation)
    - Regular users can only access their own notes
*/

-- Admin can view all sticky notes
CREATE POLICY "Admins can view all sticky notes"
  ON sticky_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admin can update any sticky note (for moderation)
CREATE POLICY "Admins can update any sticky note"
  ON sticky_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admin can delete any sticky note (for moderation)
CREATE POLICY "Admins can delete any sticky note"
  ON sticky_notes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );