/*\n  # Fix Null item_type in invoice_line_items (Retroactive + Forward)\n\n  ## Summary\n  Existing invoice_line_items rows may have null item_type. This migration:\n\n  1. Retroactively fixes existing null item_type values using description heuristics:\n     - If description contains labor-related keywords → 'labor'\n     - Everything else → 'material'\n\n  2. Sets a DEFAULT of 'material' on item_type going forward so no future rows have null\n\n  ## Notes\n  - No data is deleted, purely a quality fix\n*/\n\nUPDATE invoice_line_items\nSET item_type = 'labor'\nWHERE item_type IS NULL\n  AND (\n    description ILIKE '%labor%'\n    OR description ILIKE '%installation%'\n    OR description ILIKE '%service call%'\n    OR description ILIKE '%technician%'\n    OR description ILIKE '%trip charge%'\n    OR description ILIKE '%diagnostic%'\n    OR description ILIKE '%programming%'\n    OR description ILIKE '%wiring%'\n    OR description ILIKE '%commissioning%'\n    OR description ILIKE '%low voltage%'\n    OR description ILIKE '%install labor%'\n  )

\n\nUPDATE invoice_line_items\nSET item_type = 'material'\nWHERE item_type IS NULL

\n\nALTER TABLE invoice_line_items\n  ALTER COLUMN item_type SET DEFAULT 'material'

\n
