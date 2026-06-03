/*
  # Rename Contract Modules for Clarity

  1. Changes
    - Rename `contract_onboarding` module to `contract_management`
    - Update display name to "Contract Management"
    - Update description to reflect that it's for viewing and managing all contracts
  
  2. Purpose
    - Clarify that Contract Management is for viewing all contracts (kanban board)
    - Security Onboarding will be for creating new contracts (staff interface)
    - Customer portal is accessed via magic link only (no nav item)
*/

-- Update contract_onboarding to contract_management
UPDATE department_modules
SET 
  module_key = 'contract_management',
  display_name = 'Contract Management',
  description = 'View and manage all security contracts',
  updated_at = NOW()
WHERE module_key = 'contract_onboarding';
