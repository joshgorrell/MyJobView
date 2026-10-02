import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export const setupSections = [
  {
    key: 'profile',
    label: 'Profile',
    help: 'Employee identity and contact information.',
  },
  {
    key: 'access',
    label: 'Access & Employment',
    help: 'Role, office assignments and account access.',
  },
  {
    key: 'permissions',
    label: 'Permissions',
    help: 'Department and module role defaults, individual overrides and visibility.',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    help: 'Choose the events this user receives. Notification preferences do not grant access.',
  },
  {
    key: 'pay',
    label: 'Pay & Time',
    help: 'Review employment classification, payroll, timekeeping and travel bonus.',
  },
  {
    key: 'sales',
    label: 'Sales',
    help: 'Sales representative designation and applicable sales settings.',
  },
] as const;
type Section = (typeof setupSections)[number]['key'];
export const notificationLabels = {
  notify_on_mention: 'Mentions',
  notify_on_lead_assigned: 'Assigned leads',
  notify_on_fishbowl: 'New fishbowl leads',
  notify_on_escalated: 'Escalated leads',
  notify_on_lead_status: 'Lead status changes',
  notify_on_product_requests: 'Product requests',
  email_leads: 'New lead emails',
  notify_lost_opportunity_submissions: 'Lost Opportunity responses (email and in-app)',
};
export function notificationDefaults(profile: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.keys(notificationLabels).map((k) => [
      k,
      profile[k] ?? !['email_leads', 'notify_lost_opportunity_submissions'].includes(k),
    ]),
  ) as Record<keyof typeof notificationLabels, boolean>;
}
export function UserNotifications({
  value,
  onChange,
  canViewResponses,
}: {
  value: ReturnType<typeof notificationDefaults>;
  onChange: (value: ReturnType<typeof notificationDefaults>) => void;
  canViewResponses: boolean;
}) {
  return (
    <div className="space-y-4 text-gray-200">
      <p className="text-sm">
        These are the same event preferences used in My Settings. Employees enable push notifications on their own
        devices.
      </p>
      {Object.entries(notificationLabels).map(([key, label]) => (
        <label key={key} className="flex gap-3 items-center p-3 bg-gray-800 rounded-lg">
          <input
            type="checkbox"
            checked={value[key as keyof typeof value]}
            onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      {value.notify_lost_opportunity_submissions && !canViewResponses && (
        <p className="text-amber-300 text-sm">
          Response notifications require Can View Lost Opportunity Responses in Permissions. Delivery remains restricted
          by that permission.
        </p>
      )}
    </div>
  );
}
export function UserSetupTabs({
  active,
  onSelect,
  reviewed,
  guided = false,
}: {
  active: Section | 'review';
  onSelect: (section: Section | 'review') => void;
  reviewed: string[];
  guided?: boolean;
}) {
  return (
    <div className="flex-shrink-0">
      <nav aria-label="User settings" className="flex overflow-x-auto border-b border-gray-700">
        {[...setupSections, { key: 'review' as const, label: 'Review / User Card' }].map((s) => (
          <button
            type="button"
            key={s.key}
            onClick={() => onSelect(s.key)}
            aria-current={active === s.key ? 'step' : undefined}
            className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 ${active === s.key ? 'text-cyan-300 border-cyan-400 bg-gray-800' : 'text-gray-300 border-transparent'}`}
          >
            {s.label}
            {guided && s.key !== 'review' && (
              <span className="block text-xs mt-1">
                {reviewed.includes(s.key) ? 'Complete' : active === s.key ? 'Needs review' : 'Not started'}
              </span>
            )}
          </button>
        ))}
      </nav>
      <p className="px-6 py-2 text-sm text-gray-300">
        {active === 'review'
          ? 'Review the full configuration. Print or select Save as PDF in the print dialog.'
          : setupSections.find((s) => s.key === active)?.help}
      </p>
    </div>
  );
}
export function validateSetup(
  section: string,
  profile: Record<string, unknown>,
  classification: string,
  employee: Record<string, unknown>,
  hasDepartment: boolean,
): string | null {
  if (
    section === 'profile' &&
    (!String(profile.full_name || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(profile.email || '')))
  )
    return 'Enter a full name and valid email on Profile.';
  if (section === 'access' && (!profile.role_id || String(profile.password || '').length < 6))
    return 'Select a role and enter a password of at least six characters on Access.';
  if (section === 'access' && !['employee', 'non_employee'].includes(classification))
    return 'Choose Employee or Non-Employee in Access & Employment.';
  if (section === 'permissions' && !hasDepartment) return 'Enable at least one department in Permissions.';
  if (section === 'pay' && !['employee', 'non_employee'].includes(classification))
    return 'Choose Employee or Non-Employee in Access & Employment.';
  if (section === 'pay' && classification === 'employee' && (!employee.hire_date || !employee.pay_schedule_id))
    return 'Employee setup requires a hire date and pay schedule.';
  if (
    section === 'pay' &&
    classification === 'employee' &&
    employee.expected_weekly_hours !== '' &&
    (!Number.isFinite(Number(employee.expected_weekly_hours)) || Number(employee.expected_weekly_hours) < 0)
  )
    return 'Expected weekly hours must be a non-negative number.';
  return null;
}
export async function saveSetupReview(userId: string, sections: string[]) {
  const { error } = await supabase.from('user_setup_reviews').upsert(
    {
      user_id: userId,
      reviewed_sections: sections,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`Settings saved, but setup review could not be saved: ${error.message}`);
}
export function useSetupReview(userId: string) {
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    supabase
      .from('user_setup_reviews')
      .select('reviewed_sections')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setReviewError('Setup review could not be loaded.');
        else setReviewed(data?.reviewed_sections || []);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  return { reviewed, setReviewed, reviewError };
}
const humanize = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
interface AccessSummary {
  name: string;
  enabled: boolean;
  custom: boolean;
  modules?: AccessSummary[];
}
export function UserDataCard({
  profile,
  classification,
  employee,
  offices,
  roleName,
  paySchedule,
  access,
}: {
  profile: Record<string, unknown>;
  classification: string;
  employee: Record<string, unknown>;
  offices: string[];
  roleName?: string;
  paySchedule?: string;
  access: AccessSummary[];
}) {
  const card = useRef<HTMLDivElement>(null);
  const [printError, setPrintError] = useState('');
  function print() {
    if (!card.current) return;
    const frame = document.createElement('iframe');
    frame.title = 'User Data Card';
    frame.style.cssText = 'position:fixed;left:-10000px;width:7.8in;height:10.3in;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      setPrintError('Unable to open print view.');
      return;
    }
    doc.open();
    doc.write(
      '<!doctype html><html><head><title>User Data Card</title><style>@page{size:letter portrait;margin:0.35in}body{font-family:Arial,sans-serif;color:#111;font-size:10px;margin:0}h2{font-size:20px;margin:0 0 8px}h3{font-size:12px;border-bottom:1px solid #ccc;margin:10px 0 4px}dl{display:grid;grid-template-columns:1fr;gap:3px;margin:0}dl div{display:flex;justify-content:space-between;gap:8px}dt{font-weight:600;flex:1;min-width:0}dd{margin:0;text-align:right;flex-shrink:0;max-width:55%;overflow-wrap:anywhere}section{break-inside:avoid}p{margin:4px 0}.card-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sub{font-size:9px;display:inline}.sub::after{content:" · "}</style></head><body></body></html>',
    );
    doc.close();
    doc.body.appendChild(card.current.cloneNode(true));
    requestAnimationFrame(() => {
      const el = doc.body.firstElementChild as HTMLElement;
      const maxHeight = 9.95 * 96;
      const scale = Math.min(1, maxHeight / el.scrollHeight);
      doc.body.style.height = maxHeight + 'px';
      doc.body.style.overflow = 'hidden';
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.zoom = String(scale);
      el.style.width = `${100 / scale}%`;
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    });
    frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), {
      once: true,
    });
  }
  const value = (v: unknown) =>
    typeof v === 'boolean'
      ? v
        ? 'Yes'
        : 'No'
      : Array.isArray(v)
        ? v.map(String).join(', ')
        : v == null || v === ''
          ? '—'
          : String(v);
  const rows = (entries: [string, unknown][]) => (
    <dl className="space-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="font-medium">{k}</dt>
          <dd className="text-right max-w-[55%] break-words">{value(v)}</dd>
        </div>
      ))}
    </dl>
  );
  const permissions = Object.entries(profile).filter(
    ([k]) => k.startsWith('can_') || k === 'has_calendar_access' || k.endsWith('_visibility_scope'),
  );
  return (
    <div className="space-y-4">
      <button type="button" onClick={print} className="px-4 py-2 rounded-lg bg-cyan-600 text-white">
        Print / Save as PDF
      </button>
      {printError && <p>{printError}</p>}
      <p className="text-sm text-gray-300">
        Current form values. Save changes to make this configuration permanent. Contains employee information.
      </p>
      <div ref={card} className="bg-white text-gray-900 p-6 rounded-lg user-data-card">
        <h2 className="text-xl font-bold">MyJobView · User Data Card</h2>
        <p>
          {value(profile.full_name)} · {value(profile.email)}
        </p>
        <div className="card-grid grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <section>
              <h3 className="font-bold mt-4">Profile & Access</h3>
              {rows([
                ['Name', profile.full_name],
                ['First name', profile.first_name],
                ['Last name', profile.last_name],
                ['Email', profile.email],
                ['Username', profile.username],
                ['Role', roleName || profile.role],
                ['Office access', offices.length ? offices.join(', ') : 'All offices'],
                ['Account', profile.is_active === false ? 'Inactive' : 'Active'],
                ['Classification', classification],
              ])}
            </section>
            <section>
              <h3 className="font-bold mt-4">Permissions & Visibility</h3>
              {rows(permissions.map(([k, v]) => [humanize(k), v]))}
            </section>
            <section>
              <h3 className="font-bold mt-4">Department / Module Access</h3>
              {access.map((a) => (
                <div key={a.name}>
                  <p>
                    {a.name}: {a.enabled ? 'Enabled' : 'Disabled'} · {a.custom ? 'Custom override' : 'Role default'}
                  </p>
                  {a.modules?.map((m) => (
                    <p className="sub" key={m.name}>
                      {m.name}: {m.enabled ? 'Enabled' : 'Disabled'}
                      {m.custom ? ' (override)' : ''}
                    </p>
                  ))}
                </div>
              ))}
            </section>
          </div>
          <div>
            <section>
              <h3 className="font-bold mt-4">Notifications</h3>
              {rows(Object.entries(notificationLabels).map(([k, label]) => [label, profile[k] ?? false]))}
            </section>
            <section>
              <h3 className="font-bold mt-4">Pay & Time</h3>
              {classification === 'employee' ? (
                rows(
                  Object.entries(employee)
                    .filter(([k]) => k !== 'pay_schedule_id')
                    .map(([k, v]): [string, unknown] => [humanize(k), v])
                    .concat([['Pay schedule', paySchedule || 'Not assigned']]),
                )
              ) : (
                <p>Payroll and timekeeping do not apply.</p>
              )}
              {rows([
                ['Travel bonus', profile.travel_bonus_enabled],
                ...(profile.travel_bonus_enabled
                  ? ([
                      ['Rate per mile', profile.travel_bonus_rate],
                      ['Travel method', profile.travel_bonus_method],
                    ] as [string, unknown][])
                  : []),
              ])}
            </section>
            <section>
              <h3 className="font-bold mt-4">Sales</h3>
              {rows([
                ['Sales representative', profile.is_sales_rep],
                ['Sales start date', profile.sales_rep_start_date],
              ])}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
