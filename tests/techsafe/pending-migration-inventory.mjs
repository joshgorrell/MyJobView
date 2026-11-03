import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Repository-side deployment inventory; does not access Supabase.
const dir=path.resolve(import.meta.dirname,'../../supabase/migrations');
const names=fs.readdirSync(dir).filter(x=>/^\d{14}_.+\.sql$/.test(x)).sort();
const lastLive='20261029202752';
const pending=names.filter(x=>x.slice(0,14)>lastLive);
const techsafe=pending.filter(x=>/techsafe/i.test(x));
assert.ok(pending.length>0,'Expected repository migrations beyond live migration watermark');
assert.ok(techsafe.length>0,'Expected missing Techsafe migration files');
const required=[
 '20261030182910_techsafe_private_application_observations.sql',
 '20261030184035_techsafe_opt_in_application_observer.sql',
 '20261031213103_techsafe_bounded_candidate_input_bundle.sql'
];
for(const name of required)assert.ok(pending.includes(name),'Missing integration dependency: '+name);
assert.ok(pending.indexOf(required[0])<pending.indexOf(required[1]));
const observer=fs.readFileSync(path.join(dir,required[1]),'utf8');
assert.match(observer,/enabled boolean NOT NULL DEFAULT false/);
assert.doesNotMatch(observer,/INSERT\s+INTO\s+techsafe_source\.application_observer_controls/i);
const report={liveMigrationWatermark:lastLive,pendingCount:pending.length,techsafeCount:techsafe.length,
 firstPending:pending[0],lastPending:pending.at(-1),observerDefaultOff:true,
 safeToDeploy:false,liveSchemaVerified:false,nativeConcurrencyVerified:false};
console.log(JSON.stringify(report));
