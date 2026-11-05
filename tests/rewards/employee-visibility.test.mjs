import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261105193000_employee_rewards_visibility.sql');
const admin = read('src/components/Admin/PointsAndRewards.tsx');
const dashboard = read('src/components/Rewards/RewardsDashboard.tsx');
const department = read('src/contexts/DepartmentContext.tsx');

test('employee visibility defaults off and is independent of action accrual', () => {
  assert.match(migration, /employee_visible boolean NOT NULL DEFAULT false/);
  assert.match(migration, /SET employee_visible = EXCLUDED\.employee_visible/);
  assert.doesNotMatch(migration, /UPDATE public\.points_transactions|DELETE FROM public\.points_transactions/i);
  assert.doesNotMatch(migration, /SET enabled\s*=/i);
});

test('only rewards administrators may change visibility', () => {
  assert.match(migration, /IF NOT private\.is_rewards_admin\(\) THEN/);
  assert.match(migration, /private\.rewards_actor_org\(true\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_employee_rewards_visibility\(boolean\) FROM PUBLIC, anon/);
});

test('hidden rewards cannot be redeemed through the database RPC', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.redeem_reward_atomic\(p_reward_id uuid,p_request_key uuid\)/);
  assert.match(migration, /NOT private\.is_rewards_admin\(\) AND NOT public\.get_employee_rewards_visibility\(\)/);
  assert.match(migration, /ERRCODE='42501'/);
});

test('employee dashboard and navigation fail closed', () => {
  assert.match(department, /key === 'rewards_dashboard'.*!employeeRewardsVisible/);
  assert.match(dashboard, /if \(visibility === false\) return null/);
  assert.match(dashboard, /if \(visibility === null\)/);
  assert.match(dashboard, /if \(allowed\) void loadData\(\)/);
  assert.match(admin, /Show Points & Rewards to employees/);
  assert.match(admin, /set_employee_rewards_visibility/);
});
