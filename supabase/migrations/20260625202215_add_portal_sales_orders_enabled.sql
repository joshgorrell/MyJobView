ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS portal_sales_orders_enabled boolean NOT NULL DEFAULT true;