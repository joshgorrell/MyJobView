import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261123090000_vendor_offer_staging.sql','utf8');
for(const table of ['tenant_vendor_connections','vendor_supplier_offers']){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
  assert.match(sql,new RegExp('REVOKE ALL ON public\\.'+table+' FROM PUBLIC, anon, authenticated'));
}
assert.match(sql,/status = 'authorized'/);
assert.match(sql,/expires_at IS NULL OR expires_at > now\(\)/);
assert.match(sql,/p\.organization_id = c\.organization_id/);
assert.match(sql,/p\.default_vendor_id = c\.vendor_id/);
assert.match(sql,/v\.organization_id = c\.organization_id/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.stage_verified_vendor_offer[\s\S]*TO service_role/);
assert.doesNotMatch(sql,/UPDATE\s+public\.products|UPDATE\s+public\.po_items|UPDATE\s+public\.invoice_items/i);
console.log('Vendor offer staging security contract passed');
