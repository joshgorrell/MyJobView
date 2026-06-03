/*
  # Remove Always True RLS Policies (Critical Security Fix)
  
  1. Security Issue
    - Multiple tables have RLS policies with "true" conditions
    - These bypass all access control and allow any authenticated user full access
    - PostgreSQL combines PERMISSIVE policies with OR, so "true" overrides restrictive policies
    
  2. Tables Fixed (6 critical tables)
    - bug_reports: Remove overly permissive DELETE and UPDATE policies
    - proposal_area_templates: Remove overly permissive INSERT, UPDATE, DELETE policies
    - proposal_classes: Remove overly permissive INSERT, UPDATE, DELETE policies
    - punchlist_access_grants: Remove overly permissive INSERT, UPDATE, DELETE policies
    - punchlist_tasks: Remove overly permissive INSERT, UPDATE, DELETE policies
    - subscription_cancellations: Remove overly permissive INSERT, UPDATE, DELETE policies
    
  3. Impact
    - Each table retains more specific, restrictive policies
    - Access control now properly enforced based on user roles and ownership
    
  Note: These tables still have proper policies in place for legitimate access.
  The removed policies were redundant and dangerous.
*/

-- bug_reports: Remove always-true policies (keep the INSERT policy which has proper checks)
DROP POLICY IF EXISTS "Authenticated users can delete bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Authenticated users can update bug reports" ON public.bug_reports;

-- proposal_area_templates: Remove always-true policies (Sales users policy remains)
DROP POLICY IF EXISTS "Authenticated users can delete area templates" ON public.proposal_area_templates;
DROP POLICY IF EXISTS "Authenticated users can insert area templates" ON public.proposal_area_templates;
DROP POLICY IF EXISTS "Authenticated users can update area templates" ON public.proposal_area_templates;

-- proposal_classes: Remove always-true policies (keep view policy)
DROP POLICY IF EXISTS "All users can delete classes" ON public.proposal_classes;
DROP POLICY IF EXISTS "All users can insert classes" ON public.proposal_classes;
DROP POLICY IF EXISTS "All users can update classes" ON public.proposal_classes;

-- punchlist_access_grants: Remove always-true policies (Staff policies remain)
DROP POLICY IF EXISTS "All authenticated users can delete punchlist access grants" ON public.punchlist_access_grants;
DROP POLICY IF EXISTS "All authenticated users can create punchlist access grants" ON public.punchlist_access_grants;
DROP POLICY IF EXISTS "All authenticated users can update punchlist access grants" ON public.punchlist_access_grants;

-- punchlist_tasks: Remove always-true policies (Portal and Staff policies remain)
DROP POLICY IF EXISTS "All authenticated users can delete punchlist tasks" ON public.punchlist_tasks;
DROP POLICY IF EXISTS "All authenticated users can create punchlist tasks" ON public.punchlist_tasks;
DROP POLICY IF EXISTS "All authenticated users can update punchlist tasks" ON public.punchlist_tasks;

-- subscription_cancellations: Remove always-true policies (Portal and Admin policies remain)
DROP POLICY IF EXISTS "All authenticated users can delete subscription cancellations" ON public.subscription_cancellations;
DROP POLICY IF EXISTS "All authenticated users can create subscription cancellations" ON public.subscription_cancellations;
DROP POLICY IF EXISTS "All authenticated users can update subscription cancellations" ON public.subscription_cancellations;
DROP POLICY IF EXISTS "All authenticated users can view subscription cancellations" ON public.subscription_cancellations;
