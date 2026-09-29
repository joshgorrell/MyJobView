-- Update contract_management module display name and description
-- to clarify it is for security contract management, not onboarding
UPDATE department_modules
SET display_name = 'Security Contract Management',
    description = 'Review, approve, activate, and manage completed security monitoring contracts'
WHERE module_key = 'contract_management';
