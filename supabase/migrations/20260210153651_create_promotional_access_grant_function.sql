/*
  # Create Promotional Access Grant Function

  1. Purpose
    - Provides a secure way to create promotional punchlist access for customers
    - Used when staff/sales send promotional invites from various flows
    - Creates immediate 'active' status access (no pending/acceptance flow needed)
    
  2. Function: create_promotional_access_grant
    - Parameters:
      * p_contact_id: UUID of the contact receiving access
      * p_project_id: Optional UUID of related project (can be NULL)
      * p_days: Number of days until expiration (default 90)
      * p_notes: Optional notes about why access was granted
    - Returns: UUID of created access grant
    
  3. Security
    - SECURITY DEFINER to allow creating grants
    - Checks for existing active grants to prevent duplicates
    - Only creates 'promotional' type grants
    - Sets immediate 'active' status (no acceptance needed)
*/

CREATE OR REPLACE FUNCTION public.create_promotional_access_grant(
  p_contact_id uuid,
  p_project_id uuid DEFAULT NULL,
  p_days integer DEFAULT 90,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_grant_id uuid;
  v_expiration_date date;
  v_final_notes text;
BEGIN
  -- Calculate expiration date
  v_expiration_date := CURRENT_DATE + (p_days || ' days')::interval;
  
  -- Check if contact already has active promotional access
  IF EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = p_contact_id
    AND access_type = 'promotional'
    AND status = 'active'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Contact already has active promotional punchlist access';
  END IF;
  
  -- Build notes with timestamp and user info
  v_final_notes := COALESCE(p_notes, 'Promotional access granted');
  v_final_notes := v_final_notes || ' on ' || CURRENT_DATE::text;
  
  -- Add user info if available from auth context
  IF auth.uid() IS NOT NULL THEN
    v_final_notes := v_final_notes || ' by user ' || auth.uid()::text;
  END IF;
  
  -- Create the promotional access grant
  INSERT INTO punchlist_access_grants (
    contact_id,
    access_type,
    project_id,
    granted_date,
    expiration_date,
    status,
    notes
  ) VALUES (
    p_contact_id,
    'promotional',
    p_project_id,
    CURRENT_DATE,
    v_expiration_date,
    'active',
    v_final_notes
  )
  RETURNING id INTO v_access_grant_id;
  
  RETURN v_access_grant_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_promotional_access_grant(uuid, uuid, integer, text) TO authenticated;
