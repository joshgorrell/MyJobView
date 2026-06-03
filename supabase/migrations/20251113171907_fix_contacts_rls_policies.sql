/*
  # Fix Contacts RLS Policies

  1. Changes
    - Remove duplicate overly permissive UPDATE policy
    - Keep only the restrictive policy that checks ownership/assignment
  
  2. Security
    - Users can only update contacts they created, are assigned to, or if they're admin
*/

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON contacts;

-- Keep the restrictive policy: "Users can update contacts they created or assigned to"
