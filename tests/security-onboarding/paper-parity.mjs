import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
const [staff, print, migration, detail, electronic] = await Promise.all([
  read('src/components/Finance/ManualContractEntry.tsx'),
  read('supabase/functions/generate-blank-contract-form/index.ts'),
  read('supabase/migrations/20261116190000_security_paper_onboarding_statement_parity.sql'),
  read('src/components/Finance/SecurityContractDetail.tsx'),
  read('src/components/Portal/OnboardingWizard.tsx'),
]);

// Paper signing and paper statements must remain separate choices.
assert.match(staff, /mailed_paper_statements: mailedPaperStatements/);
assert.match(staff, /signed_agreement_path: documentPath/);
assert.match(staff, /paper_signature_date: paperSignatureDate/);
assert.match(staff, /security-signed-agreements/);
assert.match(staff, /signedAgreementFile\.size > 15728640/);
assert.match(print, /Billing Statement Delivery \(Check One\)/);
assert.match(print, /Mailed paper statements \(\+\$5 for each statement mailed\)/);
assert.doesNotMatch(print, /Annual discount:/);
assert.match(print, /const annualMonitoringTotal = annualBase/);
assert.match(electronic, /mailedPaperStatements/);

// The staff RPC must enforce evidence and persist a complete audit trail.
assert.match(migration, /storage\.objects o WHERE o\.bucket_id='security-signed-agreements'/);
assert.match(migration, /o\.owner_id=auth\.uid\(\)::text/);
assert.match(migration, /o\.metadata->>'mimetype'/);
assert.match(migration, /paper_signature_date/);
assert.match(migration, /paper_entered_by/);
assert.match(migration, /paper_entered_at/);
assert.match(migration, /mailed_paper_statements=\(p_payload->>'mailed_paper_statements'\)::boolean/);
assert.match(migration, /security_staff_access\(c\.organization_id,false\)/);
assert.match(migration, /security_staff_access\(c\.organization_id,true\)/);
assert.match(detail, /createSignedUrl\(path, 60\)/);
assert.match(detail, /View Signed Paper Original/);
console.log('Paper onboarding source-contract assertions passed. Database and browser integration tests still required.');
