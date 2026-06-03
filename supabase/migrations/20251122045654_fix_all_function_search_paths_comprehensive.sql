/*
  # Fix All Function Search Paths - Comprehensive Fix
  
  1. Security Issue
    - 107+ functions without explicit search_path are vulnerable to attacks
    - This migration fixes all remaining functions in one operation
  
  2. Approach
    - Use DO block to dynamically generate ALTER statements
    - Iterate through all functions needing search_path
    - Set search_path = public for each function
  
  3. Impact
    - Prevents search_path manipulation attacks
    - Ensures all functions reference correct schema
    - Required by Supabase security best practices
*/

DO $$
DECLARE
  func_record RECORD;
  func_signature TEXT;
BEGIN
  -- Loop through all functions that need search_path set
  FOR func_record IN 
    SELECT 
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as arguments
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL OR NOT ('search_path' = ANY(COALESCE(p.proconfig::text[], ARRAY[]::text[]))))
  LOOP
    -- Build full function signature
    func_signature := func_record.schema_name || '.' || func_record.function_name || '(' || func_record.arguments || ')';
    
    -- Set search_path for this function
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', func_signature);
    
    RAISE NOTICE 'Set search_path for: %', func_signature;
  END LOOP;
END $$;

-- Verify the fix worked
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND (p.proconfig IS NULL OR NOT ('search_path' = ANY(COALESCE(p.proconfig::text[], ARRAY[]::text[]))));
  
  IF remaining_count > 0 THEN
    RAISE WARNING 'Still % functions without search_path set', remaining_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All functions now have search_path set';
  END IF;
END $$;
