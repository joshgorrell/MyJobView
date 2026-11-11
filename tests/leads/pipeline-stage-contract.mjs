import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const stages = read('src/components/Sales/PipelineStageOverview.tsx');
const board = read('src/components/Sales/PipelineBoard.tsx');
const contactForm = read('src/components/Contacts/ContactForm.tsx');
const leadDetail = read('src/components/Leads/LeadDetail.tsx');

for (const name of ['Prospects', 'Leads', 'Proposals', 'Sales Orders']) {
  assert.ok(stages.includes('>' + name + ' <'), 'Missing navigable pipeline stage: ' + name);
}
assert.match(stages, /from\('contacts'\)[\s\S]*?eq\('contact_type', 'prospect'\)/, 'Prospects must come from canonical Contacts');
assert.match(stages, /from\('leads'\)[\s\S]*?is\('converted_at', null\)/, 'Lead count must exclude converted leads');
assert.match(stages, /from\('proposals'\)[\s\S]*?is\('sales_order_id', null\)/, 'Proposals count must not include created Sales Orders');
assert.match(stages, /from\('sales_orders'\)/, 'Sales Orders count must use the canonical orders table');
assert.match(stages, /OPEN_ORDER_STATUSES = \['pending_deposit', 'pending_po', 'planning', 'active'\]/, 'Only open orders should be counted');
assert.match(stages, /ACTIVE_PROPOSAL_STATUSES/, 'Only active proposals should be counted');
assert.match(stages, /canViewProspects \? prospectQuery/, 'Prospect permissions must be respected');
assert.match(stages, /onOpenProspect\(prospect.id\)/, 'Prospect cards must open the existing Contact Detail');
assert.match(board, /<PipelineStageOverview/, 'Pipeline Board must mount the stage overview');
assert.match(board, /initialSalesStatus=\{contactFormInitialStatus\}/, 'New Prospect must use the existing Contact Form');
assert.match(board, /\.not\('status', 'in', '\(closed_won,closed_lost\)'\)/, 'Closed Leads must not remain in the open Leads widget');
assert.match(contactForm, /initialSalesStatus \?\? draft\?\.salesStatus/, 'Explicit Prospect quick-create must override an old draft');
assert.doesNotMatch(leadDetail, /window\.location\.href = '\/pipeline'/, 'Prospect downgrade must not navigate to obsolete /pipeline route');
const contactDetail = read('src/components/Contacts/ContactDetail.tsx');
const promotion = read('supabase/migrations/20261111193000_promote_prospect_on_lead_insert.sql');
assert.match(contactDetail, /if \(target === 'lead'\) \{[\s\S]*?setShowConvertForm\(true\)/, 'Prospect conversion must create a real Lead, not only relabel the Contact');
assert.match(promotion, /AFTER INSERT ON public\.leads/, 'Prospect promotion must be tied to canonical Lead creation');
assert.match(promotion, /SET contact_type = 'lead'/, 'Prospect Contact must move out of Prospects');
assert.match(promotion, /AND contact_type = 'prospect'/, 'Only Prospect Contacts should be reclassified');
assert.match(promotion, /AND organization_id = NEW\.organization_id/, 'Prospect promotion must be tenant scoped');

console.log('Pipeline stage contract checks passed.');
