/*\n# Add per-item source columns to product_request_items\n\n## Purpose\nEnables multi-target parts requests: each item in a single request can be tagged\nwith its own source (sales order, work order, project, service request, or general/stock).\nPreviously all items inherited the parent request's single source. Now the parent\nrequest keeps a "primary" source for grouping, but each item can carry its own.\n\n## Changes to `product_request_items`\n1. New Columns:\n   - `source_type` (text, nullable) — one of 'sales_order', 'work_order', 'service_request', 'general'\n   - `sales_order_id` (uuid, nullable, FK → sales_orders ON DELETE SET NULL)\n   - `work_order_id` (uuid, nullable, FK → work_orders ON DELETE SET NULL)\n   - `project_id` (uuid, nullable, FK → projects ON DELETE SET NULL)\n   - `service_request_id` (uuid, nullable, FK → service_requests ON DELETE SET NULL)\n\n2. Backfill:\n   - Existing items are populated from their parent request's source columns so\n     nothing breaks and all existing data remains consistent.\n\n3. Indexes:\n   - Added indexes on the new FK columns for query performance.\n\n## Security\n- No RLS policy changes needed — the table already has RLS enabled and the new\n  columns are covered by existing policies (they are just nullable FKs).\n- No new policies required since the columns are populated by the same\n  authenticated users who already have insert/update access.\n\n## Important Notes\n- The parent `product_requests` columns (sales_order_id, work_order_id, etc.)\n  remain as the "primary" source for grouping in the management view.\n- In Single-Target mode, all items inherit the parent's source.\n- In Multi-Target mode, each item carries its own source_type and source ID.\n*/\n\n-- Add source_type column\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'product_request_items' AND column_name = 'source_type'\n  ) THEN\n    ALTER TABLE product_request_items ADD COLUMN source_type text

\n  END IF

\nEND $$

\n\n-- Add per-item source FK columns\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'product_request_items' AND column_name = 'sales_order_id'\n  ) THEN\n    ALTER TABLE product_request_items ADD COLUMN sales_order_id uuid

\n  END IF

\nEND $$

\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'product_request_items' AND column_name = 'work_order_id'\n  ) THEN\n    ALTER TABLE product_request_items ADD COLUMN work_order_id uuid

\n  END IF

\nEND $$

\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'product_request_items' AND column_name = 'project_id'\n  ) THEN\n    ALTER TABLE product_request_items ADD COLUMN project_id uuid

\n  END IF

\nEND $$

\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'product_request_items' AND column_name = 'service_request_id'\n  ) THEN\n    ALTER TABLE product_request_items ADD COLUMN service_request_id uuid

\n  END IF

\nEND $$

\n\n-- Add foreign keys (ON DELETE SET NULL to avoid cascading deletes)\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'product_request_items_sales_order_id_fkey'\n  ) THEN\n    ALTER TABLE product_request_items\n      ADD CONSTRAINT product_request_items_sales_order_id_fkey\n      FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'product_request_items_work_order_id_fkey'\n  ) THEN\n    ALTER TABLE product_request_items\n      ADD CONSTRAINT product_request_items_work_order_id_fkey\n      FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'product_request_items_project_id_fkey'\n  ) THEN\n    ALTER TABLE product_request_items\n      ADD CONSTRAINT product_request_items_project_id_fkey\n      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'product_request_items_service_request_id_fkey'\n  ) THEN\n    ALTER TABLE product_request_items\n      ADD CONSTRAINT product_request_items_service_request_id_fkey\n      FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\n-- Backfill existing items from their parent request's source\nUPDATE product_request_items pri\nSET\n  source_type = CASE\n    WHEN pr.sales_order_id IS NOT NULL THEN 'sales_order'\n    WHEN pr.work_order_id IS NOT NULL THEN 'work_order'\n    WHEN pr.service_request_id IS NOT NULL THEN 'service_request'\n    ELSE 'general'\n  END,\n  sales_order_id = pr.sales_order_id,\n  work_order_id = pr.work_order_id,\n  project_id = pr.project_id,\n  service_request_id = pr.service_request_id\nFROM product_requests pr\nWHERE pri.request_id = pr.id\n  AND pri.source_type IS NULL

\n\n-- Add indexes for the new FK columns\nCREATE INDEX IF NOT EXISTS idx_product_request_items_sales_order_id\n  ON product_request_items(sales_order_id) WHERE sales_order_id IS NOT NULL

\n\nCREATE INDEX IF NOT EXISTS idx_product_request_items_work_order_id\n  ON product_request_items(work_order_id) WHERE work_order_id IS NOT NULL

\n\nCREATE INDEX IF NOT EXISTS idx_product_request_items_project_id\n  ON product_request_items(project_id) WHERE project_id IS NOT NULL

\n\nCREATE INDEX IF NOT EXISTS idx_product_request_items_service_request_id\n  ON product_request_items(service_request_id) WHERE service_request_id IS NOT NULL

\n
