/*
  # Fix All RLS Policies - Comprehensive Role Mapping
  
  1. Problem
    - Database has 5 roles: admin, finance, manager, sales, tech
    - Policies reference non-existent roles like: sales_manager, office_manager, 
      production_manager, warehouse_manager, service_manager, dispatcher, 
      technician, lead_technician, owner, portal_user
    - This breaks virtually all features since policies never grant access
  
  2. Role Mapping Strategy
    OLD ROLE → NEW ROLE
    - admin → admin (no change)
    - owner → admin
    - office_manager → manager
    - sales_manager → manager
    - production_manager → manager
    - warehouse_manager → manager
    - service_manager → manager
    - dispatcher → manager
    - project_manager → manager
    - technician → tech
    - lead_technician → tech
    - portal_user → Keep as is (special case for customer portal)
    - finance roles → finance
  
  3. Approach
    - Use dynamic SQL to find and replace role references in all policies
    - Recreate policies with corrected role arrays
*/

DO $$
DECLARE
  policy_record RECORD;
  new_qual TEXT;
  new_with_check TEXT;
  policy_def TEXT;
BEGIN
  -- Loop through all policies that have incorrect roles
  FOR policy_record IN 
    SELECT 
      schemaname,
      tablename,
      policyname,
      cmd,
      qual::text as qual_text,
      with_check::text as with_check_text,
      roles
    FROM pg_policies 
    WHERE schemaname = 'public'
      AND (
        qual::text ~ 'sales_manager|office_manager|production_manager|warehouse_manager|service_manager|dispatcher|project_manager|technician|lead_technician|owner'
        OR with_check::text ~ 'sales_manager|office_manager|production_manager|warehouse_manager|service_manager|dispatcher|project_manager|technician|lead_technician|owner'
      )
  LOOP
    -- Replace role names in USING clause
    new_qual := policy_record.qual_text;
    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, '''(sales_manager|office_manager|production_manager|warehouse_manager|service_manager|dispatcher|project_manager)''::text', '''manager''::text', 'g');
      new_qual := regexp_replace(new_qual, '''owner''::text', '''admin''::text', 'g');
      new_qual := regexp_replace(new_qual, '''(technician|lead_technician)''::text', '''tech''::text', 'g');
    END IF;
    
    -- Replace role names in WITH CHECK clause
    new_with_check := policy_record.with_check_text;
    IF new_with_check IS NOT NULL THEN
      new_with_check := regexp_replace(new_with_check, '''(sales_manager|office_manager|production_manager|warehouse_manager|service_manager|dispatcher|project_manager)''::text', '''manager''::text', 'g');
      new_with_check := regexp_replace(new_with_check, '''owner''::text', '''admin''::text', 'g');
      new_with_check := regexp_replace(new_with_check, '''(technician|lead_technician)''::text', '''tech''::text', 'g');
    END IF;
    
    -- Drop the old policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
      policy_record.policyname, 
      policy_record.schemaname, 
      policy_record.tablename
    );
    
    -- Recreate policy with corrected roles
    policy_def := format('CREATE POLICY %I ON %I.%I FOR %s TO %s',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename,
      policy_record.cmd,
      array_to_string(policy_record.roles, ', ')
    );
    
    IF new_qual IS NOT NULL THEN
      policy_def := policy_def || format(' USING (%s)', new_qual);
    END IF;
    
    IF new_with_check IS NOT NULL THEN
      policy_def := policy_def || format(' WITH CHECK (%s)', new_with_check);
    END IF;
    
    EXECUTE policy_def;
    
    RAISE NOTICE 'Fixed policy: %.% - %', policy_record.tablename, policy_record.policyname, policy_record.cmd;
    
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Role mapping complete!';
  RAISE NOTICE 'All policies now use: admin, finance, manager, sales, tech';
  RAISE NOTICE '========================================';
END $$;
