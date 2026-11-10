import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const leadForm = read('src/components/Leads/LeadForm.tsx');
const proposalModal = read('src/components/Proposals/CreateProposalModal.tsx');
const conversion = read('supabase/migrations/20261111000001_convert_contact_proposals_to_leads.sql');
const sync = read('supabase/migrations/20261111000002_sync_existing_lead_contact_links.sql');
const contactType = read('supabase/migrations/20261111000003_convert_contact_type_when_quoted.sql');
const initial = read('supabase/migrations/20261111000000_convert_leads_on_proposal.sql');

// Lead intake always creates/reuses the canonical Contact and persists its ID.
assert.match(leadForm, /converted_from_contact_id: contactId/);
assert.match(leadForm, /contact_id: contactId/);
assert.match(sync, /SET contact_id = converted_from_contact_id/);
assert.match(sync, /BEFORE INSERT OR UPDATE OF contact_id, converted_from_contact_id/);

// Proposal creation from a Lead must use the explicit Contact link first.
assert.match(proposalModal, /linkedLead\\?\\.contact_id \\|\\| linkedLead\\?\\.converted_from_contact_id/);
assert.match(proposalModal, /\\.eq\\('id', linkedContactId\\)/);
assert.match(proposalModal, /lead_id: resolvedLeadId/);
assert.match(proposalModal, /contact_id: resolvedContactId/);

// Both proposal entry points convert the linked active Lead, but ambiguity
// must not close unrelated opportunities for the same Contact.
assert.match(initial, /AFTER INSERT OR UPDATE OF lead_id ON public\\.proposals/);
assert.match(conversion, /WHERE contact_id = NEW\\.contact_id AND converted_at IS NULL/);
assert.match(conversion, /HAVING count\\(\\*\\) = 1/);
assert.match(conversion, /SET converted_at = COALESCE/);

// Contact classification must also leave the Leads filter; no deletion.
assert.match(contactType, /AFTER INSERT OR UPDATE OF contact_id ON public\\.proposals/);
assert.match(contactType, /WHERE id = NEW\\.contact_id AND contact_type = 'lead'/);
assert.match(contactType, /EXISTS \\(SELECT 1 FROM public\\.proposals p WHERE p\\.contact_id = c\\.id\\)/);
assert.doesNotMatch(contactType, /DELETE FROM public\\.contacts/i);
console.log('Lead → Contact → Proposal conversion regression contracts passed');
