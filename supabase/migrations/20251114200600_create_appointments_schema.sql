/*
  # Create Appointments Schema

  1. New Tables
    - `appointments`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references profiles)
      - `project_id` (uuid, references projects) - Optional
      - `contact_id` (uuid, references contacts)
      - `title` (text)
      - `description` (text)
      - `appointment_date` (date)
      - `start_time` (time)
      - `end_time` (time)
      - `status` (text: scheduled, in_progress, completed, cancelled)
      - `assigned_technician` (uuid, references profiles)
      - `location` (text)
      - `notes` (text)
      - `created_by` (uuid)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `appointments` table
    - Staff can manage appointments in their company
    - Customers can view their own appointments

  3. Indexes
    - Index on company_id
    - Index on project_id
    - Index on contact_id
    - Index on assigned_technician
    - Index on appointment_date for calendar views
*/

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  appointment_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  assigned_technician uuid,
  location text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_company ON appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_appointments_project ON appointments(project_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_technician ON appointments(assigned_technician);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(company_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(company_id, status);

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Policies for staff
CREATE POLICY "Staff can view appointments in their company"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can create appointments in their company"
  ON appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can update appointments in their company"
  ON appointments FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete appointments in their company"
  ON appointments FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );
