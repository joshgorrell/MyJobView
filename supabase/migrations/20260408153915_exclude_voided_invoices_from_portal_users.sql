/*
  # Exclude Voided Invoices from Customer Portal

  ## Summary
  Portal (customer-facing) users should never see voided invoices. This migration
  updates the three portal-user RLS SELECT policies that govern invoices, invoice
  line items, and payments to add a `status != 'void'` guard directly in the
  database policy. Enforcement at the RLS layer means voided invoices are
  completely invisible to portal users regardless of any client-side code.

  ## Changes

  ### Modified RLS Policies
  1. **invoices** - "Portal users can view their invoices"
     - Added `AND status != 'void'` to the USING clause
  2. **invoice_line_items** - "Portal users can view their invoice line items"
     - Inner subquery now excludes invoices with status = 'void'
  3. **payments** - "Portal users can view their payments"
     - Inner subquery now excludes invoices with status = 'void'

  ## Notes
  - Internal (non-portal) users are unaffected; they retain full access to voided invoices
  - Existing portal user sessions will immediately respect the updated policies
*/

-- 1. Invoices: drop and recreate the portal SELECT policy
DROP POLICY IF EXISTS "Portal users can view their invoices" ON invoices;

CREATE POLICY "Portal users can view their invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    status != 'void'
    AND contact_id IN (
      SELECT id FROM contacts WHERE portal_user_id = auth.uid()
    )
  );

-- 2. Invoice line items: drop and recreate the portal SELECT policy
DROP POLICY IF EXISTS "Portal users can view their invoice line items" ON invoice_line_items;

CREATE POLICY "Portal users can view their invoice line items"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT inv.id FROM invoices inv
      JOIN contacts c ON inv.contact_id = c.id
      WHERE c.portal_user_id = auth.uid()
        AND inv.status != 'void'
    )
  );

-- 3. Payments: drop and recreate the portal SELECT policy
DROP POLICY IF EXISTS "Portal users can view their payments" ON payments;

CREATE POLICY "Portal users can view their payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT inv.id FROM invoices inv
      JOIN contacts c ON inv.contact_id = c.id
      WHERE c.portal_user_id = auth.uid()
        AND inv.status != 'void'
    )
  );
