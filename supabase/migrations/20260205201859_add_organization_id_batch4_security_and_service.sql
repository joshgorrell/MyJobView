/*\n  # Add organization_id to security, service, stock, and subscription tables - Batch 4\n\n  1. Tables Modified (27 tables):\n    - auto_clock_out_execution_log, bug_notification_settings, calendar_members\n    - control4_projects, customers, device_location_settings\n    - reward_redemptions, role_department_access, role_module_access\n    - scheduled_connection_occurrences\n    - security_contract_approvals, security_contract_cancellations\n    - security_contract_emergency_contacts, security_contract_equipment\n    - security_contract_fields, security_contract_responses, security_contract_services\n    - serial_lot_tracking\n    - service_additional_charges, service_billing_queue\n    - service_labor_entries, service_parts_used\n    - session_cleanup_log, sms_logs\n    - stock_adjustment_items, stock_adjustments, stock_movements\n*/\n\nDO $$ \nDECLARE\n  default_org_id uuid

\n  tbl text

\n  tables text[] := ARRAY[\n    'auto_clock_out_execution_log', 'bug_notification_settings', 'calendar_members',\n    'control4_projects', 'customers', 'device_location_settings',\n    'reward_redemptions', 'role_department_access', 'role_module_access',\n    'scheduled_connection_occurrences',\n    'security_contract_approvals', 'security_contract_cancellations',\n    'security_contract_emergency_contacts', 'security_contract_equipment',\n    'security_contract_fields', 'security_contract_responses', 'security_contract_services',\n    'serial_lot_tracking',\n    'service_additional_charges', 'service_billing_queue',\n    'service_labor_entries', 'service_parts_used',\n    'session_cleanup_log', 'sms_logs',\n    'stock_adjustment_items', 'stock_adjustments', 'stock_movements'\n  ]

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
