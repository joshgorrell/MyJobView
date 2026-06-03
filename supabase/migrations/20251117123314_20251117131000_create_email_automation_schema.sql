/*
  # Email Automation Workflow System

  1. New Tables
    - `email_workflows` - Define automated email sequences
    - `email_workflow_steps` - Individual emails in a sequence
    - `email_workflow_enrollments` - Track who is enrolled in workflows
    - `email_workflow_logs` - Log all sent emails

  2. Features
    - Trigger-based workflows (lead created, proposal sent, etc.)
    - Time delays between steps
    - Conditional logic
    - Template integration
    - Open/click tracking
*/

-- Email workflows table
CREATE TABLE IF NOT EXISTS email_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL, -- 'lead_created', 'proposal_sent', 'invoice_sent', 'manual'
  trigger_conditions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company workflows"
  ON email_workflows FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create workflows"
  ON email_workflows FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update own company workflows"
  ON email_workflows FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete own company workflows"
  ON email_workflows FOR DELETE
  TO authenticated
  USING (company_id IN (SELECT id FROM profiles WHERE id = auth.uid()));

-- Email workflow steps table
CREATE TABLE IF NOT EXISTS email_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES email_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  delay_days INTEGER DEFAULT 0,
  delay_hours INTEGER DEFAULT 0,
  template_id UUID REFERENCES email_templates(id),
  subject TEXT,
  body TEXT,
  conditions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workflow steps"
  ON email_workflow_steps FOR SELECT
  TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM email_workflows
      WHERE company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can manage workflow steps"
  ON email_workflow_steps FOR ALL
  TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM email_workflows
      WHERE company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE INDEX idx_email_workflow_steps_workflow
  ON email_workflow_steps(workflow_id, step_order);

-- Email workflow enrollments table
CREATE TABLE IF NOT EXISTS email_workflow_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES email_workflows(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  current_step_id UUID REFERENCES email_workflow_steps(id),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
  next_send_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE email_workflow_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view enrollments"
  ON email_workflow_enrollments FOR SELECT
  TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM email_workflows
      WHERE company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can manage enrollments"
  ON email_workflow_enrollments FOR ALL
  TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM email_workflows
      WHERE company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE INDEX idx_email_workflow_enrollments_status
  ON email_workflow_enrollments(status, next_send_at)
  WHERE status = 'active';

CREATE INDEX idx_email_workflow_enrollments_contact
  ON email_workflow_enrollments(contact_id);

CREATE INDEX idx_email_workflow_enrollments_lead
  ON email_workflow_enrollments(lead_id);

-- Email workflow logs table
CREATE TABLE IF NOT EXISTS email_workflow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES email_workflow_enrollments(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES email_workflow_steps(id),
  sent_at TIMESTAMPTZ DEFAULT now(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE email_workflow_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workflow logs"
  ON email_workflow_logs FOR SELECT
  TO authenticated
  USING (
    enrollment_id IN (
      SELECT id FROM email_workflow_enrollments
      WHERE workflow_id IN (
        SELECT id FROM email_workflows
        WHERE company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
      )
    )
  );

CREATE INDEX idx_email_workflow_logs_enrollment
  ON email_workflow_logs(enrollment_id, sent_at DESC);

-- Function to enroll contact/lead in workflow
CREATE OR REPLACE FUNCTION enroll_in_workflow(
  p_workflow_id UUID,
  p_contact_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_enrollment_id UUID;
  v_first_step RECORD;
BEGIN
  -- Get first step of workflow
  SELECT * INTO v_first_step
  FROM email_workflow_steps
  WHERE workflow_id = p_workflow_id
  ORDER BY step_order ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow has no steps';
  END IF;

  -- Create enrollment
  INSERT INTO email_workflow_enrollments (
    workflow_id,
    contact_id,
    lead_id,
    current_step_id,
    next_send_at,
    metadata,
    status
  ) VALUES (
    p_workflow_id,
    p_contact_id,
    p_lead_id,
    v_first_step.id,
    now() + (v_first_step.delay_days || ' days')::INTERVAL + (v_first_step.delay_hours || ' hours')::INTERVAL,
    p_metadata,
    'active'
  )
  RETURNING id INTO v_enrollment_id;

  RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to advance enrollment to next step
CREATE OR REPLACE FUNCTION advance_workflow_enrollment(
  p_enrollment_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_enrollment RECORD;
  v_current_step RECORD;
  v_next_step RECORD;
BEGIN
  -- Get enrollment
  SELECT * INTO v_enrollment
  FROM email_workflow_enrollments
  WHERE id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get current step
  SELECT * INTO v_current_step
  FROM email_workflow_steps
  WHERE id = v_enrollment.current_step_id;

  -- Get next step
  SELECT * INTO v_next_step
  FROM email_workflow_steps
  WHERE workflow_id = v_enrollment.workflow_id
    AND step_order > v_current_step.step_order
  ORDER BY step_order ASC
  LIMIT 1;

  IF FOUND THEN
    -- Advance to next step
    UPDATE email_workflow_enrollments
    SET
      current_step_id = v_next_step.id,
      next_send_at = now() + (v_next_step.delay_days || ' days')::INTERVAL + (v_next_step.delay_hours || ' hours')::INTERVAL
    WHERE id = p_enrollment_id;
  ELSE
    -- Workflow complete
    UPDATE email_workflow_enrollments
    SET
      status = 'completed',
      completed_at = now(),
      next_send_at = NULL
    WHERE id = p_enrollment_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log email sent
CREATE OR REPLACE FUNCTION log_workflow_email(
  p_enrollment_id UUID,
  p_step_id UUID,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO email_workflow_logs (
    enrollment_id,
    step_id,
    error
  ) VALUES (
    p_enrollment_id,
    p_step_id,
    p_error
  )
  RETURNING id INTO v_log_id;

  -- Advance to next step if no error
  IF p_error IS NULL THEN
    PERFORM advance_workflow_enrollment(p_enrollment_id);
  END IF;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
