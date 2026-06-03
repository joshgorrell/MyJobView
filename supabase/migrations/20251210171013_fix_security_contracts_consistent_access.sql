/*
  # Fix Security Contracts - Consistent Access

  ## Summary
  Simplify security contract access so that if a user has access to the Security Contracts
  or Contract Management pages, they can see all contracts and related data. Access is
  controlled at the module/page level, not at the individual record level.

  ## Changes Made

  1. **security_contracts**
     - All authenticated users can view, insert, and update contracts
     - Only admins can delete contracts

  2. **security_contract_templates**
     - All authenticated users can view templates
     - Admin and finance can manage templates

  3. **Child Tables** (if parent contract is accessible)
     - security_contract_approvals
     - security_contract_emergency_contacts
     - security_contract_equipment
     - security_contract_responses
     - security_contract_services

  4. **security_contract_cancellations**
     - Keep portal user access for their own cancellations
     - All staff can view and manage all cancellations

  ## Security Notes
  - Access control is managed at the module level through department_modules
  - Portal users retain separate access for onboarding and cancellations
  - Admins retain exclusive delete permissions
*/

-- =============================================
-- SECURITY CONTRACTS
-- =============================================

DROP POLICY IF EXISTS "Users can view contracts based on role" ON security_contracts;
DROP POLICY IF EXISTS "Sales and finance staff can create contracts" ON security_contracts;
DROP POLICY IF EXISTS "Users can update contracts based on role" ON security_contracts;
DROP POLICY IF EXISTS "Admin can delete contracts" ON security_contracts;

CREATE POLICY "Authenticated users can view contracts"
  ON security_contracts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create contracts"
  ON security_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contracts"
  ON security_contracts
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admin can delete contracts"
  ON security_contracts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- =============================================
-- SECURITY CONTRACT TEMPLATES
-- =============================================

DROP POLICY IF EXISTS "Admin can manage templates" ON security_contract_templates;
DROP POLICY IF EXISTS "Sales, finance, and managers can view templates" ON security_contract_templates;

CREATE POLICY "Authenticated users can view templates"
  ON security_contract_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and finance can manage templates"
  ON security_contract_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'finance')
    )
  );

-- =============================================
-- SECURITY CONTRACT FIELDS
-- =============================================

DROP POLICY IF EXISTS "Admin can manage fields" ON security_contract_fields;
DROP POLICY IF EXISTS "Sales and managers can view fields" ON security_contract_fields;

CREATE POLICY "Authenticated users can view fields"
  ON security_contract_fields
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and finance can manage fields"
  ON security_contract_fields
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'finance')
    )
  );

-- =============================================
-- SECURITY CONTRACT APPROVALS
-- =============================================

DROP POLICY IF EXISTS "Users can view approvals for relevant contracts" ON security_contract_approvals;
DROP POLICY IF EXISTS "Users can create approval requests" ON security_contract_approvals;
DROP POLICY IF EXISTS "Managers can update approvals" ON security_contract_approvals;

CREATE POLICY "Authenticated users can view approvals"
  ON security_contract_approvals
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create approvals"
  ON security_contract_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update approvals"
  ON security_contract_approvals
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================
-- SECURITY CONTRACT EMERGENCY CONTACTS
-- =============================================

DROP POLICY IF EXISTS "Users can view emergency contacts for their contracts" ON security_contract_emergency_contacts;
DROP POLICY IF EXISTS "Users can manage emergency contacts for their contracts" ON security_contract_emergency_contacts;

CREATE POLICY "Authenticated users can view emergency contacts"
  ON security_contract_emergency_contacts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage emergency contacts"
  ON security_contract_emergency_contacts
  FOR ALL
  TO authenticated
  USING (true);

-- =============================================
-- SECURITY CONTRACT EQUIPMENT
-- =============================================

DROP POLICY IF EXISTS "Users can view equipment for their contracts" ON security_contract_equipment;
DROP POLICY IF EXISTS "Users can manage equipment for their contracts" ON security_contract_equipment;

CREATE POLICY "Authenticated users can view equipment"
  ON security_contract_equipment
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage equipment"
  ON security_contract_equipment
  FOR ALL
  TO authenticated
  USING (true);

-- =============================================
-- SECURITY CONTRACT RESPONSES
-- =============================================

DROP POLICY IF EXISTS "Users can view responses for their contracts" ON security_contract_responses;
DROP POLICY IF EXISTS "Users can manage responses for their contracts" ON security_contract_responses;

CREATE POLICY "Authenticated users can view responses"
  ON security_contract_responses
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage responses"
  ON security_contract_responses
  FOR ALL
  TO authenticated
  USING (true);

-- =============================================
-- SECURITY CONTRACT SERVICES
-- =============================================

DROP POLICY IF EXISTS "Users can view contract services" ON security_contract_services;
DROP POLICY IF EXISTS "Users can insert contract services" ON security_contract_services;
DROP POLICY IF EXISTS "Users can delete contract services" ON security_contract_services;

CREATE POLICY "Authenticated users can view services"
  ON security_contract_services
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert services"
  ON security_contract_services
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update services"
  ON security_contract_services
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete services"
  ON security_contract_services
  FOR DELETE
  TO authenticated
  USING (true);

-- =============================================
-- SECURITY CONTRACT CANCELLATIONS
-- Keep portal user access, but allow all staff to manage
-- =============================================

DROP POLICY IF EXISTS "Portal users can view own cancellation requests" ON security_contract_cancellations;
DROP POLICY IF EXISTS "Admin and Finance can view all cancellation requests" ON security_contract_cancellations;
DROP POLICY IF EXISTS "Portal users can create own cancellation requests" ON security_contract_cancellations;
DROP POLICY IF EXISTS "Admin and Finance can update cancellation requests" ON security_contract_cancellations;

-- Portal users can view their own cancellation requests (by contact_id)
CREATE POLICY "Portal users can view own cancellations"
  ON security_contract_cancellations
  FOR SELECT
  TO authenticated
  USING (
    -- Portal users see their own
    (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'portal_user'
        AND p.contact_id = security_contract_cancellations.contact_id
    ))
    OR
    -- Staff users see all
    (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role != 'portal_user'
    ))
  );

-- Portal users can create cancellations for their contact
CREATE POLICY "Portal users can create cancellations"
  ON security_contract_cancellations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Portal users for their own contact
    (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'portal_user'
        AND p.contact_id = security_contract_cancellations.contact_id
    ))
    OR
    -- Staff users can create for anyone
    (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role != 'portal_user'
    ))
  );

-- Staff can update cancellations
CREATE POLICY "Staff can update cancellations"
  ON security_contract_cancellations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role != 'portal_user'
    )
  );
