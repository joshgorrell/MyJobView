/*
  # Create Competitors and Prospect-Competitor Relationships Schema

  1. New Tables
    - `competitors` - Store competitor company information
    - `prospect_competitor_relationships` - Track which prospects use which competitors

  2. Security
    - Enable RLS on all tables
    - Only users with `can_view_prospects` permission can access competitor data
    - All CRUD operations require prospect permission

  3. Indexes
    - Foreign key indexes for performance
    - Search indexes on competitor name
*/

-- Create competitors table
CREATE TABLE IF NOT EXISTS public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  website text,
  notes text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT competitors_name_unique UNIQUE (name)
);

-- Create prospect-competitor relationships table
CREATE TABLE IF NOT EXISTS public.prospect_competitor_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('current_supplier', 'past_supplier', 'alternate_supplier', 'evaluating')),
  relationship_strength text CHECK (relationship_strength IN ('weak', 'moderate', 'strong', 'entrenched')),
  estimated_annual_spend numeric(12, 2),
  pain_points text[],
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_prospect_competitor UNIQUE (prospect_id, competitor_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_competitors_name ON public.competitors(name);
CREATE INDEX IF NOT EXISTS idx_competitors_is_active ON public.competitors(is_active);
CREATE INDEX IF NOT EXISTS idx_competitors_created_by ON public.competitors(created_by);

CREATE INDEX IF NOT EXISTS idx_prospect_competitor_prospect_id ON public.prospect_competitor_relationships(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_competitor_competitor_id ON public.prospect_competitor_relationships(competitor_id);
CREATE INDEX IF NOT EXISTS idx_prospect_competitor_relationship_type ON public.prospect_competitor_relationships(relationship_type);

-- Enable RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_competitor_relationships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for competitors table
-- Users with prospect permission can view all competitors
CREATE POLICY "Users with prospect permission can view competitors"
ON public.competitors
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
);

-- Users with prospect permission can insert competitors
CREATE POLICY "Users with prospect permission can insert competitors"
ON public.competitors
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
);

-- Users with prospect permission can update competitors
CREATE POLICY "Users with prospect permission can update competitors"
ON public.competitors
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
);

-- Users with prospect permission can delete competitors
CREATE POLICY "Users with prospect permission can delete competitors"
ON public.competitors
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
);

-- RLS Policies for prospect_competitor_relationships table
-- Users with prospect permission can view relationships
CREATE POLICY "Users with prospect permission can view relationships"
ON public.prospect_competitor_relationships
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
);

-- Users with prospect permission can insert relationships
CREATE POLICY "Users with prospect permission can insert relationships"
ON public.prospect_competitor_relationships
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
);

-- Users with prospect permission can update relationships
CREATE POLICY "Users with prospect permission can update relationships"
ON public.prospect_competitor_relationships
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
);

-- Users with prospect permission can delete relationships
CREATE POLICY "Users with prospect permission can delete relationships"
ON public.prospect_competitor_relationships
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.can_view_prospects = true
  )
);

-- Add updated_at trigger for competitors
CREATE TRIGGER update_competitors_updated_at
  BEFORE UPDATE ON public.competitors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for prospect_competitor_relationships
CREATE TRIGGER update_prospect_competitor_relationships_updated_at
  BEFORE UPDATE ON public.prospect_competitor_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_competitor_relationships TO authenticated;

-- Add comments
COMMENT ON TABLE public.competitors IS 'Stores information about competitor companies that prospects may currently use or have used in the past.';
COMMENT ON TABLE public.prospect_competitor_relationships IS 'Tracks which prospects use which competitors and details about those relationships.';
