/*
  # Remove Always True RLS Policies - Batch 2 (Critical Security Fix)
  
  1. Security Issue
    - Multiple tables have RLS policies with "true" conditions that override restrictive policies
    - These allow unrestricted access to sensitive data
    
  2. Tables Fixed (8 tables)
    - contacts: Remove overly permissive INSERT and UPDATE policies
    - contracts: Remove overly permissive INSERT and UPDATE policies
    - customers: Remove ALL overly permissive policies (CRITICAL - allows anyone full access)
    - pipeline_stages: Remove ALL overly permissive policies
    - recurring_plans: Remove overly permissive INSERT, UPDATE, DELETE policies
    - recurring_subscriptions: Remove overly permissive INSERT, UPDATE, DELETE policies
    - security_contract_services: Remove overly permissive INSERT, UPDATE, DELETE policies
    - security_contracts: Remove overly permissive INSERT and UPDATE policies
    
  3. Impact
    - Each table retains more specific, role-based policies
    - Access control now properly enforced
*/

-- contacts: Remove always-true policies (keep role-based policies)
DROP POLICY IF EXISTS "Authenticated users can create contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON public.contacts;

-- contracts: Remove always-true policies (keep Admin policies)
DROP POLICY IF EXISTS "Authenticated users can insert contracts" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated users can update contracts" ON public.contracts;

-- customers: Remove ALL always-true policies (CRITICAL - this table allows anyone full access)
DROP POLICY IF EXISTS "Anyone can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can view customers" ON public.customers;

-- pipeline_stages: Remove ALL always-true policies
DROP POLICY IF EXISTS "Anyone can delete pipeline stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Anyone can insert pipeline stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Anyone can update pipeline stages" ON public.pipeline_stages;

-- recurring_plans: Remove always-true policies (keep role-based policies)
DROP POLICY IF EXISTS "All authenticated users can delete recurring plans" ON public.recurring_plans;
DROP POLICY IF EXISTS "All authenticated users can create recurring plans" ON public.recurring_plans;
DROP POLICY IF EXISTS "All authenticated users can update recurring plans" ON public.recurring_plans;

-- recurring_subscriptions: Remove always-true policies (keep role-based policies)
DROP POLICY IF EXISTS "All authenticated users can delete recurring subscriptions" ON public.recurring_subscriptions;
DROP POLICY IF EXISTS "All authenticated users can create recurring subscriptions" ON public.recurring_subscriptions;
DROP POLICY IF EXISTS "All authenticated users can update recurring subscriptions" ON public.recurring_subscriptions;
DROP POLICY IF EXISTS "All authenticated users can view recurring subscriptions" ON public.recurring_subscriptions;

-- security_contract_services: Remove always-true policies
DROP POLICY IF EXISTS "Authenticated users can delete services" ON public.security_contract_services;
DROP POLICY IF EXISTS "Authenticated users can insert services" ON public.security_contract_services;
DROP POLICY IF EXISTS "Authenticated users can update services" ON public.security_contract_services;

-- security_contracts: Remove always-true policies (keep role-based and magic link policies)
DROP POLICY IF EXISTS "Authenticated users can create contracts" ON public.security_contracts;
DROP POLICY IF EXISTS "Authenticated users can update contracts" ON public.security_contracts;
