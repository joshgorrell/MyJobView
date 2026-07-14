/*
# Setup Default Billing Plan for Security Contract Imports

## Purpose
Creates a recurring plan for security contract billing and links it to the existing
security contract template so imported contracts get automatic billing.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM recurring_plans 
    WHERE plan_type = 'security_contract' AND billing_frequency = 'monthly'
  ) THEN
    INSERT INTO recurring_plans (organization_id, plan_name, description, billing_frequency, amount, plan_type, is_active)
    VALUES (
      'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
      'Security Monitoring (Monthly)',
      'Default monthly billing plan for imported security contracts',
      'monthly',
      0,
      'security_contract',
      true
    );
  END IF;
END $$;

UPDATE security_contract_templates
SET auto_create_subscription = true,
    default_billing_plan_id = (SELECT id FROM recurring_plans WHERE plan_type = 'security_contract' AND billing_frequency = 'monthly' LIMIT 1)
WHERE id = '1546a013-6a30-4aed-b58a-70dd74a6ec25';
