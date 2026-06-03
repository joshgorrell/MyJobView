/*
  # Create Award Points Function

  1. New Function
    - `award_points(p_user_id, p_points, p_reason)` - Awards points to a user
    - Updates the user's total_points in their profile
    - Creates a record in points_history table for tracking

  2. Purpose
    - Centralized function for awarding points
    - Maintains audit trail in points_history
    - Ensures atomic updates to point totals
*/

-- Create the award_points function
CREATE OR REPLACE FUNCTION award_points(
  p_user_id uuid,
  p_points integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the user's total points
  UPDATE profiles
  SET 
    total_points = COALESCE(total_points, 0) + p_points,
    updated_at = now()
  WHERE id = p_user_id;

  -- Record in points history
  INSERT INTO points_history (user_id, points_earned, reason, created_at)
  VALUES (p_user_id, p_points, p_reason, now());
END;
$$;