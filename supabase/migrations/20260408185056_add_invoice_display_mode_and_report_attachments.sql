/*\n  # Add Invoice Display Mode and Report Attachment Flags\n\n  ## Summary\n  This migration adds per-invoice settings to control:\n  1. How line items are displayed to customers (summarized vs detailed labor/parts breakdown)\n  2. Whether financial reports should be attached to progress invoices\n\n  ## New Columns on `invoices` table\n\n  - `line_item_display_mode` (text): Controls how line items are rendered\n    - `'summarized'` (default) - One line per billing row, tax breakdown is calculated proportionally\n    - `'detailed'` - Line items are split into separate labor and parts rows for full transparency\n\n  - `attach_financial_summary` (boolean, default false): When true, the Project Financial Summary\n    report is included when viewing/sending this invoice (shows paid/remaining/CO totals)\n\n  - `attach_combined_sales_order` (boolean, default false): When true, the Combined Sales Order\n    report is included when viewing/sending this invoice (shows full itemized contract breakdown)\n\n  ## Security\n  - No new tables, existing RLS on invoices table covers these columns\n*/\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'invoices' AND column_name = 'line_item_display_mode'\n  ) THEN\n    ALTER TABLE invoices ADD COLUMN line_item_display_mode text\n      DEFAULT 'summarized'\n      CHECK (line_item_display_mode IN ('summarized', 'detailed'))

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'invoices' AND column_name = 'attach_financial_summary'\n  ) THEN\n    ALTER TABLE invoices ADD COLUMN attach_financial_summary boolean DEFAULT false

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'invoices' AND column_name = 'attach_combined_sales_order'\n  ) THEN\n    ALTER TABLE invoices ADD COLUMN attach_combined_sales_order boolean DEFAULT false

\n  END IF

\nEND $$

\n
