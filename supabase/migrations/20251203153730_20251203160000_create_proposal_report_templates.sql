/*
  # Create Proposal Report Templates System

  1. New Tables
    - `proposal_report_templates`
      - Stores customizable PDF report templates with extensive show/hide options
      - Users can create multiple templates for different proposal types
      - Templates control what appears in the customer-facing PDF

  2. Template Options Include
    - Basic Info: Company logo, proposal number, date, customer info
    - Line Items: Description, manufacturer, SKU, model, quantity, unit price, line total
    - Area/Room: Area name, area subtotals, area descriptions
    - Labor: Labor phase, hours, rate, total
    - Pricing: Cost (internal), price, markup percentage
    - Totals: Subtotal, tax breakdown, modifiers, deposit info
    - Content: Scope of work, contract terms, notes, signatures

  3. Security
    - Enable RLS
    - Users can view templates from their company
    - Only admins and sales managers can create/edit templates
*/

-- Create proposal report templates table
CREATE TABLE IF NOT EXISTS proposal_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_settings(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,

  -- Header & Basic Info
  show_company_logo boolean DEFAULT true,
  show_company_info boolean DEFAULT true,
  show_proposal_number boolean DEFAULT true,
  show_proposal_date boolean DEFAULT true,
  show_valid_until_date boolean DEFAULT true,
  show_proposal_title boolean DEFAULT true,
  show_customer_name boolean DEFAULT true,
  show_customer_address boolean DEFAULT true,
  show_customer_contact_info boolean DEFAULT true,
  show_jobsite_location boolean DEFAULT true,

  -- Line Item Details
  show_line_item_description boolean DEFAULT true,
  show_manufacturer boolean DEFAULT false,
  show_sku boolean DEFAULT false,
  show_model_number boolean DEFAULT false,
  show_quantity boolean DEFAULT true,
  show_unit_price boolean DEFAULT true,
  show_line_item_total boolean DEFAULT true,
  show_item_cost boolean DEFAULT false,
  show_markup_percentage boolean DEFAULT false,

  -- Area/Room Organization
  show_area_names boolean DEFAULT true,
  show_area_descriptions boolean DEFAULT true,
  show_area_subtotals boolean DEFAULT true,
  group_by_area boolean DEFAULT true,

  -- Labor Details
  show_labor_phase boolean DEFAULT false,
  show_labor_hours boolean DEFAULT false,
  show_labor_rate boolean DEFAULT false,
  show_labor_total boolean DEFAULT true,
  show_labor_separate_from_parts boolean DEFAULT false,

  -- Tax Information
  show_tax_breakdown boolean DEFAULT true,
  show_parts_tax_separate boolean DEFAULT false,
  show_labor_tax_separate boolean DEFAULT false,
  show_tax_rate boolean DEFAULT true,
  show_tax_exempt_notice boolean DEFAULT true,

  -- Pricing & Modifiers
  show_subtotal boolean DEFAULT true,
  show_discount boolean DEFAULT true,
  show_project_management_fee boolean DEFAULT true,
  show_design_fee boolean DEFAULT true,
  show_credit_card_fee boolean DEFAULT false,
  show_custom_modifiers boolean DEFAULT true,

  -- Deposit & Payment
  show_deposit_amount boolean DEFAULT true,
  show_deposit_percentage boolean DEFAULT true,
  show_payment_schedule boolean DEFAULT true,
  show_accepted_payment_methods boolean DEFAULT true,
  show_payment_instructions boolean DEFAULT true,

  -- Additional Content
  show_scope_of_work boolean DEFAULT true,
  show_contract_terms boolean DEFAULT true,
  show_notes boolean DEFAULT true,
  show_internal_notes boolean DEFAULT false,
  show_signature_section boolean DEFAULT true,
  show_acceptance_section boolean DEFAULT true,

  -- Styling & Layout Options
  page_size text DEFAULT 'letter',
  color_scheme text DEFAULT 'blue',
  font_family text DEFAULT 'arial',
  show_page_numbers boolean DEFAULT true,
  show_watermark boolean DEFAULT false,
  watermark_text text,

  -- Image & Media
  max_product_images integer DEFAULT 0,
  show_before_after_photos boolean DEFAULT false,

  -- Optional Features
  include_cover_page boolean DEFAULT true,
  include_table_of_contents boolean DEFAULT false,
  include_appendix boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for lookups
CREATE INDEX idx_proposal_report_templates_company ON proposal_report_templates(company_id);
CREATE INDEX idx_proposal_report_templates_default ON proposal_report_templates(company_id, is_default) WHERE is_default = true;

-- Add foreign key to proposals to link to a template
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS report_template_id uuid REFERENCES proposal_report_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_report_template ON proposals(report_template_id);

-- Enable RLS
ALTER TABLE proposal_report_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view templates from their company"
  ON proposal_report_templates FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins and sales managers can create templates"
  ON proposal_report_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "Admins and sales managers can update templates"
  ON proposal_report_templates FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "Admins can delete templates"
  ON proposal_report_templates FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- Create a default template for each company
INSERT INTO proposal_report_templates (
  company_id,
  name,
  description,
  is_default,
  show_manufacturer,
  show_sku,
  show_model_number
)
SELECT
  id,
  'Standard Proposal',
  'Default template with essential information',
  true,
  false,
  false,
  false
FROM company_settings
WHERE NOT EXISTS (
  SELECT 1 FROM proposal_report_templates
  WHERE company_id = company_settings.id
);