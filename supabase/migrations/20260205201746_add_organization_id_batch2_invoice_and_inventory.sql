/*\n  # Add organization_id to invoice, inventory, and job tables - Batch 2\n\n  Adds organization_id to invoice line items, inventory tracking, job-related tables,\n  and other operational tables.\n\n  1. Tables Modified (30 tables):\n    - invoice_line_items, invoice_line_item_sources, invoice_change_order_links (already has it? skip if so)\n    - job_acceptance_log, job_completion_templates, job_completions\n    - job_merge_sources, job_merges, job_photo_likes\n    - job_split_parts, job_splits, job_status_history\n    - location_quality_metrics\n    - messages\n    - module_access, module_role_access, module_user_overrides\n    - office_travel_settings\n    - payment_methods, pending_payments\n    - pipeline_stages\n    - points_history, points_transactions\n    - portal_io_cache, portal_views\n    - priority_settings\n    - product_accessories, product_colors, product_inventory\n\n  2. Each column added with default backfill then NOT NULL\n*/\n\nDO $$ \nDECLARE\n  default_org_id uuid

\n  tbl text

\n  tables text[] := ARRAY[\n    'invoice_line_items', 'invoice_line_item_sources',\n    'job_acceptance_log', 'job_completion_templates', 'job_completions',\n    'job_merge_sources', 'job_merges', 'job_photo_likes',\n    'job_split_parts', 'job_splits', 'job_status_history',\n    'location_quality_metrics',\n    'messages',\n    'module_access', 'module_role_access', 'module_user_overrides',\n    'office_travel_settings',\n    'payment_methods', 'pending_payments',\n    'pipeline_stages',\n    'points_history', 'points_transactions',\n    'portal_io_cache', 'portal_views',\n    'priority_settings',\n    'product_accessories', 'product_colors', 'product_inventory'\n  ]

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
