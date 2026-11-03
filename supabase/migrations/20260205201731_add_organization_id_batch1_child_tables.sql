/*\n  # Add organization_id to child/junction tables - Batch 1\n\n  Adds organization_id to tables that are children of already-scoped tables.\n  These include change orders, commissions, contact tags, lead tags, and more.\n\n  1. Tables Modified (30 tables):\n    - change_order_approvals, change_order_documents, change_order_history, change_order_line_items\n    - commission_adjustments, commission_payments, commission_records, company_commission_settings (already has it? checking)\n    - contact_captures, contact_tags\n    - clock_in_rewards_log, clock_out_rewards_log\n    - daily_clock_breaks\n    - default_starred_modules\n    - department_access, department_modules, department_role_access, department_user_overrides\n    - discussion_post_bumps, discussion_post_likes\n    - distance_matrix_cache\n    - email_workflow_enrollments, email_workflow_logs, email_workflow_steps\n    - employee_commission_config\n    - enhanced_gps_breadcrumbs\n    - geofence_events\n    - gps_capture_attempts\n    - lead_messages, lead_tags\n\n  2. Each column added with default backfill from first organization, then made NOT NULL\n*/\n\nDO $$ \nDECLARE\n  default_org_id uuid

\n  tbl text

\n  tables text[] := ARRAY[\n    'change_order_approvals', 'change_order_documents', 'change_order_history', 'change_order_line_items',\n    'commission_adjustments', 'commission_payments', 'commission_records',\n    'contact_captures', 'contact_tags',\n    'clock_in_rewards_log', 'clock_out_rewards_log',\n    'daily_clock_breaks',\n    'default_starred_modules',\n    'department_access', 'department_modules', 'department_role_access', 'department_user_overrides',\n    'discussion_post_bumps', 'discussion_post_likes',\n    'distance_matrix_cache',\n    'email_workflow_enrollments', 'email_workflow_logs', 'email_workflow_steps',\n    'employee_commission_config',\n    'enhanced_gps_breadcrumbs',\n    'geofence_events',\n    'gps_capture_attempts',\n    'lead_messages', 'lead_tags'\n  ]

\nBEGIN\n  SELECT id INTO default_org_id FROM organizations LIMIT 1

\n  \n  FOREACH tbl IN ARRAY tables\n  LOOP\n    IF NOT EXISTS (\n      SELECT 1 FROM information_schema.columns \n      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'\n    ) THEN\n      EXECUTE format('ALTER TABLE %I ADD COLUMN organization_id uuid', tbl)

\n      EXECUTE format('UPDATE %I SET organization_id = %L WHERE organization_id IS NULL', tbl, default_org_id)

\n      EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET NOT NULL', tbl)

\n      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES organizations(id)', tbl, tbl || '_organization_id_fkey')

\n      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (organization_id)', 'idx_' || tbl || '_org_id', tbl)

\n    END IF

\n  END LOOP

\nEND $$

\n
