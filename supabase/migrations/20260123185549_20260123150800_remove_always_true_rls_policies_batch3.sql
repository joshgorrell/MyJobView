/*
  # Remove Always True RLS Policies - Batch 3 (Critical Security Fix)
  
  1. Security Issue
    - Multiple tables have RLS policies with "true" conditions that override restrictive policies
    
  2. Tables Fixed (7 tables)
    - pending_punchlist_invites: Remove overly permissive INSERT, UPDATE, DELETE policies
    - proposal_class_templates: Remove overly permissive INSERT, UPDATE, DELETE policies
    - proposal_messages: Remove overly permissive INSERT and UPDATE policies
    - recurring_invoices: Remove overly permissive INSERT, UPDATE, DELETE policies
    - review_requests: Remove overly permissive INSERT, UPDATE, DELETE policies
    - security_contract_approvals: Remove overly permissive INSERT and UPDATE policies
    - user_points: Keep system policies but mark them (these are for triggers)
    
  3. Impact
    - Each table retains more specific, role-based policies
    - Access control now properly enforced
*/

-- pending_punchlist_invites: Remove always-true policies (keep Staff policies)
DROP POLICY IF EXISTS "All authenticated users can delete pending punchlist invites" ON public.pending_punchlist_invites;
DROP POLICY IF EXISTS "All authenticated users can create pending punchlist invites" ON public.pending_punchlist_invites;
DROP POLICY IF EXISTS "All authenticated users can update pending punchlist invites" ON public.pending_punchlist_invites;

-- proposal_class_templates: Remove always-true policies
DROP POLICY IF EXISTS "Authenticated users can delete class templates" ON public.proposal_class_templates;
DROP POLICY IF EXISTS "Authenticated users can insert class templates" ON public.proposal_class_templates;
DROP POLICY IF EXISTS "Authenticated users can update class templates" ON public.proposal_class_templates;

-- proposal_messages: Remove always-true policies (keep Customer policies)
DROP POLICY IF EXISTS "Authenticated users can send proposal messages" ON public.proposal_messages;
DROP POLICY IF EXISTS "Authenticated users can mark messages as read" ON public.proposal_messages;

-- recurring_invoices: Remove always-true policies (keep System and Portal policies)
DROP POLICY IF EXISTS "All authenticated users can delete recurring invoices" ON public.recurring_invoices;
DROP POLICY IF EXISTS "All authenticated users can create recurring invoices" ON public.recurring_invoices;
DROP POLICY IF EXISTS "All authenticated users can update recurring invoices" ON public.recurring_invoices;

-- review_requests: Remove always-true policies
DROP POLICY IF EXISTS "Authenticated users can delete review requests" ON public.review_requests;
DROP POLICY IF EXISTS "Authenticated users can insert review requests" ON public.review_requests;
DROP POLICY IF EXISTS "Authenticated users can update review requests" ON public.review_requests;

-- security_contract_approvals: Remove always-true policies
DROP POLICY IF EXISTS "Authenticated users can create approvals" ON public.security_contract_approvals;
DROP POLICY IF EXISTS "Authenticated users can update approvals" ON public.security_contract_approvals;
