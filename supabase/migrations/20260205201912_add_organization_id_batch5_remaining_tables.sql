/*\n  # Add organization_id to all remaining tables - Batch 5\n\n  1. Tables Modified (remaining ~25 tables):\n    - stock_reservations, stock_transfer_items, stock_transfers\n    - subscription_line_items, subscription_payments\n    - task_comments, task_mentions, task_watchers\n    - tech_locations, technician_locations, technician_status\n    - time_clock_alerts, travel_bonus_requests, trip_segments\n    - user_activity_log, user_column_preferences\n    - user_offices, user_permission_overrides, user_points\n    - user_starred_modules, user_visibility_settings\n    - warehouse_bins\n    - work_order_materials, work_order_task_completions, work_order_tasks\n*/\n\nDO $$ \nDECLARE\n  default_org_id uuid

\n  tbl text

\n  tables text[] := ARRAY[\n    'stock_reservations', 'stock_transfer_items', 'stock_transfers',\n    'subscription_line_items', 'subscription_payments',\n    'task_comments', 'task_mentions', 'task_watchers',\n    'tech_locations', 'technician_locations', 'technician_status',\n    'time_clock_alerts', 'travel_bonus_requests', 'trip_segments',\n    'user_activity_log', 'user_column_preferences',\n    'user_offices', 'user_permission_overrides', 'user_points',\n    'user_starred_modules', 'user_visibility_settings',\n    'warehouse_bins',\n    'work_order_materials', 'work_order_task_completions', 'work_order_tasks'\n  ]

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
