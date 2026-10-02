import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const dir = await mkdtemp(tmpdir() + '/mjv-user-setup-');
try {
  await build({
    stdin: {
      contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {UserDataCard} from './src/components/Admin/UserSetup'; export * from './src/components/Admin/UserSetup'; export function renderCard(props){return renderToStaticMarkup(React.createElement(UserDataCard,props))}`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    outfile: dir + '/setup.cjs',
    plugins: [
      {
        name: 'supabase-stub',
        setup(b) {
          b.onResolve({ filter: /lib\/supabase$/ }, () => ({
            path: 'stub',
            namespace: 'stub',
          }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export const supabase={};',
          }));
        },
      },
    ],
  });
  const { validateSetup, notificationDefaults, renderCard } = await import(pathToFileURL(dir + '/setup.cjs'));
  const profile = {
    full_name: 'Employee',
    email: 'employee@example.com',
    role_id: 'role',
    password: 'secret',
  };
  const emp = {
    hire_date: '2026-10-01',
    pay_schedule_id: 'schedule',
    expected_weekly_hours: '40',
  };
  assert.equal(validateSetup('profile', profile, 'employee', emp, true), null);
  assert.ok(validateSetup('profile', { ...profile, email: 'bad' }, 'employee', emp, true));
  assert.ok(validateSetup('access', { ...profile, password: '' }, 'employee', emp, true));
  assert.ok(validateSetup('permissions', profile, 'employee', emp, false));
  assert.ok(validateSetup('pay', profile, '', emp, true));
  assert.ok(validateSetup('pay', profile, 'employee', { ...emp, pay_schedule_id: '' }, true));
  assert.ok(validateSetup('pay', profile, 'employee', { ...emp, expected_weekly_hours: '-1' }, true));
  assert.equal(validateSetup('pay', profile, 'non_employee', {}, true), null);
  assert.equal(notificationDefaults({ notify_on_mention: false }).notify_on_mention, false);
  assert.equal(notificationDefaults().email_leads, false);
  const card = renderCard({
    profile: { ...profile, password: 'NeverPrintThis', can_create_proposals: false, ...notificationDefaults() },
    classification: 'employee',
    employee: emp,
    offices: ['Topeka'],
    access: [
      { name: 'Pipeline', enabled: true, custom: true, modules: [{ name: 'Proposals', enabled: false, custom: true }] },
    ],
  });
  assert.ok(card.includes('Proposals'));
  assert.ok(card.includes('Disabled'));
  assert.ok(card.includes('Weekly') === false);
  assert.ok(!card.includes('NeverPrintThis'));
  assert.ok(card.includes('Topeka'));
  console.log('User setup field validation and notification defaults passed.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
