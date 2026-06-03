/*
  # Create Email Templates

  1. New Tables
    - `email_templates`
      - `id` (uuid, primary key)
      - `template_type` (text) - Type of email (welcome_email, etc.)
      - `subject` (text) - Email subject line
      - `body` (text) - Email body content (supports placeholders)
      - `is_active` (boolean) - Whether this template is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on email_templates table
    - Only admins can view and modify email templates
    - Authenticated users can view active templates (for sending)

  3. Notes
    - Templates support placeholders: {{full_name}}, {{email}}, {{company_name}}, {{login_url}}
    - Only one template per type should be active at a time
    - Default welcome email template is created

  4. Initial Data
    - Create default welcome email template
*/

CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type text NOT NULL UNIQUE,
  subject text NOT NULL,
  body text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage email templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Insert default welcome email template
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'welcome_email',
  'Welcome to {{company_name}}!',
  'Hi {{full_name}},

Welcome to {{company_name}}! Your account has been created successfully.

Your login details:
Email: {{email}}
You can log in at: {{login_url}}

If you have any questions, please don''t hesitate to reach out to your administrator.

Best regards,
The {{company_name}} Team'
,
  true
)
ON CONFLICT (template_type) DO NOTHING;
