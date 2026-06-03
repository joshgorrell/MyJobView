/*
  # Add Proposal Messages Module to Admin Department

  ## Overview
  Creates a new admin module for monitoring all customer questions on proposals,
  allowing admins to ensure sales reps respond promptly to customer inquiries.

  ## Changes
  1. Adds "proposal_messages_admin" module to Admin department
  2. Sets appropriate access permissions (admin only)

  ## Purpose
  Provides centralized oversight of proposal Q&A conversations for:
  - Response time monitoring
  - Ensuring customer questions are answered promptly
  - Identifying proposals that need attention
*/

DO $$
DECLARE
  admin_dept_id uuid;
BEGIN
  -- Get admin department ID
  SELECT id INTO admin_dept_id FROM departments WHERE name = 'admin';

  -- Add Proposal Messages module to Admin department
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order)
  VALUES (
    admin_dept_id,
    'proposal_messages_admin',
    'Proposal Messages',
    'Monitor customer questions and response times',
    'MessageSquare',
    12
  )
  ON CONFLICT (department_id, module_key) DO NOTHING;

END $$;
