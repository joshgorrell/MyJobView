/*
  # Rename Commissions module in Finance department

  Updates the display name of the "commissions" module in the Finance department
  from "Commissions" to "Commissions Management" to clearly indicate this is the
  admin/finance management view, not a personal commissions tracker.
*/

UPDATE department_modules
SET display_name = 'Commissions Management'
WHERE module_key = 'commissions'
  AND department_id = (SELECT id FROM departments WHERE name = 'finance');
