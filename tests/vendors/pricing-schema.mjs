import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261121190000_add_product_pricing_mode.sql', import.meta.url), 'utf8');
assert.match(migration, /ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'fixed'/i);
assert.match(migration, /CHECK \(pricing_mode IN \('retail', 'fixed', 'margin'\)\)/i);
assert.match(migration, /ADD COLUMN IF NOT EXISTS vendor_retail_price numeric/i);
assert.match(migration, /vendor_retail_price IS NULL OR vendor_retail_price >= 0/i);
assert.doesNotMatch(migration, /UPDATE\s+public\.products|DELETE\s+FROM\s+public\.products|DROP\s+COLUMN/i);
console.log('Product pricing mode migration contract passed');
