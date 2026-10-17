import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const header = readFileSync('src/components/Layout/Header.tsx', 'utf8');
const lead = readFileSync('src/components/Leads/LeadForm.tsx', 'utf8');

assert.doesNotMatch(header, /Work Order Request/);
assert.match(header, /Service Request/);
assert.match(header, /New Lead/);
assert.match(app, /New Service Request/);
assert.match(app, /setShowServiceTypePicker\(true\)/);
assert.match(app, /setShowServiceRequestForm\(true\)/);
assert.match(app, /setShowAiTaskForm\(true\)/);
assert.match(app, /setShowSupportTaskForm\(true\)/);
assert.match(app, /supportMode/);
const taskForm = readFileSync('src/components/Tasks/TaskForm.tsx', 'utf8');
assert.match(taskForm, /supportMode\?: boolean/);
assert.match(taskForm, /Select a customer contact for this support request/);
assert.match(taskForm, /supportMode \? 'New Support Request'/);
assert.match(app, /aiPrefill=\{aiLeadPrefill\}/);
assert.match(app, /setAiLeadPrefill\(\(action\.prefill as LeadPrefill/);
assert.match(lead, /aiPrefill\?:/);
assert.match(lead, /opportunity_description: aiPrefill\.description/);
assert.match(lead, /priority: \['low', 'medium', 'high', 'urgent'\]/);
assert.ok(lead.indexOf('loadSalesReps();') < lead.indexOf('if (!aiPrefill) return;'), 'AI prefill must override restored draft');
console.log('Service entry and lead AI prefill contract passed');
