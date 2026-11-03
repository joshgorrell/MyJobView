/*
  Customer feedback lifecycle metadata + idempotency.
  Lost Opportunity feedback remains in its separate tables and is not part of these metrics.
*/
ALTER TABLE customer_satisfaction
  ADD COLUMN IF NOT EXISTS survey_type text NOT NULL DEFAULT 'job_completion',
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL;

ALTER TABLE customer_satisfaction
  DROP CONSTRAINT IF EXISTS customer_satisfaction_survey_type_check;
ALTER TABLE customer_satisfaction
  ADD CONSTRAINT customer_satisfaction_survey_type_check
  CHECK (survey_type IN ('job_completion','post_test_tune','one_year','manual'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_satisfaction_project_lifecycle
  ON customer_satisfaction(project_id, survey_type)
  WHERE project_id IS NOT NULL AND survey_type IN ('job_completion','post_test_tune','one_year');

CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_survey_type
  ON customer_satisfaction(organization_id, survey_type, sent_at DESC);



NOTIFY pgrst, 'reload schema';
