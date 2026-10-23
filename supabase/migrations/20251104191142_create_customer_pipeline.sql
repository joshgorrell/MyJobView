/*
  # Customer Pipeline System

  1. New Tables
    - `pipeline_stages`
      - `id` (uuid, primary key)
      - `name` (text) - Stage name (e.g., "Lead", "Qualified", "Proposal", "Negotiation", "Closed Won")
      - `order_index` (integer) - Order of stage in pipeline
      - `color` (text) - Color code for visual representation
      - `created_at` (timestamptz)
    
    - `customers`
      - `id` (uuid, primary key)
      - `name` (text) - Customer name
      - `email` (text) - Customer email
      - `company` (text) - Company name
      - `phone` (text) - Contact phone
      - `value` (numeric) - Deal value
      - `stage_id` (uuid) - Foreign key to pipeline_stages
      - `notes` (text) - Additional notes
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for public access (demo purposes)
    - In production, these should be restricted to authenticated users

  3. Initial Data
    - Seed default pipeline stages
*/

-- Create pipeline_stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  order_index integer NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now()
);



-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  company text,
  phone text,
  value numeric DEFAULT 0,
  stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);



-- Enable RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;


ALTER TABLE customers ENABLE ROW LEVEL SECURITY;



-- Create policies for pipeline_stages
CREATE POLICY "Anyone can view pipeline stages"
  ON pipeline_stages FOR SELECT
  TO anon, authenticated
  USING (true);



CREATE POLICY "Anyone can insert pipeline stages"
  ON pipeline_stages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);



CREATE POLICY "Anyone can update pipeline stages"
  ON pipeline_stages FOR UPDATE
  TO anon, authenticated
  USING (true);
  WITH CHECK (true);



CREATE POLICY "Anyone can delete pipeline stages"
  ON pipeline_stages FOR DELETE
  TO anon, authenticated
  USING (true);



-- Create policies for customers
CREATE POLICY "Anyone can view customers"
  ON customers FOR SELECT
  TO anon, authenticated
  USING (true);



CREATE POLICY "Anyone can insert customers"
  ON customers FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);



CREATE POLICY "Anyone can update customers"
  ON customers FOR UPDATE
  TO anon, authenticated
  USING (true);
  WITH CHECK (true);



CREATE POLICY "Anyone can delete customers"
  ON customers FOR DELETE
  TO anon, authenticated
  USING (true);



-- Insert default pipeline stages
INSERT INTO pipeline_stages (name, order_index, color) VALUES
  ('Lead', 1, '#64748b'),
  ('Qualified', 2, '#3b82f6'),
  ('Proposal', 3, '#8b5cf6'),
  ('Negotiation', 4, '#f59e0b'),
  ('Closed Won', 5, '#10b981'),
  ('Closed Lost', 6, '#ef4444')
ON CONFLICT DO NOTHING;


