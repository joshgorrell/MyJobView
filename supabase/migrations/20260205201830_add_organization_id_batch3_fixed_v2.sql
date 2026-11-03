/*\n  # Add organization_id to proposal, product, and project tables - Batch 3 (v2)\n\n  Handles trigger dependency on punchlist_tasks by disabling the correct trigger name.\n\n  1. Tables Modified (29 tables)\n  2. Disables trigger_log_punchlist_task_change during backfill\n*/\n\n-- Disable the punchlist trigger before backfill\nALTER TABLE punchlist_tasks DISABLE TRIGGER trigger_log_punchlist_task_change

\n\nDO $$ \nDECLARE\n  default_org_id uuid

\n  tbl text

\n  tables text[] := ARRAY[\n    'product_package_items', 'product_request_items', 'product_subcategories',\n    'project_commission_overrides', 'project_tasks',\n    'proposal_activity', 'proposal_archive_log', 'proposal_class_templates', 'proposal_classes',\n    'proposal_line_item_labor_phases', 'proposal_line_items', 'proposal_messages',\n    'proposal_reactivation_requests', 'proposal_rooms', 'proposal_versions',\n    'prospect_competitor_relationships',\n    'pto_accrual_history', 'pto_balances',\n    'punch_list_items', 'punchlist_access_grants',\n    'punchlist_task_history', 'punchlist_task_photos', 'punchlist_tasks',\n    'purchase_order_items', 'purchase_orders',\n    'quickbooks_settings', 'quickbooks_staged_customers', 'quickbooks_sync_logs', 'quickbooks_synced_customers'\n  ]

\nBEGIN\n  SELECT id INTO default_org_id FROM organizations LIMIT 1

\n  \n  FOREACH tbl IN ARRAY tables\n  LOOP\n    IF NOT EXISTS (\n      SELECT 1 FROM information_schema.columns \n      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'\n    ) THEN\n      EXECUTE format('ALTER TABLE %I ADD COLUMN organization_id uuid', tbl)

\n      EXECUTE format('UPDATE %I SET organization_id = %L WHERE organization_id IS NULL', tbl, default_org_id)

\n      EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET NOT NULL', tbl)

\n      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES organizations(id)', tbl, tbl || '_organization_id_fkey')

\n      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (organization_id)', 'idx_' || tbl || '_org_id', tbl)

\n    END IF

\n  END LOOP

\nEND $$

\n\n-- Re-enable the trigger\nALTER TABLE punchlist_tasks ENABLE TRIGGER trigger_log_punchlist_task_change

\n
