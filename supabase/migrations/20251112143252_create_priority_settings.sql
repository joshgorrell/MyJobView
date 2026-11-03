/*\n  # Create Priority Settings\n\n  1. New Tables\n    - `priority_settings`\n      - `id` (uuid, primary key)\n      - `priority_level` (text) - urgent, high, medium, low\n      - `description` (text) - customizable description\n      - `created_at` (timestamptz)\n      - `updated_at` (timestamptz)\n\n  2. Security\n    - Enable RLS on `priority_settings` table\n    - Add policy for admins to manage priority settings\n    - Add policy for all authenticated users to read priority settings\n\n  3. Data\n    - Insert default priority descriptions\n*/\n\nCREATE TABLE IF NOT EXISTS priority_settings (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  priority_level text NOT NULL UNIQUE CHECK (priority_level IN ('urgent', 'high', 'medium', 'low')),\n  description text NOT NULL,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)

\n\nALTER TABLE priority_settings ENABLE ROW LEVEL SECURITY

\n\nCREATE POLICY "All users can view priority settings"\n  ON priority_settings\n  FOR SELECT\n  TO authenticated\n  USING (true)

\n\nCREATE POLICY "Admins can insert priority settings"\n  ON priority_settings\n  FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role = 'admin'\n    )\n  )

\n\nCREATE POLICY "Admins can update priority settings"\n  ON priority_settings\n  FOR UPDATE\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role = 'admin'\n    )\n  )\n  WITH CHECK (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role = 'admin'\n    )\n  )

\n\nCREATE POLICY "Admins can delete priority settings"\n  ON priority_settings\n  FOR DELETE\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role = 'admin'\n    )\n  )

\n\n-- Insert default priority settings\nINSERT INTO priority_settings (priority_level, description)\nVALUES \n  ('urgent', 'Follow up within hours'),\n  ('high', 'Follow up within 1 day'),\n  ('medium', 'Follow up within 3 days'),\n  ('low', 'Follow up within 1 week')\nON CONFLICT (priority_level) DO NOTHING


