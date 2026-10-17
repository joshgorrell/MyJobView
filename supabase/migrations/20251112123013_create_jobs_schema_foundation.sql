/*\n  # Create Jobs Module Foundation Schema\n\n  ## Overview\n  This migration creates the foundation for the Jobs module including proposals, projects, \n  invoices, payments, appointments, and commissions. It extends the existing CRM system\n  to support full job lifecycle management from proposal to payment.\n\n  ## New Tables Created\n\n  ### 1. `jobs.products`\n  Product catalog for proposals with pricing, categories, and Portal.io integration\n  - `id` (uuid, primary key)\n  - `company_id` (uuid, references auth.users)\n  - `name` (text)\n  - `description` (text)\n  - `category` (text)\n  - `sku` (text)\n  - `unit_price` (decimal)\n  - `cost` (decimal) - for profit calculations\n  - `unit` (text) - 'each', 'sq_ft', 'linear_ft', etc.\n  - `portal_io_product_id` (text) - optional Portal.io integration\n  - `portal_io_data` (jsonb) - cached Portal.io product data\n  - `is_active` (boolean)\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 2. `jobs.proposals`\n  Customer proposals with rooms, line items, and status tracking\n  - `id` (uuid, primary key)\n  - `company_id` (uuid)\n  - `contact_id` (uuid, references public.contacts)\n  - `lead_id` (uuid, references public.leads) - optional conversion tracking\n  - `proposal_number` (text, auto-generated)\n  - `title` (text)\n  - `status` (text) - 'draft', 'sent', 'viewed', 'approved', 'declined', 'expired'\n  - `valid_until` (date)\n  - `notes` (text) - internal notes\n  - `customer_notes` (text) - visible to customer\n  - `subtotal` (decimal)\n  - `tax_rate` (decimal)\n  - `tax_amount` (decimal)\n  - `total` (decimal)\n  - `deposit_percent` (decimal)\n  - `deposit_amount` (decimal)\n  - `created_by` (uuid, references public.profiles)\n  - `sent_at`, `viewed_at`, `approved_at`, `declined_at` (timestamptz)\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 3. `jobs.proposal_rooms`\n  Rooms/areas within proposals for organizing line items\n  - `id` (uuid, primary key)\n  - `proposal_id` (uuid, references jobs.proposals)\n  - `name` (text) - 'Living Room', 'Kitchen', etc.\n  - `description` (text) - scope of work\n  - `sort_order` (integer) - for drag-and-drop ordering\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 4. `jobs.proposal_line_items`\n  Individual products/services in proposal rooms\n  - `id` (uuid, primary key)\n  - `proposal_id` (uuid)\n  - `room_id` (uuid, references jobs.proposal_rooms)\n  - `product_id` (uuid, references jobs.products) - null for custom items\n  - `description` (text)\n  - `quantity` (decimal)\n  - `unit` (text)\n  - `unit_price` (decimal)\n  - `cost` (decimal) - for profit calculations\n  - `line_total` (decimal)\n  - `sort_order` (integer)\n  - `is_custom` (boolean) - true if not from catalog\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 5. `jobs.projects`\n  Approved proposals converted to active projects\n  - `id` (uuid, primary key)\n  - `company_id` (uuid)\n  - `contact_id` (uuid, references public.contacts)\n  - `proposal_id` (uuid, references jobs.proposals)\n  - `project_number` (text, auto-generated)\n  - `title` (text)\n  - `status` (text) - 'scheduled', 'in_progress', 'completed', 'cancelled'\n  - `office_id` (uuid, references public.company_offices)\n  - `project_manager_id` (uuid, references public.profiles)\n  - `start_date`, `end_date`, `completed_date` (date)\n  - `total_amount` (decimal)\n  - `notes` (text)\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 6. `jobs.invoices`\n  Customer invoices linked to projects\n  - `id` (uuid, primary key)\n  - `company_id` (uuid)\n  - `contact_id` (uuid, references public.contacts)\n  - `project_id` (uuid, references jobs.projects)\n  - `invoice_number` (text, auto-generated)\n  - `invoice_type` (text) - 'deposit', 'progress', 'final', 'standalone'\n  - `status` (text) - 'draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled'\n  - `issue_date`, `due_date` (date)\n  - `subtotal` (decimal)\n  - `tax_rate` (decimal)\n  - `tax_amount` (decimal)\n  - `total` (decimal)\n  - `amount_paid` (decimal)\n  - `balance_due` (decimal)\n  - `notes` (text)\n  - `qbo_invoice_id` (text) - QuickBooks sync\n  - `sent_at`, `paid_at` (timestamptz)\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 7. `jobs.payments`\n  Payment records for invoices\n  - `id` (uuid, primary key)\n  - `company_id` (uuid)\n  - `invoice_id` (uuid, references jobs.invoices)\n  - `contact_id` (uuid, references public.contacts)\n  - `payment_number` (text, auto-generated)\n  - `payment_method` (text) - 'cash', 'check', 'credit_card', 'ach', 'stripe'\n  - `amount` (decimal)\n  - `payment_date` (date)\n  - `reference_number` (text) - check number, transaction ID, etc.\n  - `stripe_payment_intent_id` (text)\n  - `qbo_payment_id` (text) - QuickBooks sync\n  - `notes` (text)\n  - `created_by` (uuid, references public.profiles)\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 8. `jobs.appointments`\n  Scheduled appointments for projects\n  - `id` (uuid, primary key)\n  - `company_id` (uuid)\n  - `project_id` (uuid, references jobs.projects)\n  - `contact_id` (uuid, references public.contacts)\n  - `title` (text)\n  - `appointment_type` (text) - 'consultation', 'measurement', 'installation', 'follow_up'\n  - `start_time`, `end_time` (timestamptz)\n  - `status` (text) - 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'\n  - `assigned_to` (uuid[], array of profile IDs)\n  - `location` (text)\n  - `notes` (text)\n  - `google_calendar_event_id` (text)\n  - `reminder_sent_at` (timestamptz)\n  - `created_by` (uuid, references public.profiles)\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 9. `jobs.commission_records`\n  Commission tracking for sales and project roles\n  - `id` (uuid, primary key)\n  - `company_id` (uuid)\n  - `profile_id` (uuid, references public.profiles)\n  - `source_type` (text) - 'proposal', 'project', 'invoice'\n  - `source_id` (uuid)\n  - `role` (text) - 'sales_rep', 'project_manager', 'designer', 'installer'\n  - `basis` (text) - 'gross', 'profit'\n  - `basis_amount` (decimal) - the amount commission is calculated on\n  - `commission_rate` (decimal)\n  - `commission_amount` (decimal)\n  - `status` (text) - 'pending', 'approved', 'paid'\n  - `paid_at` (timestamptz)\n  - `notes` (text)\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 10. `jobs.message_threads`\n  Communication threads for projects (internal/customer)\n  - `id` (uuid, primary key)\n  - `company_id` (uuid)\n  - `project_id` (uuid, references jobs.projects)\n  - `contact_id` (uuid, references public.contacts)\n  - `subject` (text)\n  - `thread_type` (text) - 'internal', 'customer'\n  - `status` (text) - 'open', 'closed'\n  - `created_by` (uuid, references public.profiles)\n  - `created_at`, `updated_at` (timestamptz)\n\n  ### 11. `jobs.messages`\n  Individual messages within threads\n  - `id` (uuid, primary key)\n  - `thread_id` (uuid, references jobs.message_threads)\n  - `sender_id` (uuid, references public.profiles)\n  - `message` (text)\n  - `is_internal` (boolean)\n  - `read_by` (uuid[]) - array of profile IDs who have read\n  - `created_at` (timestamptz)\n\n  ## Extended Tables\n\n  ### `public.profiles` - Added columns\n  - `commission_eligible` (boolean) - can earn commissions\n  - `commission_config` (jsonb) - default rates and settings\n  - `job_role` (text) - 'sales_rep', 'project_manager', 'technician', 'designer'\n\n  ### `public.contacts` - Added columns\n  - `billing_address` (jsonb) - structured address for invoicing\n  - `payment_terms` (text) - 'Net 30', 'Due on Receipt', etc.\n  - `credit_limit` (decimal) - optional credit limit\n\n  ### `public.company_settings` - Added columns\n  - `job_module_enabled` (boolean) - feature flag\n  - `job_module_settings` (jsonb) - commission defaults, tax rate, deposit %, etc.\n\n  ## Security\n  - Enable RLS on all new tables\n  - Policies ensure users can only access data from their company\n  - Authenticated users required for all operations\n  - Read/write permissions based on company_id matching\n\n  ## Important Notes\n  - All tables use `company_id` for multi-tenancy\n  - Decimal fields use (10,2) precision for currency\n  - Auto-generated numbers use format: PROP-001, PROJ-001, INV-001, etc.\n  - Timestamps use `timestamptz` for timezone support\n  - Foreign keys maintain referential integrity\n  - Indexes added for common query patterns\n*/\n\n-- Create jobs schema\nCREATE SCHEMA IF NOT EXISTS jobs

\n\n-- =====================================================\n-- EXTEND EXISTING TABLES\n-- =====================================================\n\n-- Extend public.profiles for job module\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'commission_eligible'\n  ) THEN\n    ALTER TABLE public.profiles ADD COLUMN commission_eligible BOOLEAN DEFAULT false

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'commission_config'\n  ) THEN\n    ALTER TABLE public.profiles ADD COLUMN commission_config JSONB DEFAULT '{}'

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'job_role'\n  ) THEN\n    ALTER TABLE public.profiles ADD COLUMN job_role TEXT

\n  END IF

\nEND $$

\n\n-- Extend public.contacts for job module\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'contacts' AND column_name = 'billing_address'\n  ) THEN\n    ALTER TABLE public.contacts ADD COLUMN billing_address JSONB

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'contacts' AND column_name = 'payment_terms'\n  ) THEN\n    ALTER TABLE public.contacts ADD COLUMN payment_terms TEXT DEFAULT 'Net 30'

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'contacts' AND column_name = 'credit_limit'\n  ) THEN\n    ALTER TABLE public.contacts ADD COLUMN credit_limit DECIMAL(10,2)

\n  END IF

\nEND $$

\n\n-- Extend public.company_settings for job module\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'company_settings' AND column_name = 'job_module_enabled'\n  ) THEN\n    ALTER TABLE public.company_settings ADD COLUMN job_module_enabled BOOLEAN DEFAULT false

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'company_settings' AND column_name = 'job_module_settings'\n  ) THEN\n    ALTER TABLE public.company_settings ADD COLUMN job_module_settings JSONB DEFAULT '{\n      "commission_defaults": {\n        "basis": "gross",\n        "rates": {\n          "sales_rep": 0.05,\n          "project_manager": 0.03,\n          "designer": 0.02,\n          "installer": 0.02\n        }\n      },\n      "tax_rate": 0.08,\n      "deposit_default_percent": 0.50,\n      "invoice_terms": "Net 30"\n    }'

\n  END IF

\nEND $$

\n\n-- =====================================================\n-- CREATE PRODUCTS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.products (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  company_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  description TEXT,\n  category TEXT,\n  sku TEXT,\n  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,\n  cost DECIMAL(10,2) DEFAULT 0,\n  unit TEXT DEFAULT 'each',\n  portal_io_product_id TEXT,\n  portal_io_data JSONB,\n  is_active BOOLEAN DEFAULT true,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now()\n)

\n\nCREATE INDEX IF NOT EXISTS idx_products_company ON jobs.products(company_id)

\nCREATE INDEX IF NOT EXISTS idx_products_category ON jobs.products(category)

\nCREATE INDEX IF NOT EXISTS idx_products_active ON jobs.products(is_active) WHERE is_active = true

\n\nALTER TABLE jobs.products ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view company products"\n  ON jobs.products FOR SELECT\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can insert company products"\n  ON jobs.products FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can update company products"\n  ON jobs.products FOR UPDATE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can delete company products"\n  ON jobs.products FOR DELETE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\n-- =====================================================\n-- CREATE PROPOSALS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.proposals (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  company_id UUID NOT NULL,\n  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,\n  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,\n  proposal_number TEXT NOT NULL,\n  title TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'draft',\n  valid_until DATE,\n  notes TEXT,\n  customer_notes TEXT,\n  subtotal DECIMAL(10,2) DEFAULT 0,\n  tax_rate DECIMAL(5,4) DEFAULT 0,\n  tax_amount DECIMAL(10,2) DEFAULT 0,\n  total DECIMAL(10,2) DEFAULT 0,\n  deposit_percent DECIMAL(5,2) DEFAULT 50,\n  deposit_amount DECIMAL(10,2) DEFAULT 0,\n  created_by UUID NOT NULL REFERENCES public.profiles(id),\n  sent_at TIMESTAMPTZ,\n  viewed_at TIMESTAMPTZ,\n  approved_at TIMESTAMPTZ,\n  declined_at TIMESTAMPTZ,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now(),\n  UNIQUE(company_id, proposal_number)\n)

\n\nCREATE INDEX IF NOT EXISTS idx_proposals_company ON jobs.proposals(company_id)

\nCREATE INDEX IF NOT EXISTS idx_proposals_contact ON jobs.proposals(contact_id)

\nCREATE INDEX IF NOT EXISTS idx_proposals_status ON jobs.proposals(status)

\nCREATE INDEX IF NOT EXISTS idx_proposals_created_by ON jobs.proposals(created_by)

\n\nALTER TABLE jobs.proposals ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view company proposals"\n  ON jobs.proposals FOR SELECT\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can insert company proposals"\n  ON jobs.proposals FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can update company proposals"\n  ON jobs.proposals FOR UPDATE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can delete company proposals"\n  ON jobs.proposals FOR DELETE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\n-- =====================================================\n-- CREATE PROPOSAL ROOMS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.proposal_rooms (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  proposal_id UUID NOT NULL REFERENCES jobs.proposals(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  description TEXT,\n  sort_order INTEGER DEFAULT 0,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now()\n)

\n\nCREATE INDEX IF NOT EXISTS idx_proposal_rooms_proposal ON jobs.proposal_rooms(proposal_id)

\nCREATE INDEX IF NOT EXISTS idx_proposal_rooms_sort ON jobs.proposal_rooms(proposal_id, sort_order)

\n\nALTER TABLE jobs.proposal_rooms ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view proposal rooms"\n  ON jobs.proposal_rooms FOR SELECT\n  TO authenticated\n  USING (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\nCREATE POLICY "Users can insert proposal rooms"\n  ON jobs.proposal_rooms FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\nCREATE POLICY "Users can update proposal rooms"\n  ON jobs.proposal_rooms FOR UPDATE\n  TO authenticated\n  USING (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )\n  WITH CHECK (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\nCREATE POLICY "Users can delete proposal rooms"\n  ON jobs.proposal_rooms FOR DELETE\n  TO authenticated\n  USING (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\n-- =====================================================\n-- CREATE PROPOSAL LINE ITEMS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.proposal_line_items (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  proposal_id UUID NOT NULL REFERENCES jobs.proposals(id) ON DELETE CASCADE,\n  room_id UUID REFERENCES jobs.proposal_rooms(id) ON DELETE CASCADE,\n  product_id UUID REFERENCES jobs.products(id) ON DELETE SET NULL,\n  description TEXT NOT NULL,\n  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,\n  unit TEXT DEFAULT 'each',\n  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,\n  cost DECIMAL(10,2) DEFAULT 0,\n  line_total DECIMAL(10,2) NOT NULL DEFAULT 0,\n  sort_order INTEGER DEFAULT 0,\n  is_custom BOOLEAN DEFAULT false,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now()\n)

\n\nCREATE INDEX IF NOT EXISTS idx_proposal_line_items_proposal ON jobs.proposal_line_items(proposal_id)

\nCREATE INDEX IF NOT EXISTS idx_proposal_line_items_room ON jobs.proposal_line_items(room_id)

\nCREATE INDEX IF NOT EXISTS idx_proposal_line_items_sort ON jobs.proposal_line_items(room_id, sort_order)

\n\nALTER TABLE jobs.proposal_line_items ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view proposal line items"\n  ON jobs.proposal_line_items FOR SELECT\n  TO authenticated\n  USING (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\nCREATE POLICY "Users can insert proposal line items"\n  ON jobs.proposal_line_items FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\nCREATE POLICY "Users can update proposal line items"\n  ON jobs.proposal_line_items FOR UPDATE\n  TO authenticated\n  USING (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )\n  WITH CHECK (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\nCREATE POLICY "Users can delete proposal line items"\n  ON jobs.proposal_line_items FOR DELETE\n  TO authenticated\n  USING (\n    proposal_id IN (\n      SELECT id FROM jobs.proposals\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\n-- =====================================================\n-- CREATE PROJECTS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.projects (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  company_id UUID NOT NULL,\n  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,\n  proposal_id UUID REFERENCES jobs.proposals(id) ON DELETE SET NULL,\n  project_number TEXT NOT NULL,\n  title TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'scheduled',\n  office_id UUID REFERENCES public.company_offices(id) ON DELETE SET NULL,\n  project_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,\n  start_date DATE,\n  end_date DATE,\n  completed_date DATE,\n  total_amount DECIMAL(10,2) DEFAULT 0,\n  notes TEXT,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now(),\n  UNIQUE(company_id, project_number)\n)

\n\nCREATE INDEX IF NOT EXISTS idx_projects_company ON jobs.projects(company_id)

\nCREATE INDEX IF NOT EXISTS idx_projects_contact ON jobs.projects(contact_id)

\nCREATE INDEX IF NOT EXISTS idx_projects_status ON jobs.projects(status)

\nCREATE INDEX IF NOT EXISTS idx_projects_pm ON jobs.projects(project_manager_id)

\n\nALTER TABLE jobs.projects ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view company projects"\n  ON jobs.projects FOR SELECT\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can insert company projects"\n  ON jobs.projects FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can update company projects"\n  ON jobs.projects FOR UPDATE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can delete company projects"\n  ON jobs.projects FOR DELETE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\n-- =====================================================\n-- CREATE INVOICES TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.invoices (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  company_id UUID NOT NULL,\n  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,\n  project_id UUID REFERENCES jobs.projects(id) ON DELETE SET NULL,\n  invoice_number TEXT NOT NULL,\n  invoice_type TEXT NOT NULL DEFAULT 'standalone',\n  status TEXT NOT NULL DEFAULT 'draft',\n  issue_date DATE NOT NULL,\n  due_date DATE NOT NULL,\n  subtotal DECIMAL(10,2) DEFAULT 0,\n  tax_rate DECIMAL(5,4) DEFAULT 0,\n  tax_amount DECIMAL(10,2) DEFAULT 0,\n  total DECIMAL(10,2) DEFAULT 0,\n  amount_paid DECIMAL(10,2) DEFAULT 0,\n  balance_due DECIMAL(10,2) DEFAULT 0,\n  notes TEXT,\n  qbo_invoice_id TEXT,\n  sent_at TIMESTAMPTZ,\n  paid_at TIMESTAMPTZ,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now(),\n  UNIQUE(company_id, invoice_number)\n)

\n\nCREATE INDEX IF NOT EXISTS idx_invoices_company ON jobs.invoices(company_id)

\nCREATE INDEX IF NOT EXISTS idx_invoices_contact ON jobs.invoices(contact_id)

\nCREATE INDEX IF NOT EXISTS idx_invoices_project ON jobs.invoices(project_id)

\nCREATE INDEX IF NOT EXISTS idx_invoices_status ON jobs.invoices(status)

\n\nALTER TABLE jobs.invoices ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view company invoices"\n  ON jobs.invoices FOR SELECT\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can insert company invoices"\n  ON jobs.invoices FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can update company invoices"\n  ON jobs.invoices FOR UPDATE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can delete company invoices"\n  ON jobs.invoices FOR DELETE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\n-- =====================================================\n-- CREATE PAYMENTS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.payments (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  company_id UUID NOT NULL,\n  invoice_id UUID NOT NULL REFERENCES jobs.invoices(id) ON DELETE CASCADE,\n  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,\n  payment_number TEXT NOT NULL,\n  payment_method TEXT NOT NULL,\n  amount DECIMAL(10,2) NOT NULL,\n  payment_date DATE NOT NULL,\n  reference_number TEXT,\n  stripe_payment_intent_id TEXT,\n  qbo_payment_id TEXT,\n  notes TEXT,\n  created_by UUID NOT NULL REFERENCES public.profiles(id),\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now(),\n  UNIQUE(company_id, payment_number)\n)

\n\nCREATE INDEX IF NOT EXISTS idx_payments_company ON jobs.payments(company_id)

\nCREATE INDEX IF NOT EXISTS idx_payments_invoice ON jobs.payments(invoice_id)

\nCREATE INDEX IF NOT EXISTS idx_payments_contact ON jobs.payments(contact_id)

\n\nALTER TABLE jobs.payments ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view company payments"\n  ON jobs.payments FOR SELECT\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can insert company payments"\n  ON jobs.payments FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can update company payments"\n  ON jobs.payments FOR UPDATE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can delete company payments"\n  ON jobs.payments FOR DELETE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\n-- =====================================================\n-- CREATE APPOINTMENTS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.appointments (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  company_id UUID NOT NULL,\n  project_id UUID REFERENCES jobs.projects(id) ON DELETE CASCADE,\n  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,\n  title TEXT NOT NULL,\n  appointment_type TEXT NOT NULL,\n  start_time TIMESTAMPTZ NOT NULL,\n  end_time TIMESTAMPTZ NOT NULL,\n  status TEXT NOT NULL DEFAULT 'scheduled',\n  assigned_to UUID[],\n  location TEXT,\n  notes TEXT,\n  google_calendar_event_id TEXT,\n  reminder_sent_at TIMESTAMPTZ,\n  created_by UUID NOT NULL REFERENCES public.profiles(id),\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now()\n)

\n\nCREATE INDEX IF NOT EXISTS idx_appointments_company ON jobs.appointments(company_id)

\nCREATE INDEX IF NOT EXISTS idx_appointments_project ON jobs.appointments(project_id)

\nCREATE INDEX IF NOT EXISTS idx_appointments_contact ON jobs.appointments(contact_id)

\nCREATE INDEX IF NOT EXISTS idx_appointments_start ON jobs.appointments(start_time)

\n\nALTER TABLE jobs.appointments ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view company appointments"\n  ON jobs.appointments FOR SELECT\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can insert company appointments"\n  ON jobs.appointments FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can update company appointments"\n  ON jobs.appointments FOR UPDATE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can delete company appointments"\n  ON jobs.appointments FOR DELETE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\n-- =====================================================\n-- CREATE COMMISSION RECORDS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.commission_records (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  company_id UUID NOT NULL,\n  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,\n  source_type TEXT NOT NULL,\n  source_id UUID NOT NULL,\n  role TEXT NOT NULL,\n  basis TEXT NOT NULL,\n  basis_amount DECIMAL(10,2) NOT NULL,\n  commission_rate DECIMAL(5,4) NOT NULL,\n  commission_amount DECIMAL(10,2) NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending',\n  paid_at TIMESTAMPTZ,\n  notes TEXT,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now()\n)

\n\nCREATE INDEX IF NOT EXISTS idx_commission_records_company ON jobs.commission_records(company_id)

\nCREATE INDEX IF NOT EXISTS idx_commission_records_profile ON jobs.commission_records(profile_id)

\nCREATE INDEX IF NOT EXISTS idx_commission_records_source ON jobs.commission_records(source_type, source_id)

\nCREATE INDEX IF NOT EXISTS idx_commission_records_status ON jobs.commission_records(status)

\n\nALTER TABLE jobs.commission_records ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view company commission records"\n  ON jobs.commission_records FOR SELECT\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can insert company commission records"\n  ON jobs.commission_records FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can update company commission records"\n  ON jobs.commission_records FOR UPDATE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\n-- =====================================================\n-- CREATE MESSAGE THREADS TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.message_threads (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  company_id UUID NOT NULL,\n  project_id UUID REFERENCES jobs.projects(id) ON DELETE CASCADE,\n  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,\n  subject TEXT NOT NULL,\n  thread_type TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'open',\n  created_by UUID NOT NULL REFERENCES public.profiles(id),\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now()\n)

\n\nCREATE INDEX IF NOT EXISTS idx_message_threads_company ON jobs.message_threads(company_id)

\nCREATE INDEX IF NOT EXISTS idx_message_threads_project ON jobs.message_threads(project_id)

\nCREATE INDEX IF NOT EXISTS idx_message_threads_contact ON jobs.message_threads(contact_id)

\n\nALTER TABLE jobs.message_threads ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view company message threads"\n  ON jobs.message_threads FOR SELECT\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can insert company message threads"\n  ON jobs.message_threads FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\nCREATE POLICY "Users can update company message threads"\n  ON jobs.message_threads FOR UPDATE\n  TO authenticated\n  USING (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )\n  WITH CHECK (\n    company_id IN (\n      SELECT company_id FROM public.profiles WHERE id = auth.uid()\n    )\n  )

\n\n-- =====================================================\n-- CREATE MESSAGES TABLE\n-- =====================================================\n\nCREATE TABLE IF NOT EXISTS jobs.messages (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  thread_id UUID NOT NULL REFERENCES jobs.message_threads(id) ON DELETE CASCADE,\n  sender_id UUID NOT NULL REFERENCES public.profiles(id),\n  message TEXT NOT NULL,\n  is_internal BOOLEAN DEFAULT false,\n  read_by UUID[] DEFAULT '{}',\n  created_at TIMESTAMPTZ DEFAULT now()\n)

\n\nCREATE INDEX IF NOT EXISTS idx_messages_thread ON jobs.messages(thread_id)

\nCREATE INDEX IF NOT EXISTS idx_messages_sender ON jobs.messages(sender_id)

\nCREATE INDEX IF NOT EXISTS idx_messages_created ON jobs.messages(created_at)

\n\nALTER TABLE jobs.messages ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "Users can view messages in company threads"\n  ON jobs.messages FOR SELECT\n  TO authenticated\n  USING (\n    thread_id IN (\n      SELECT id FROM jobs.message_threads\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\nCREATE POLICY "Users can insert messages in company threads"\n  ON jobs.messages FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    thread_id IN (\n      SELECT id FROM jobs.message_threads\n      WHERE company_id IN (\n        SELECT company_id FROM public.profiles WHERE id = auth.uid()\n      )\n    )\n  )

\n\nCREATE POLICY "Users can update their own messages"\n  ON jobs.messages FOR UPDATE\n  TO authenticated\n  USING (sender_id = auth.uid())\n  WITH CHECK (sender_id = auth.uid())


