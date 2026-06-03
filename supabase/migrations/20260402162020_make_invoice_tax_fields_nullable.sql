/*
  # Make invoice tax_environment and tax_project_type nullable with defaults

  ## Problem
  Several invoice creation paths (CreateProgressInvoiceModal, CreateInvoiceModal)
  do not pass tax_environment and tax_project_type, causing NOT NULL violations.
  These fields should have sensible defaults so they don't block invoice creation.

  ## Changes
  - Add DEFAULT 'residential' to invoices.tax_environment
  - Add DEFAULT 'general_installation_repair' to invoices.tax_project_type
  - Keep both columns NOT NULL but with defaults so existing code that omits them still works
*/

ALTER TABLE invoices 
  ALTER COLUMN tax_environment SET DEFAULT 'residential',
  ALTER COLUMN tax_project_type SET DEFAULT 'general_installation_repair';
