import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../../supabase/migrations/20261116090000_security_mail_fee_five_dollars.sql', import.meta.url), 'utf8');
const contract = await readFile(new URL('../../src/lib/securityAgreementDocument.ts', import.meta.url), 'utf8');
const onboarding = await readFile(new URL('../../src/components/Portal/OnboardingWizard.tsx', import.meta.url), 'utf8');

assert.match(migration, /mail_invoice_fee IN \(0, 5\)/);
assert.match(migration, /THEN 5 ELSE 0 END - v_old_fee/);
assert.match(migration, /THEN 5 ELSE 0 END;/);
assert.match(contract, /separately itemized on invoices/);
assert.match(onboarding, /Statement delivery:/);
assert.match(onboarding, /Mailed invoices require administrator approval/);
console.log('Security $5 mailed-invoice static checks passed');
