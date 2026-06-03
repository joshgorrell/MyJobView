/*
  # Add QuickBooks Customer Sync Tracking

  1. New Tables
    - `quickbooks_synced_customers`
      - `id` (uuid, primary key)
      - `qbo_customer_id` (text) - QuickBooks customer ID
      - `lead_id` (uuid) - Reference to created lead
      - `synced_at` (timestamptz) - When customer was synced
      - `created_at` (timestamptz)
  
  2. Changes to Existing Tables
    - Add `auto_import_customers` (boolean) to `quickbooks_settings`
    - Add `last_customer_sync_at` (timestamptz) to `quickbooks_settings`
  
  3. Security
    - Enable RLS on quickbooks_synced_customers table
    - Only admins can view synced customer records
  
  4. Notes
    - This tracks which QuickBooks customers have been imported
    - Prevents duplicate imports of the same customer
    - Enables automatic syncing of new customers
*/

CREATE TABLE IF NOT EXISTS quickbooks_synced_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qbo_customer_id text UNIQUE NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quickbooks_synced_customers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quickbooks_synced_customers' AND policyname = 'Admins can view synced customers'
  ) THEN
    CREATE POLICY "Admins can view synced customers"
      ON quickbooks_synced_customers FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'auto_import_customers'
  ) THEN
    ALTER TABLE quickbooks_settings ADD COLUMN auto_import_customers boolean DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_settings' AND column_name = 'last_customer_sync_at'
  ) THEN
    ALTER TABLE quickbooks_settings ADD COLUMN last_customer_sync_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qbo_synced_customers_qbo_id ON quickbooks_synced_customers(qbo_customer_id);
CREATE INDEX IF NOT EXISTS idx_qbo_synced_customers_lead_id ON quickbooks_synced_customers(lead_id);
