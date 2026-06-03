/*
  # Fix Security Contract Services Missing Policies

  1. Issue
    - security_contract_services table only has SELECT policy
    - Missing INSERT, UPDATE, and DELETE policies
    - Causes permission denied error when creating contracts with services

  2. Changes
    - Add INSERT policy for authenticated users
    - Add UPDATE policy for authenticated users  
    - Add DELETE policy for authenticated users

  3. Security
    - Consistent with security_contracts access model
    - All authenticated users who can access the module can manage services
    - Access control handled at module level
*/

-- Drop any existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can insert services" ON security_contract_services;
DROP POLICY IF EXISTS "Authenticated users can update services" ON security_contract_services;
DROP POLICY IF EXISTS "Authenticated users can delete services" ON security_contract_services;

-- Create INSERT policy for security_contract_services
CREATE POLICY "Authenticated users can insert services"
  ON security_contract_services
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create UPDATE policy for security_contract_services
CREATE POLICY "Authenticated users can update services"
  ON security_contract_services
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create DELETE policy for security_contract_services
CREATE POLICY "Authenticated users can delete services"
  ON security_contract_services
  FOR DELETE
  TO authenticated
  USING (true);