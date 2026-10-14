/*\n  # Create Security Contracts & Onboarding System\n\n  ## Overview\n  Complete system for managing security alarm contracts with customer-facing completion portal,\n  manager approval workflow, and automatic recurring billing integration.\n\n  ## New Tables\n\n  ### `security_contract_templates`\n  Template definitions for different contract types\n  - `id` (uuid, primary key)\n  - `name` (text) - Template name (e.g., "Standard Residential", "Commercial")\n  - `description` (text)\n  - `is_active` (boolean) - Whether template is currently in use\n  - `requires_approval` (boolean) - Whether contracts need manager approval\n  - `approval_role` (text) - Which role can approve (e.g., "sales_manager")\n  - `auto_create_subscription` (boolean) - Auto-create recurring billing\n  - `default_billing_plan_id` (uuid) - Link to recurring_plans\n  - `contract_terms` (text) - Legal terms and conditions\n  - `created_at` (timestamptz)\n  - `updated_at` (timestamptz)\n\n  ### `security_contract_fields`\n  Dynamic field definitions for contract forms\n  - `id` (uuid, primary key)\n  - `template_id` (uuid) - Link to template\n  - `section` (text) - Field grouping (e.g., "customer_info", "property_info", "equipment", "emergency_contacts")\n  - `field_name` (text) - Internal field identifier\n  - `field_label` (text) - Display label\n  - `field_type` (text) - text, number, date, email, phone, signature, checkbox, select, textarea\n  - `field_options` (jsonb) - For select fields: {options: ["Option 1", "Option 2"]}\n  - `is_required` (boolean)\n  - `is_pre_fillable` (boolean) - Can sales staff pre-fill this field\n  - `pre_fill_source` (text) - Source for pre-fill: contact.field_name, custom\n  - `placeholder_text` (text)\n  - `help_text` (text)\n  - `validation_rules` (jsonb) - {min: 5, max: 100, pattern: "regex"}\n  - `display_order` (integer)\n  - `created_at` (timestamptz)\n\n  ### `security_contracts`\n  Main contract records\n  - `id` (uuid, primary key)\n  - `contract_number` (text, unique) - Auto-generated: SC-YYYY-NNNNN\n  - `template_id` (uuid) - Which template was used\n  - `contact_id` (uuid) - Link to contacts table\n  - `created_by_user_id` (uuid) - Sales staff who initiated\n  - `status` (text) - draft, pending_customer, customer_completed, pending_approval, approved, rejected, active, cancelled\n  - `invitation_sent_at` (timestamptz)\n  - `customer_completed_at` (timestamptz)\n  - `approved_at` (timestamptz)\n  - `approved_by_user_id` (uuid)\n  - `rejection_reason` (text)\n  - `activated_at` (timestamptz)\n  - `subscription_id` (uuid) - Link to recurring_subscriptions when activated\n  - `customer_signature` (text) - Base64 encoded signature image\n  - `customer_signature_date` (timestamptz)\n  - `customer_ip_address` (text) - For legal audit trail\n  - `magic_link_token` (uuid) - Secure token for customer portal access\n  - `magic_link_expires_at` (timestamptz)\n  - `notes` (text) - Internal notes\n  - `created_at` (timestamptz)\n  - `updated_at` (timestamptz)\n\n  ### `security_contract_responses`\n  Customer/staff responses to contract fields\n  - `id` (uuid, primary key)\n  - `contract_id` (uuid)\n  - `field_id` (uuid)\n  - `field_value` (text) - Actual response value\n  - `filled_by` (text) - 'sales_staff' or 'customer'\n  - `filled_at` (timestamptz)\n  - `created_at` (timestamptz)\n  - `updated_at` (timestamptz)\n\n  ### `security_contract_equipment`\n  Equipment/systems being monitored\n  - `id` (uuid, primary key)\n  - `contract_id` (uuid)\n  - `equipment_type` (text) - door, window, motion, glass_break, smoke, co, camera, keypad, etc.\n  - `location` (text) - Where installed (e.g., "Front Door", "Master Bedroom Window")\n  - `quantity` (integer)\n  - `zone_number` (text)\n  - `notes` (text)\n  - `created_at` (timestamptz)\n\n  ### `security_contract_emergency_contacts`\n  Emergency contact information\n  - `id` (uuid, primary key)\n  - `contract_id` (uuid)\n  - `contact_name` (text)\n  - `relationship` (text)\n  - `phone_number` (text)\n  - `can_authorize_entry` (boolean) - Can they authorize service entry\n  - `priority_order` (integer) - Call order in emergency\n  - `notes` (text)\n  - `created_at` (timestamptz)\n  - `updated_at` (timestamptz)\n\n  ### `security_contract_approvals`\n  Approval workflow tracking\n  - `id` (uuid, primary key)\n  - `contract_id` (uuid)\n  - `requested_at` (timestamptz)\n  - `requested_by_user_id` (uuid)\n  - `reviewed_at` (timestamptz)\n  - `reviewed_by_user_id` (uuid)\n  - `status` (text) - pending, approved, rejected, changes_requested\n  - `comments` (text)\n  - `created_at` (timestamptz)\n\n  ## Security\n  - Enable RLS on all tables\n  - Sales staff can create and view their own contracts\n  - Customers can view/edit only their contract via magic link\n  - Managers can approve contracts\n  - Admin has full access\n*/\n\n-- Create security_contract_templates table\nCREATE TABLE IF NOT EXISTS security_contract_templates (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  name text NOT NULL,\n  description text,\n  is_active boolean DEFAULT true,\n  requires_approval boolean DEFAULT true,\n  approval_role text DEFAULT 'sales_manager',\n  auto_create_subscription boolean DEFAULT true,\n  default_billing_plan_id uuid REFERENCES recurring_plans(id),\n  contract_terms text,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)

\n\n-- Create security_contract_fields table\nCREATE TABLE IF NOT EXISTS security_contract_fields (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  template_id uuid REFERENCES security_contract_templates(id) ON DELETE CASCADE,\n  section text NOT NULL,\n  field_name text NOT NULL,\n  field_label text NOT NULL,\n  field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'email', 'phone', 'signature', 'checkbox', 'select', 'textarea')),\n  field_options jsonb,\n  is_required boolean DEFAULT false,\n  is_pre_fillable boolean DEFAULT false,\n  pre_fill_source text,\n  placeholder_text text,\n  help_text text,\n  validation_rules jsonb,\n  display_order integer DEFAULT 0,\n  created_at timestamptz DEFAULT now()\n)

\n\n-- Create security_contracts table\nCREATE TABLE IF NOT EXISTS security_contracts (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  contract_number text UNIQUE,\n  template_id uuid REFERENCES security_contract_templates(id),\n  contact_id uuid REFERENCES contacts(id),\n  created_by_user_id uuid REFERENCES auth.users(id),\n  status text DEFAULT 'draft' CHECK (status IN ('draft', 'pending_customer', 'customer_completed', 'pending_approval', 'approved', 'rejected', 'active', 'cancelled')),\n  invitation_sent_at timestamptz,\n  customer_completed_at timestamptz,\n  approved_at timestamptz,\n  approved_by_user_id uuid REFERENCES auth.users(id),\n  rejection_reason text,\n  activated_at timestamptz,\n  subscription_id uuid REFERENCES recurring_subscriptions(id),\n  customer_signature text,\n  customer_signature_date timestamptz,\n  customer_ip_address text,\n  magic_link_token uuid DEFAULT gen_random_uuid(),\n  magic_link_expires_at timestamptz,\n  notes text,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)

\n\n-- Create security_contract_responses table\nCREATE TABLE IF NOT EXISTS security_contract_responses (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  contract_id uuid REFERENCES security_contracts(id) ON DELETE CASCADE,\n  field_id uuid REFERENCES security_contract_fields(id),\n  field_value text,\n  filled_by text CHECK (filled_by IN ('sales_staff', 'customer')),\n  filled_at timestamptz DEFAULT now(),\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now(),\n  UNIQUE(contract_id, field_id)\n)

\n\n-- Create security_contract_equipment table\nCREATE TABLE IF NOT EXISTS security_contract_equipment (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  contract_id uuid REFERENCES security_contracts(id) ON DELETE CASCADE,\n  equipment_type text NOT NULL,\n  location text NOT NULL,\n  quantity integer DEFAULT 1,\n  zone_number text,\n  notes text,\n  created_at timestamptz DEFAULT now()\n)

\n\n-- Create security_contract_emergency_contacts table\nCREATE TABLE IF NOT EXISTS security_contract_emergency_contacts (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  contract_id uuid REFERENCES security_contracts(id) ON DELETE CASCADE,\n  contact_name text NOT NULL,\n  relationship text,\n  phone_number text NOT NULL,\n  can_authorize_entry boolean DEFAULT false,\n  priority_order integer DEFAULT 1,\n  notes text,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)

\n\n-- Create security_contract_approvals table\nCREATE TABLE IF NOT EXISTS security_contract_approvals (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  contract_id uuid REFERENCES security_contracts(id) ON DELETE CASCADE,\n  requested_at timestamptz DEFAULT now(),\n  requested_by_user_id uuid REFERENCES auth.users(id),\n  reviewed_at timestamptz,\n  reviewed_by_user_id uuid REFERENCES auth.users(id),\n  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),\n  comments text,\n  created_at timestamptz DEFAULT now()\n)

\n\n-- Create indexes for foreign keys and common queries\nCREATE INDEX IF NOT EXISTS idx_security_contract_fields_template ON security_contract_fields(template_id)

\nCREATE INDEX IF NOT EXISTS idx_security_contracts_template ON security_contracts(template_id)

\nCREATE INDEX IF NOT EXISTS idx_security_contracts_contact ON security_contracts(contact_id)

\nCREATE INDEX IF NOT EXISTS idx_security_contracts_created_by ON security_contracts(created_by_user_id)

\nCREATE INDEX IF NOT EXISTS idx_security_contracts_status ON security_contracts(status)

\nCREATE INDEX IF NOT EXISTS idx_security_contracts_magic_link ON security_contracts(magic_link_token)

\nCREATE INDEX IF NOT EXISTS idx_security_contract_responses_contract ON security_contract_responses(contract_id)

\nCREATE INDEX IF NOT EXISTS idx_security_contract_equipment_contract ON security_contract_equipment(contract_id)

\nCREATE INDEX IF NOT EXISTS idx_security_contract_emergency_contacts_contract ON security_contract_emergency_contacts(contract_id)

\nCREATE INDEX IF NOT EXISTS idx_security_contract_approvals_contract ON security_contract_approvals(contract_id)

\nCREATE INDEX IF NOT EXISTS idx_security_contract_approvals_status ON security_contract_approvals(status)

\n\n-- Enable RLS\nALTER TABLE security_contract_templates ENABLE ROW LEVEL SECURITY

\nALTER TABLE security_contract_fields ENABLE ROW LEVEL SECURITY

\nALTER TABLE security_contracts ENABLE ROW LEVEL SECURITY

\nALTER TABLE security_contract_responses ENABLE ROW LEVEL SECURITY

\nALTER TABLE security_contract_equipment ENABLE ROW LEVEL SECURITY

\nALTER TABLE security_contract_emergency_contacts ENABLE ROW LEVEL SECURITY

\nALTER TABLE security_contract_approvals ENABLE ROW LEVEL SECURITY

\n\n-- RLS Policies for security_contract_templates\nCREATE POLICY "Sales and managers can view templates"\n  ON security_contract_templates FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('sales', 'sales_v2', 'sales_manager', 'admin', 'owner')\n    )\n  )

\n\nCREATE POLICY "Admin can manage templates"\n  ON security_contract_templates FOR ALL\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('admin', 'owner')\n    )\n  )

\n\n-- RLS Policies for security_contract_fields\nCREATE POLICY "Sales and managers can view fields"\n  ON security_contract_fields FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('sales', 'sales_v2', 'sales_manager', 'admin', 'owner')\n    )\n  )

\n\nCREATE POLICY "Admin can manage fields"\n  ON security_contract_fields FOR ALL\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('admin', 'owner')\n    )\n  )

\n\n-- RLS Policies for security_contracts\nCREATE POLICY "Users can view their own contracts"\n  ON security_contracts FOR SELECT\n  TO authenticated\n  USING (\n    created_by_user_id = auth.uid()\n    OR EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('sales_manager', 'admin', 'owner')\n    )\n  )

\n\nCREATE POLICY "Sales staff can create contracts"\n  ON security_contracts FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    created_by_user_id = auth.uid()\n    AND EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('sales', 'sales_v2', 'sales_manager', 'admin', 'owner')\n    )\n  )

\n\nCREATE POLICY "Users can update their own contracts"\n  ON security_contracts FOR UPDATE\n  TO authenticated\n  USING (\n    created_by_user_id = auth.uid()\n    OR EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('sales_manager', 'admin', 'owner')\n    )\n  )

\n\nCREATE POLICY "Admin can delete contracts"\n  ON security_contracts FOR DELETE\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('admin', 'owner')\n    )\n  )

\n\n-- RLS Policies for security_contract_responses\nCREATE POLICY "Users can view responses for their contracts"\n  ON security_contract_responses FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM security_contracts sc\n      WHERE sc.id = contract_id\n      AND (sc.created_by_user_id = auth.uid()\n        OR EXISTS (\n          SELECT 1 FROM profiles\n          WHERE profiles.id = auth.uid()\n          AND profiles.role IN ('sales_manager', 'admin', 'owner')\n        ))\n    )\n  )

\n\nCREATE POLICY "Users can manage responses for their contracts"\n  ON security_contract_responses FOR ALL\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM security_contracts sc\n      WHERE sc.id = contract_id\n      AND (sc.created_by_user_id = auth.uid()\n        OR EXISTS (\n          SELECT 1 FROM profiles\n          WHERE profiles.id = auth.uid()\n          AND profiles.role IN ('sales_manager', 'admin', 'owner')\n        ))\n    )\n  )

\n\n-- RLS Policies for security_contract_equipment\nCREATE POLICY "Users can view equipment for their contracts"\n  ON security_contract_equipment FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM security_contracts sc\n      WHERE sc.id = contract_id\n      AND (sc.created_by_user_id = auth.uid()\n        OR EXISTS (\n          SELECT 1 FROM profiles\n          WHERE profiles.id = auth.uid()\n          AND profiles.role IN ('sales_manager', 'admin', 'owner')\n        ))\n    )\n  )

\n\nCREATE POLICY "Users can manage equipment for their contracts"\n  ON security_contract_equipment FOR ALL\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM security_contracts sc\n      WHERE sc.id = contract_id\n      AND (sc.created_by_user_id = auth.uid()\n        OR EXISTS (\n          SELECT 1 FROM profiles\n          WHERE profiles.id = auth.uid()\n          AND profiles.role IN ('sales_manager', 'admin', 'owner')\n        ))\n    )\n  )

\n\n-- RLS Policies for security_contract_emergency_contacts\nCREATE POLICY "Users can view emergency contacts for their contracts"\n  ON security_contract_emergency_contacts FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM security_contracts sc\n      WHERE sc.id = contract_id\n      AND (sc.created_by_user_id = auth.uid()\n        OR EXISTS (\n          SELECT 1 FROM profiles\n          WHERE profiles.id = auth.uid()\n          AND profiles.role IN ('sales_manager', 'admin', 'owner')\n        ))\n    )\n  )

\n\nCREATE POLICY "Users can manage emergency contacts for their contracts"\n  ON security_contract_emergency_contacts FOR ALL\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM security_contracts sc\n      WHERE sc.id = contract_id\n      AND (sc.created_by_user_id = auth.uid()\n        OR EXISTS (\n          SELECT 1 FROM profiles\n          WHERE profiles.id = auth.uid()\n          AND profiles.role IN ('sales_manager', 'admin', 'owner')\n        ))\n    )\n  )

\n\n-- RLS Policies for security_contract_approvals\nCREATE POLICY "Users can view approvals for relevant contracts"\n  ON security_contract_approvals FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM security_contracts sc\n      WHERE sc.id = contract_id\n      AND (sc.created_by_user_id = auth.uid()\n        OR EXISTS (\n          SELECT 1 FROM profiles\n          WHERE profiles.id = auth.uid()\n          AND profiles.role IN ('sales_manager', 'admin', 'owner')\n        ))\n    )\n  )

\n\nCREATE POLICY "Users can create approval requests"\n  ON security_contract_approvals FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    requested_by_user_id = auth.uid()\n    AND EXISTS (\n      SELECT 1 FROM security_contracts sc\n      WHERE sc.id = contract_id\n      AND sc.created_by_user_id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Managers can update approvals"\n  ON security_contract_approvals FOR UPDATE\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('sales_manager', 'admin', 'owner')\n    )\n  )

\n\n-- Function to generate contract numbers\nCREATE OR REPLACE FUNCTION generate_security_contract_number()\nRETURNS TRIGGER\nSECURITY DEFINER\nSET search_path = public\nLANGUAGE plpgsql\nAS $$\nDECLARE\n  year_part text

\n  next_num integer

\n  new_number text

\nBEGIN\n  -- Only generate if contract_number is null\n  IF NEW.contract_number IS NOT NULL THEN\n    RETURN NEW

\n  END IF

\n\n  year_part := TO_CHAR(CURRENT_DATE, 'YYYY')

\n\n  -- Get the next number for this year with row-level lock\n  SELECT COALESCE(MAX(\n    CAST(\n      SUBSTRING(contract_number FROM 'SC-' || year_part || '-(\\d+)')\n      AS INTEGER\n    )\n  ), 0) + 1\n  INTO next_num\n  FROM security_contracts\n  WHERE contract_number ~ ('^SC-' || year_part || '-\\d+$')\n  FOR UPDATE

\n\n  -- Format: SC-YYYY-00001\n  new_number := 'SC-' || year_part || '-' || LPAD(next_num::text, 5, '0')

\n\n  NEW.contract_number := new_number

\n  RETURN NEW

\nEND

\n$$

\n\n-- Trigger to auto-generate contract numbers\nDROP TRIGGER IF EXISTS trigger_generate_security_contract_number ON security_contracts

\nCREATE TRIGGER trigger_generate_security_contract_number\n  BEFORE INSERT ON security_contracts\n  FOR EACH ROW\n  EXECUTE FUNCTION generate_security_contract_number()

\n\n-- Function to auto-create recurring subscription when contract is activated\nCREATE OR REPLACE FUNCTION create_subscription_from_contract()\nRETURNS TRIGGER\nSECURITY DEFINER\nSET search_path = public\nLANGUAGE plpgsql\nAS $$\nDECLARE\n  template_record RECORD

\n  contact_record RECORD

\n  new_subscription_id uuid

\nBEGIN\n  -- Only run when status changes to 'active' and subscription doesn't exist\n  IF NEW.status = 'active' AND OLD.status != 'active' AND NEW.subscription_id IS NULL THEN\n\n    -- Get template details\n    SELECT * INTO template_record\n    FROM security_contract_templates\n    WHERE id = NEW.template_id

\n\n    -- Only proceed if auto-create is enabled and plan is set\n    IF template_record.auto_create_subscription AND template_record.default_billing_plan_id IS NOT NULL THEN\n\n      -- Get contact details\n      SELECT * INTO contact_record\n      FROM contacts\n      WHERE id = NEW.contact_id

\n\n      -- Create the subscription\n      INSERT INTO recurring_subscriptions (\n        contact_id,\n        plan_id,\n        status,\n        start_date,\n        next_billing_date,\n        billing_cycle,\n        created_by_user_id,\n        notes\n      )\n      SELECT\n        NEW.contact_id,\n        template_record.default_billing_plan_id,\n        'active',\n        CURRENT_DATE,\n        CURRENT_DATE + (rp.billing_frequency || ' ' || rp.billing_period)::interval,\n        rp.billing_frequency || ' ' || rp.billing_period,\n        NEW.approved_by_user_id,\n        'Auto-created from Security Contract: ' || NEW.contract_number\n      FROM recurring_plans rp\n      WHERE rp.id = template_record.default_billing_plan_id\n      RETURNING id INTO new_subscription_id

\n\n      -- Link subscription to contract\n      NEW.subscription_id := new_subscription_id

\n    END IF

\n  END IF

\n\n  RETURN NEW

\nEND

\n$$

\n\n-- Trigger to auto-create subscriptions\nDROP TRIGGER IF EXISTS trigger_create_subscription_from_contract ON security_contracts

\nCREATE TRIGGER trigger_create_subscription_from_contract\n  BEFORE UPDATE ON security_contracts\n  FOR EACH ROW\n  WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')\n  EXECUTE FUNCTION create_subscription_from_contract()

\n\n-- Function to update timestamps\nCREATE OR REPLACE FUNCTION update_security_contract_timestamp()\nRETURNS TRIGGER\nSECURITY DEFINER\nSET search_path = public\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  NEW.updated_at = now()

\n  RETURN NEW

\nEND

\n$$

\n\n-- Add update timestamp triggers\nDROP TRIGGER IF EXISTS trigger_update_security_contract_templates_timestamp ON security_contract_templates

\nCREATE TRIGGER trigger_update_security_contract_templates_timestamp\n  BEFORE UPDATE ON security_contract_templates\n  FOR EACH ROW\n  EXECUTE FUNCTION update_security_contract_timestamp()

\n\nDROP TRIGGER IF EXISTS trigger_update_security_contracts_timestamp ON security_contracts

\nCREATE TRIGGER trigger_update_security_contracts_timestamp\n  BEFORE UPDATE ON security_contracts\n  FOR EACH ROW\n  EXECUTE FUNCTION update_security_contract_timestamp()

\n\nDROP TRIGGER IF EXISTS trigger_update_security_contract_responses_timestamp ON security_contract_responses

\nCREATE TRIGGER trigger_update_security_contract_responses_timestamp\n  BEFORE UPDATE ON security_contract_responses\n  FOR EACH ROW\n  EXECUTE FUNCTION update_security_contract_timestamp()

\n\nDROP TRIGGER IF EXISTS trigger_update_security_contract_emergency_contacts_timestamp ON security_contract_emergency_contacts

\nCREATE TRIGGER trigger_update_security_contract_emergency_contacts_timestamp\n  BEFORE UPDATE ON security_contract_emergency_contacts\n  FOR EACH ROW\n  EXECUTE FUNCTION update_security_contract_timestamp()

\n
