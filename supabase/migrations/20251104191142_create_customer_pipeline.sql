/*\n  # Customer Pipeline System\n\n  1. New Tables\n    - `pipeline_stages`\n      - `id` (uuid, primary key)\n      - `name` (text) - Stage name (e.g., "Lead", "Qualified", "Proposal", "Negotiation", "Closed Won")\n      - `order_index` (integer) - Order of stage in pipeline\n      - `color` (text) - Color code for visual representation\n      - `created_at` (timestamptz)\n    \n    - `customers`\n      - `id` (uuid, primary key)\n      - `name` (text) - Customer name\n      - `email` (text) - Customer email\n      - `company` (text) - Company name\n      - `phone` (text) - Contact phone\n      - `value` (numeric) - Deal value\n      - `stage_id` (uuid) - Foreign key to pipeline_stages\n      - `notes` (text) - Additional notes\n      - `created_at` (timestamptz)\n      - `updated_at` (timestamptz)\n\n  2. Security\n    - Enable RLS on both tables\n    - Add policies for public access (demo purposes)\n    - In production, these should be restricted to authenticated users\n\n  3. Initial Data\n    - Seed default pipeline stages\n*/\n\n-- Create pipeline_stages table\nCREATE TABLE IF NOT EXISTS pipeline_stages (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  name text NOT NULL,\n  order_index integer NOT NULL,\n  color text NOT NULL DEFAULT '#3b82f6',\n  created_at timestamptz DEFAULT now()\n)

\n\n-- Create customers table\nCREATE TABLE IF NOT EXISTS customers (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  name text NOT NULL,\n  email text,\n  company text,\n  phone text,\n  value numeric DEFAULT 0,\n  stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,\n  notes text DEFAULT '',\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)

\n\n-- Enable RLS\nALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY

\nALTER TABLE customers ENABLE ROW LEVEL SECURITY

\n\n-- Create policies for pipeline_stages\nCREATE POLICY "Anyone can view pipeline stages"\n  ON pipeline_stages FOR SELECT\n  TO anon, authenticated\n  USING (true)

\n\nCREATE POLICY "Anyone can insert pipeline stages"\n  ON pipeline_stages FOR INSERT\n  TO anon, authenticated\n  WITH CHECK (true)

\n\nCREATE POLICY "Anyone can update pipeline stages"\n  ON pipeline_stages FOR UPDATE\n  TO anon, authenticated\n  USING (true)\n  WITH CHECK (true)

\n\nCREATE POLICY "Anyone can delete pipeline stages"\n  ON pipeline_stages FOR DELETE\n  TO anon, authenticated\n  USING (true)

\n\n-- Create policies for customers\nCREATE POLICY "Anyone can view customers"\n  ON customers FOR SELECT\n  TO anon, authenticated\n  USING (true)

\n\nCREATE POLICY "Anyone can insert customers"\n  ON customers FOR INSERT\n  TO anon, authenticated\n  WITH CHECK (true)

\n\nCREATE POLICY "Anyone can update customers"\n  ON customers FOR UPDATE\n  TO anon, authenticated\n  USING (true)\n  WITH CHECK (true)

\n\nCREATE POLICY "Anyone can delete customers"\n  ON customers FOR DELETE\n  TO anon, authenticated\n  USING (true)

\n\n-- Insert default pipeline stages\nINSERT INTO pipeline_stages (name, order_index, color) VALUES\n  ('Lead', 1, '#64748b'),\n  ('Qualified', 2, '#3b82f6'),\n  ('Proposal', 3, '#8b5cf6'),\n  ('Negotiation', 4, '#f59e0b'),\n  ('Closed Won', 5, '#10b981'),\n  ('Closed Lost', 6, '#ef4444')\nON CONFLICT DO NOTHING


