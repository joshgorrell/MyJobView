/*
  # Deactivate Customer Questions Module (Consolidated into Messages)

  The Customer Questions page has been merged into the unified Messages page.
  This deactivates the `customer_questions` module in the Sales department
  so it no longer appears in the navigation sidebar. The module row is kept
  (not deleted) so it can be reactivated if ever needed.
*/

UPDATE department_modules
SET is_active = false
WHERE module_key = 'customer_questions';
