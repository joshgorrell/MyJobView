/*
  # Remove Redundant Security Contracts Module
  
  1. Changes
    - Remove the redundant "security_contracts" module
    - Update "security_onboarding" description to clarify it handles pending contracts
    - Update "contract_management" description to clarify it handles completed contracts
  
  2. Module Structure After Changes
    - security_onboarding: Create new contracts and track pending ones (draft, pending_customer, pending_approval)
    - contract_management: View and manage completed contracts (approved, active, rejected, cancelled)
*/

-- Remove from user's starred modules if present
DELETE FROM user_starred_modules 
WHERE module_id IN (
  SELECT id FROM department_modules WHERE module_key = 'security_contracts'
);

-- Remove the redundant security_contracts module
DELETE FROM department_modules 
WHERE module_key = 'security_contracts';

-- Update security_onboarding description
UPDATE department_modules 
SET 
  display_name = 'Security Onboarding',
  description = 'Create and track new security contracts through the onboarding pipeline'
WHERE module_key = 'security_onboarding';

-- Update contract_management description
UPDATE department_modules 
SET 
  display_name = 'Contract Management',
  description = 'View and manage all completed security contracts (approved, active, rejected, cancelled)'
WHERE module_key = 'contract_management';
