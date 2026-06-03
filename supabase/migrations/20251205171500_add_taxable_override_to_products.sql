/*
  # Add Taxable Override to Products and Line Items

  1. Changes
    - Add `is_taxable` column to `products` table
      - Type: boolean (nullable)
      - null = follow standard tax rules based on item_type/environment/project_type
      - true = always taxable regardless of rules
      - false = never taxable (tax exempt)
    
    - Add `is_taxable` column to `proposal_line_items`
      - Inherits from product by default
      - Can be overridden per proposal
    
    - Add `is_taxable` column to `invoice_line_items`
      - Same logic as proposal line items

  2. Rationale
    - Some products need to be tax exempt (services, monitoring, etc.)
    - Some products should always be taxed regardless of project type
    - Provides flexibility to override standard tax matrix rules
    - Per-line-item override allows exceptions on individual proposals

  3. Security
    - No RLS changes needed (existing policies cover new columns)
*/

-- Add is_taxable to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_taxable'
  ) THEN
    ALTER TABLE products 
    ADD COLUMN is_taxable boolean DEFAULT NULL;
  END IF;
END $$;

-- Add is_taxable to proposal_line_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'is_taxable'
  ) THEN
    ALTER TABLE proposal_line_items 
    ADD COLUMN is_taxable boolean DEFAULT NULL;
  END IF;
END $$;

-- Add is_taxable to invoice_line_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_line_items' AND column_name = 'is_taxable'
  ) THEN
    ALTER TABLE invoice_line_items 
    ADD COLUMN is_taxable boolean DEFAULT NULL;
  END IF;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_is_taxable 
ON products(is_taxable) WHERE is_taxable IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_line_items_is_taxable 
ON proposal_line_items(is_taxable) WHERE is_taxable IS NOT NULL;

-- Add helpful comments
COMMENT ON COLUMN products.is_taxable IS 'Taxable override: null=follow standard rules, true=always taxable, false=never taxable (exempt)';
COMMENT ON COLUMN proposal_line_items.is_taxable IS 'Taxable override: null=follow standard rules, true=always taxable, false=never taxable (exempt)';
COMMENT ON COLUMN invoice_line_items.is_taxable IS 'Taxable override: null=follow standard rules, true=always taxable, false=never taxable (exempt)';

-- Update the calculate_line_item_tax function to respect the is_taxable flag
CREATE OR REPLACE FUNCTION calculate_line_item_tax_with_override(
  p_environment text,
  p_project_type text,
  p_item_type text,
  p_amount decimal,
  p_tax_rate decimal,
  p_is_taxable boolean
)
RETURNS decimal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check for explicit taxable override first
  IF p_is_taxable IS NOT NULL THEN
    IF p_is_taxable = true THEN
      -- Always taxable
      RETURN p_amount * p_tax_rate;
    ELSE
      -- Never taxable (exempt)
      RETURN 0;
    END IF;
  END IF;
  
  -- Fall back to standard tax calculation rules based on environment/project type/item type
  -- (These are the existing rules from the previous tax calculation function)
  
  -- Residential original construction
  IF p_environment = 'residential' AND p_project_type = 'original_construction' THEN
    IF p_item_type = 'labor' THEN
      RETURN 0; -- Labor not taxed
    ELSE
      RETURN p_amount * p_tax_rate; -- Materials taxed
    END IF;
  END IF;

  -- Residential remodel
  IF p_environment = 'residential' AND p_project_type = 'remodel' THEN
    IF p_item_type = 'labor' THEN
      RETURN 0; -- Labor not taxed
    ELSE
      RETURN p_amount * p_tax_rate; -- Materials taxed
    END IF;
  END IF;

  -- Commercial original construction
  IF p_environment = 'commercial' AND p_project_type = 'original_construction' THEN
    IF p_item_type = 'labor' THEN
      RETURN 0; -- Labor not taxed
    ELSE
      RETURN p_amount * p_tax_rate; -- Materials taxed
    END IF;
  END IF;

  -- Commercial remodel
  IF p_environment = 'commercial' AND p_project_type = 'remodel' THEN
    RETURN p_amount * p_tax_rate; -- Both labor and materials taxed
  END IF;

  -- General installation/repair (both residential and commercial)
  IF p_project_type = 'general_installation_repair' THEN
    RETURN p_amount * p_tax_rate; -- Both labor and materials taxed
  END IF;

  -- Design services (usually not taxed)
  IF p_project_type = 'design_services' THEN
    RETURN 0;
  END IF;

  -- Maintenance agreements (usually not taxed)
  IF p_project_type = 'maintenance_agreement' THEN
    RETURN 0;
  END IF;

  -- Membership (usually not taxed)
  IF p_project_type = 'membership' THEN
    RETURN 0;
  END IF;

  -- Security monitoring (usually not taxed)
  IF p_project_type = 'security_monitoring' THEN
    RETURN 0;
  END IF;

  -- Exempt projects
  IF p_project_type = 'exempt_project' THEN
    RETURN 0;
  END IF;

  -- Default: tax everything if no specific rule matches
  RETURN p_amount * p_tax_rate;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_line_item_tax_with_override TO authenticated;
