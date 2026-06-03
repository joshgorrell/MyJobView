/*
  # Fix award_points Function Column Name
  
  1. Issue
    - The award_points function references profiles.total_points
    - The actual column name is profiles.points_earned
    - This causes auto clock-out to fail when awarding penalty points
  
  2. Fix
    - Update award_points function to use correct column name
*/

CREATE OR REPLACE FUNCTION award_points(
  p_user_id uuid,
  p_points integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the user's total points using correct column name
  UPDATE profiles
  SET 
    points_earned = COALESCE(points_earned, 0) + p_points,
    updated_at = now()
  WHERE id = p_user_id;

  -- Log the points award in the points log table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'points_log') THEN
    INSERT INTO points_log (
      user_id,
      points,
      reason,
      created_at
    ) VALUES (
      p_user_id,
      p_points,
      p_reason,
      now()
    );
  END IF;
END;
$$;
