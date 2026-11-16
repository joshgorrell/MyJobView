import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Contract tests for the billing helper's safety boundaries. Runtime integration
// tests must additionally exercise the database and QuickBooks invoice writer.
const source = await readFile(new URL('../../src/lib/securityStatementBilling.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../supabase/migrations/20261116160000_security_paper_statements_independent.sql', import.meta.url), 'utf8');

assert.match(source, /PAPER_STATEMENT_MONTHLY_FEE = 5/);
assert.match(source, /Manual billing requires mailed paper statements/);
assert.match(source, /autopayRequired: input.paymentMode === 'autopay'/);
assert.match(source, /paperFeeAnnual: paperFeeMonthly \* 12/);
assert.match(source, /monitoringAnnual - savings \+ billing.paperFeeAnnual/);
assert.match(migration, /mailed_paper_statements boolean NOT NULL DEFAULT false/);
assert.match(migration, /security_billing_mode <> 'mail' OR mailed_paper_statements = true/);
assert.match(migration, /Only an Admin may change mailed paper statements/);
assert.match(migration, /OLD.customer_completed_at IS NOT NULL/);
assert.match(migration, /organization_id = NEW.organization_id AND role = 'admin'/);
assert.match(migration, /'mailedPaperStatements', CASE WHEN jsonb_typeof\(p_form->'mailedPaperStatements'\) = 'boolean'/);
assert.match(migration, /ELSE false END/);
console.log('Statement billing source contract checks passed');
