/*
  # Fix Critical RLS Security Issues
  
  1. Critical Security Issues
    - Tables with RLS enabled but no policies (bypass all access control)
    - Always-true RLS policies that bypass security checks
  
  2. Changes
    - Drop insecure always-true policies
    - Add proper restrictive policies to RLS-enabled tables without policies
    - Ensure all policies have proper authentication and authorization checks
  
  3. Security
    - All policies now check auth.uid() or role-based permissions
    - No policy allows unrestricted access via USING (true)
    - Tables with RLS enabled now have appropriate policies
*/

-- First, let's check if customers table exists and has RLS enabled
DO $$
BEGIN
  -- If customers table exists with RLS enabled but no policies, add restrictive policies
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'customers'
  ) THEN
    -- Drop any always-true policies on customers if they exist
    DROP POLICY IF EXISTS "Enable read access for all users" ON customers;
    DROP POLICY IF EXISTS "Enable insert for all users" ON customers;
    DROP POLICY IF EXISTS "Enable update for all users" ON customers;
    
    -- Drop existing policies to recreate them properly
    DROP POLICY IF EXISTS "Users can view customers in their organization" ON customers;
    DROP POLICY IF EXISTS "Authorized users can insert customers" ON customers;
    DROP POLICY IF EXISTS "Authorized users can update customers" ON customers;
    DROP POLICY IF EXISTS "Authorized users can delete customers" ON customers;
    
    -- Add proper restrictive policies
    CREATE POLICY "Users can view customers in their organization"
      ON customers FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = customers.organization_id
        )
      );
    
    CREATE POLICY "Authorized users can insert customers"
      ON customers FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = customers.organization_id
          AND profiles.role IN ('admin', 'owner', 'sales', 'sales_v2', 'service_manager')
        )
      );
    
    CREATE POLICY "Authorized users can update customers"
      ON customers FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = customers.organization_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = customers.organization_id
        )
      );
    
    CREATE POLICY "Authorized users can delete customers"
      ON customers FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = customers.organization_id
          AND profiles.role IN ('admin', 'owner')
        )
      );
  END IF;
  
  -- If organization_secrets table exists with RLS enabled but no policies, add restrictive policies
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'organization_secrets'
  ) THEN
    -- Drop any always-true policies if they exist
    DROP POLICY IF EXISTS "Enable read access for all users" ON organization_secrets;
    DROP POLICY IF EXISTS "Enable insert for all users" ON organization_secrets;
    DROP POLICY IF EXISTS "Enable update for all users" ON organization_secrets;
    
    -- Drop existing policies to recreate them properly
    DROP POLICY IF EXISTS "Only admins can view organization secrets" ON organization_secrets;
    DROP POLICY IF EXISTS "Only admins can insert organization secrets" ON organization_secrets;
    DROP POLICY IF EXISTS "Only admins can update organization secrets" ON organization_secrets;
    DROP POLICY IF EXISTS "Only admins can delete organization secrets" ON organization_secrets;
    
    -- Add proper restrictive policies - only admins/owners can access secrets
    CREATE POLICY "Only admins can view organization secrets"
      ON organization_secrets FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = organization_secrets.organization_id
          AND profiles.role IN ('admin', 'owner')
        )
      );
    
    CREATE POLICY "Only admins can insert organization secrets"
      ON organization_secrets FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = organization_secrets.organization_id
          AND profiles.role IN ('admin', 'owner')
        )
      );
    
    CREATE POLICY "Only admins can update organization secrets"
      ON organization_secrets FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = organization_secrets.organization_id
          AND profiles.role IN ('admin', 'owner')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = organization_secrets.organization_id
          AND profiles.role IN ('admin', 'owner')
        )
      );
    
    CREATE POLICY "Only admins can delete organization secrets"
      ON organization_secrets FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.organization_id = organization_secrets.organization_id
          AND profiles.role IN ('admin', 'owner')
        )
      );
  END IF;
END $$;