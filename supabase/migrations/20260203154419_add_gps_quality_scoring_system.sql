/*
  # GPS Quality Scoring System

  1. Changes to daily_clock_entries
    - Add `clock_in_gps_quality_score` - Computed quality score 0-100
    - Add `clock_out_gps_quality_score` - Computed quality score 0-100

  2. Changes to time_entries
    - Add same quality score fields for job clocks

  3. Functions
    - `calculate_gps_quality_score` - Computes quality score based on accuracy, method, duration, and refinement

  Quality Score Algorithm:
  - Base score from accuracy: 100 for <10m, linear decay to 0 at 1000m
  - Method bonus: high_accuracy +10, network +5, cached +0, failed -50
  - Duration penalty: -1 point per second over 5 seconds
  - Refinement bonus: +15 if refined to better accuracy
*/

-- Create function to calculate GPS quality score
CREATE OR REPLACE FUNCTION calculate_gps_quality_score(
  p_accuracy real,
  p_method text,
  p_duration_ms integer,
  p_refined boolean,
  p_original_accuracy real
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_score integer := 0;
  v_accuracy_score integer := 0;
  v_method_bonus integer := 0;
  v_duration_penalty integer := 0;
  v_refinement_bonus integer := 0;
BEGIN
  -- Handle NULL or failed captures
  IF p_accuracy IS NULL OR p_method = 'failed' OR p_method = 'none' THEN
    RETURN 0;
  END IF;

  -- Calculate accuracy score (0-100)
  -- Excellent: <10m = 100, Good: <50m = 90+, Fair: <200m = 70+, Poor: <500m = 40+, Very Poor: >500m = 0-40
  IF p_accuracy < 10 THEN
    v_accuracy_score := 100;
  ELSIF p_accuracy < 50 THEN
    v_accuracy_score := 90 + ROUND((50 - p_accuracy) / 4)::integer;
  ELSIF p_accuracy < 200 THEN
    v_accuracy_score := 70 + ROUND((200 - p_accuracy) / 7.5)::integer;
  ELSIF p_accuracy < 500 THEN
    v_accuracy_score := 40 + ROUND((500 - p_accuracy) / 10)::integer;
  ELSIF p_accuracy < 1000 THEN
    v_accuracy_score := GREATEST(0, ROUND(40 - (p_accuracy - 500) / 12.5)::integer);
  ELSE
    v_accuracy_score := 0;
  END IF;

  -- Method bonus
  CASE p_method
    WHEN 'high_accuracy' THEN v_method_bonus := 10;
    WHEN 'network' THEN v_method_bonus := 5;
    WHEN 'cached' THEN v_method_bonus := 0;
    WHEN 'emergency' THEN v_method_bonus := -10;
    ELSE v_method_bonus := 0;
  END CASE;

  -- Duration penalty (penalize slow captures)
  IF p_duration_ms > 5000 THEN
    v_duration_penalty := -1 * LEAST(20, ((p_duration_ms - 5000) / 1000)::integer);
  END IF;

  -- Refinement bonus
  IF p_refined = true AND p_original_accuracy IS NOT NULL AND p_original_accuracy > p_accuracy * 1.5 THEN
    v_refinement_bonus := 15;
  END IF;

  -- Calculate total score
  v_score := v_accuracy_score + v_method_bonus + v_duration_penalty + v_refinement_bonus;

  -- Clamp to 0-100 range
  RETURN GREATEST(0, LEAST(100, v_score));
END;
$$;

-- Add quality score columns to daily_clock_entries
ALTER TABLE daily_clock_entries
ADD COLUMN IF NOT EXISTS clock_in_gps_quality_score integer,
ADD COLUMN IF NOT EXISTS clock_out_gps_quality_score integer;

-- Add quality score columns to time_entries
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS clock_in_gps_quality_score integer,
ADD COLUMN IF NOT EXISTS clock_out_gps_quality_score integer;

-- Add indexes for quality score filtering
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_gps_quality
ON daily_clock_entries (clock_in_gps_quality_score, clock_out_gps_quality_score)
WHERE clock_in_gps_quality_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_gps_quality
ON time_entries (clock_in_gps_quality_score, clock_out_gps_quality_score)
WHERE clock_in_gps_quality_score IS NOT NULL;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_gps_quality_score TO authenticated;