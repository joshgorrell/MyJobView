/*
  # Move Proposals Tables to Public Schema

  ## Summary
  Moves all proposal-related tables from the `jobs` schema to the `public` schema to make them accessible via the Supabase PostgREST API.

  ## Changes Made
  1. **Schema Migration**
     - Moves `proposals`, `proposal_rooms`, `proposal_line_items`, and `products` tables from `jobs` schema to `public` schema
     - Preserves all existing data during migration
     - Maintains all constraints, indexes, and relationships
  
  2. **RLS Policies**
     - Re-creates all Row Level Security policies on the moved tables
     - Maintains same security rules as before
  
  ## Important Notes
  - All foreign key relationships are preserved
  - Data integrity is maintained throughout the migration
  - No data loss occurs during this operation
*/

-- Move products table to public schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'jobs' AND table_name = 'products'
  ) THEN
    -- Drop existing RLS policies
    DROP POLICY IF EXISTS "Users can delete company products" ON jobs.products;
    DROP POLICY IF EXISTS "Users can insert company products" ON jobs.products;
    DROP POLICY IF EXISTS "Users can update company products" ON jobs.products;
    DROP POLICY IF EXISTS "Users can view company products" ON jobs.products;
    
    -- Move table to public schema
    ALTER TABLE jobs.products SET SCHEMA public;
    
    -- Re-enable RLS
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
    
    -- Recreate RLS policies
    CREATE POLICY "Users can view company products"
      ON public.products FOR SELECT
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can insert company products"
      ON public.products FOR INSERT
      TO authenticated
      WITH CHECK ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can update company products"
      ON public.products FOR UPDATE
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can delete company products"
      ON public.products FOR DELETE
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
  END IF;
END $$;

-- Move proposals table to public schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'jobs' AND table_name = 'proposals'
  ) THEN
    -- Drop existing RLS policies
    DROP POLICY IF EXISTS "Users can delete company proposals" ON jobs.proposals;
    DROP POLICY IF EXISTS "Users can insert company proposals" ON jobs.proposals;
    DROP POLICY IF EXISTS "Users can update company proposals" ON jobs.proposals;
    DROP POLICY IF EXISTS "Users can view company proposals" ON jobs.proposals;
    
    -- Move table to public schema
    ALTER TABLE jobs.proposals SET SCHEMA public;
    
    -- Re-enable RLS
    ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
    
    -- Recreate RLS policies
    CREATE POLICY "Users can view company proposals"
      ON public.proposals FOR SELECT
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can insert company proposals"
      ON public.proposals FOR INSERT
      TO authenticated
      WITH CHECK ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can update company proposals"
      ON public.proposals FOR UPDATE
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can delete company proposals"
      ON public.proposals FOR DELETE
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
  END IF;
END $$;

-- Move proposal_rooms table to public schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'jobs' AND table_name = 'proposal_rooms'
  ) THEN
    -- Drop existing RLS policies
    DROP POLICY IF EXISTS "Users can delete proposal rooms" ON jobs.proposal_rooms;
    DROP POLICY IF EXISTS "Users can insert proposal rooms" ON jobs.proposal_rooms;
    DROP POLICY IF EXISTS "Users can update proposal rooms" ON jobs.proposal_rooms;
    DROP POLICY IF EXISTS "Users can view proposal rooms" ON jobs.proposal_rooms;
    
    -- Move table to public schema
    ALTER TABLE jobs.proposal_rooms SET SCHEMA public;
    
    -- Re-enable RLS
    ALTER TABLE public.proposal_rooms ENABLE ROW LEVEL SECURITY;
    
    -- Recreate RLS policies
    CREATE POLICY "Users can view proposal rooms"
      ON public.proposal_rooms FOR SELECT
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can insert proposal rooms"
      ON public.proposal_rooms FOR INSERT
      TO authenticated
      WITH CHECK ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can update proposal rooms"
      ON public.proposal_rooms FOR UPDATE
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can delete proposal rooms"
      ON public.proposal_rooms FOR DELETE
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
  END IF;
END $$;

-- Move proposal_line_items table to public schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'jobs' AND table_name = 'proposal_line_items'
  ) THEN
    -- Drop existing RLS policies
    DROP POLICY IF EXISTS "Users can delete proposal line items" ON jobs.proposal_line_items;
    DROP POLICY IF EXISTS "Users can insert proposal line items" ON jobs.proposal_line_items;
    DROP POLICY IF EXISTS "Users can update proposal line items" ON jobs.proposal_line_items;
    DROP POLICY IF EXISTS "Users can view proposal line items" ON jobs.proposal_line_items;
    
    -- Move table to public schema
    ALTER TABLE jobs.proposal_line_items SET SCHEMA public;
    
    -- Re-enable RLS
    ALTER TABLE public.proposal_line_items ENABLE ROW LEVEL SECURITY;
    
    -- Recreate RLS policies
    CREATE POLICY "Users can view proposal line items"
      ON public.proposal_line_items FOR SELECT
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can insert proposal line items"
      ON public.proposal_line_items FOR INSERT
      TO authenticated
      WITH CHECK ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can update proposal line items"
      ON public.proposal_line_items FOR UPDATE
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can delete proposal line items"
      ON public.proposal_line_items FOR DELETE
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL);
  END IF;
END $$;
