/*\n  # Add source_type to work_orders\n\n  ## Summary\n  Adds a `source_type` column to the `work_orders` table to track where each work order originated.\n\n  ## Changes\n  - **work_orders table**: New `source_type` column (text, nullable) with a check constraint\n  - **source_type values**: dispatch_calendar | technician_calendar | service_request | project | contact | work_orders_list | punchlist_portal\n\n  ## Notes\n  - Nullable so existing records are unaffected\n  - When a work order is created from a service request that itself originated from the customer punchlist portal, source_type is set to 'punchlist_portal'\n  - This enables the UI to display "From: Customer Punchlist" on relevant work orders\n*/\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'work_orders' AND column_name = 'source_type'\n  ) THEN\n    ALTER TABLE work_orders\n      ADD COLUMN source_type text

\n\n    ALTER TABLE work_orders\n      ADD CONSTRAINT work_orders_source_type_check\n      CHECK (source_type IN (\n        'dispatch_calendar',\n        'technician_calendar',\n        'service_request',\n        'project',\n        'contact',\n        'work_orders_list',\n        'punchlist_portal'\n      ))

\n  END IF

\nEND $$

\n
