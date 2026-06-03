/*
  # Remove duplicate commission_management module

  The commission_management and commissions modules in the Finance department
  have been merged into a single unified Commissions page with role-based tabs.

  Changes:
  - Delete the commission_management department module entry (now redundant)
  - Any role_module_access rows pointing to commission_management are also removed via cascade
  - The commissions module remains as the single entry point for all commission functionality
*/

DELETE FROM department_modules
WHERE module_key = 'commission_management';
