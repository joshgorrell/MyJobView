import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261112194500_guarded_legacy_change_addition_repair.sql',import.meta.url),'utf8');
for(const required of [
 /SECURITY DEFINER/,/v_role <> 'admin'/,/v_co.status <> 'approved'/,
 /v_co.is_active IS DISTINCT FROM false/,/v_co.is_locked IS DISTINCT FROM true/,
 /v_co.approval_date IS NULL/,/v_co.customer_approved IS DISTINCT FROM true/,
 /change_order_commit\.revisions/,/committed_change_order_line_id=p_change_line_id/,
 /product_id IS NOT DISTINCT FROM v_line.product_id/,
 /pg_advisory_xact_lock/,/RETURNING id INTO v_inserted/,
 /REVOKE ALL ON FUNCTION/,/GRANT EXECUTE ON FUNCTION/,
 /calculate_proposal_totals/
])assert.match(sql,required);
assert.doesNotMatch(sql,/\bUPDATE\s+public\.change_orders\b/i);
assert.doesNotMatch(sql,/\bDELETE\s+FROM\b/i);
console.log('PASS: explicit legacy addition repair requires admin, applied approval, duplicate guard and totals refresh');
