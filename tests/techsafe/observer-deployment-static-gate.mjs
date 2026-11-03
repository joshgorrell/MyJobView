import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../..');
const migrationDir=path.join(root,'supabase/migrations');
const read=name=>fs.readFileSync(path.join(migrationDir,name),'utf8');
const observer=read('20261030184035_techsafe_opt_in_application_observer.sql');
const primitives=read('20261030182910_techsafe_private_application_observations.sql');
const files=fs.readdirSync(migrationDir).filter(x=>x.endsWith('.sql')).sort();
const prerequisite='20261030182910_techsafe_private_application_observations.sql';
const attachment='20261030184035_techsafe_opt_in_application_observer.sql';

assert.ok(files.indexOf(prerequisite)>=0&&files.indexOf(attachment)>files.indexOf(prerequisite));
assert.match(primitives,/CREATE TABLE techsafe_source\.application_observations\s*\(/);
assert.match(primitives,/ENABLE ROW LEVEL SECURITY/);
assert.match(primitives,/REVOKE ALL ON TABLE techsafe_source\.application_observations FROM PUBLIC,anon,authenticated/);
assert.match(observer,/enabled boolean NOT NULL DEFAULT false/);
assert.match(observer,/REVOKE ALL ON TABLE techsafe_source\.application_observer_controls FROM PUBLIC,anon,authenticated/);
assert.match(observer,/TECHSAFE_OBSERVER_BEGIN_START/);
assert.match(observer,/TECHSAFE_OBSERVER_FINISH_START/);
assert.match(observer,/try_begin_application_observation\(p_change_order_id\)/);
assert.match(observer,/try_finish_application_observation\(p_change_order_id,v_techsafe_observation\)/);
assert.match(observer,/Observer changed application business body/);
assert.doesNotMatch(observer,/INSERT\s+INTO\s+techsafe_source\.application_observer_controls/i);
assert.doesNotMatch(observer,/CREATE\s+TRIGGER/i);
assert.doesNotMatch(observer,/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.apply_change_order/i);

// Static safety checks only. This cannot prove a deployment, an unchanged
// live function definition, successful migration replay, or concurrency.
console.log('Techsafe observer migration static gate passed; deployment and native-schema checks remain required.');
