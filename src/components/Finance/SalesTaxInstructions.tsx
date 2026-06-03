import { useEffect, useRef, useState } from 'react';
import { BookOpen, Printer, ChevronDown, ChevronRight, ExternalLink, FileText, AlertCircle, CheckCircle, Info, BarChart2, Save, CreditCard as Edit2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  STATE_TAX_RULES,
  EXEMPTION_CATEGORY_LABELS,
  STATE_EXEMPTION_FORMS,
  TaxEnvironment,
  TaxProjectType,
} from '../../lib/taxCalculations';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  printAlwaysOpen?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS — all project-type / environment combos to show in the matrix
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_TYPES: { key: TaxProjectType; label: string }[] = [
  { key: 'original_construction', label: 'Original Construction' },
  { key: 'remodel', label: 'Remodel' },
  { key: 'general_installation_repair', label: 'General Installation / Repair' },
  { key: 'maintenance_agreement', label: 'Maintenance Agreement' },
  { key: 'membership', label: 'Membership / VIP Plan' },
  { key: 'security_monitoring', label: 'Security Monitoring' },
  { key: 'design_services', label: 'Design Services' },
  { key: 'exempt_project', label: 'Exempt Project' },
];

const ENVIRONMENTS: { key: TaxEnvironment; label: string }[] = [
  { key: 'residential', label: 'Residential' },
  { key: 'commercial', label: 'Commercial' },
];

// Project types where residential vs commercial produces different results
const ENV_SENSITIVE_TYPES: TaxProjectType[] = [
  'original_construction',
  'remodel',
];

// ─────────────────────────────────────────────────────────────────────────────
// COLLAPSIBLE SECTION
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, icon, defaultOpen = true, children, printAlwaysOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden mb-5 print:border-gray-300 print:mb-6 ${printAlwaysOpen ? 'print:block' : ''}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left print:bg-white print:pointer-events-none"
      >
        <div className="flex items-center gap-2.5 font-semibold text-gray-800 text-sm">
          {icon}
          {title}
        </div>
        <span className="print:hidden text-gray-400">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>
      <div className={`${open ? 'block' : 'hidden'} print:block`}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX MATRIX for a single state
// ─────────────────────────────────────────────────────────────────────────────

function TaxMatrix({ stateCode }: { stateCode: string }) {
  const rule = STATE_TAX_RULES[stateCode];
  if (!rule) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100 print:bg-gray-100">
            <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-44">Project Type</th>
            <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-28">Environment</th>
            <th className="text-center px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-24">Parts Taxable?</th>
            <th className="text-center px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-24">Labor Taxable?</th>
            <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">Explanation / Statute</th>
          </tr>
        </thead>
        <tbody>
          {PROJECT_TYPES.map(pt => {
            const envList = ENV_SENSITIVE_TYPES.includes(pt.key) ? ENVIRONMENTS : [{ key: 'residential' as TaxEnvironment, label: '—' }];
            return envList.map((env, ei) => {
              const result = rule.getApplicability(env.key, pt.key);
              const isFirst = ei === 0;
              return (
                <tr key={`${pt.key}-${env.key}`} className="hover:bg-blue-50 print:hover:bg-transparent">
                  {isFirst && (
                    <td
                      rowSpan={envList.length}
                      className="px-3 py-2 border border-gray-200 font-medium text-gray-800 align-middle"
                    >
                      {pt.label}
                    </td>
                  )}
                  <td className="px-3 py-2 border border-gray-200 text-gray-600">{env.label}</td>
                  <td className="px-3 py-2 border border-gray-200 text-center">
                    {result.partsTaxable ? (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                        <AlertCircle className="w-3 h-3 print:hidden" /> Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                        <CheckCircle className="w-3 h-3 print:hidden" /> No
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 text-center">
                    {result.laborTaxable ? (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                        <AlertCircle className="w-3 h-3 print:hidden" /> Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                        <CheckCircle className="w-3 h-3 print:hidden" /> No
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600 italic">{result.explanation}</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2 px-1 print:text-gray-600">
        This table is generated live from the system tax rules — it always reflects current tax logic.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILING STEPS — driven by state rules
// ─────────────────────────────────────────────────────────────────────────────

interface FilingStepsProps {
  stateCode: string;
  filingDueDay: number;
}

const STATE_REPORT_KEYS: Record<string, string> = {
  KS: 'KS — ST-36 Worksheet',
  MO: 'MO — Form 53-1 Worksheet',
};

const STATE_DOR_INSTRUCTIONS: Record<string, React.ReactNode> = {
  KS: (
    <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed">
      <li>Log in to <strong>ksrevenue.gov</strong> and navigate to <em>Sales Tax → File ST-36</em>.</li>
      <li>Select the filing period (the month you are filing for).</li>
      <li>Enter <strong>Gross Sales</strong> from the worksheet <em>Total Gross Sales</em> column.</li>
      <li>Enter each deduction category exactly as shown in the worksheet (residential labor, commercial construction labor, design services, security monitoring, exempt/non-profit/government sales).</li>
      <li>Confirm the <strong>Net Taxable Sales</strong> and <strong>Net Tax Due</strong> match the worksheet totals.</li>
      <li>Pay electronically. Retain confirmation number and attach it to the worksheet file.</li>
      <li>File the worksheet CSV in the shared drive under <em>Tax Filings / KS / YYYY-MM</em>.</li>
    </ol>
  ),
  MO: (
    <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed">
      <li>Log in to <strong>MyTax Missouri</strong> at <em>mytax.mo.gov</em> and navigate to <em>Sales Tax → File Form 53-1</em>.</li>
      <li>Select the filing period.</li>
      <li>Enter <strong>Gross Receipts</strong> from the worksheet total.</li>
      <li>Enter deductions for non-taxable labor (construction/remodel), design services, security monitoring, exempt sales, non-profit, and government.</li>
      <li>Enter the breakdown for state (4.225%), county, city, and special district tax — use the rates from your configured jurisdictions.</li>
      <li>Confirm <strong>Net Tax Due</strong> matches the worksheet. Pay electronically.</li>
      <li>File the worksheet CSV in the shared drive under <em>Tax Filings / MO / YYYY-MM</em>.</li>
    </ol>
  ),
};

function FilingSteps({ stateCode, filingDueDay }: FilingStepsProps) {
  const rule = STATE_TAX_RULES[stateCode];
  if (!rule) return null;
  const reportTabLabel = STATE_REPORT_KEYS[stateCode] ?? `${stateCode} Worksheet`;
  const dorInstructions = STATE_DOR_INSTRUCTIONS[stateCode];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm print:bg-white print:border-gray-300">
        <div className="flex gap-2 items-start">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0 print:hidden" />
          <div>
            <span className="font-semibold text-blue-800">Filing deadline:</span>{' '}
            <span className="text-blue-700">
              The {rule.filingFormNumber} is due by the <strong>{filingDueDay}th of the month following</strong> the filing period.
              File for January by February {filingDueDay}, etc.
            </span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 text-sm mb-2">Step 1 — Generate the Worksheet in the System</h4>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed">
          <li>Go to <strong>Finance → Sales Tax Reports</strong>.</li>
          <li>Click the <strong>{reportTabLabel}</strong> tab.</li>
          <li>Select the month you are filing for using the month/year picker.</li>
          <li>Review all line items. Verify deduction categories match the project types on the underlying proposals.</li>
          <li>Export the worksheet using <strong>Export CSV</strong> and save a printed copy using <strong>Print</strong>.</li>
        </ol>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 text-sm mb-2">Step 2 — File with {rule.stateName} ({rule.filingFormNumber})</h4>
        {dorInstructions ?? (
          <p className="text-sm text-gray-600">
            Log in to <a href={rule.revenueAuthorityUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{rule.revenueAuthorityUrl}</a> and enter the totals from the exported worksheet.
          </p>
        )}
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 text-sm mb-2">Step 3 — Record and Archive</h4>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed">
          <li>Record the confirmation number or payment receipt in the filing log.</li>
          <li>Save the exported CSV and printed worksheet in the shared drive under <em>Tax Filings / {stateCode} / YYYY-MM</em>.</li>
          <li>Note the amount paid in the accounting system.</li>
        </ol>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMON SCENARIOS — generated from the rules matrix
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIOS: { q: string; envs: TaxEnvironment[]; type: TaxProjectType }[] = [
  { q: 'Residential security system install (new construction)', envs: ['residential'], type: 'original_construction' },
  { q: 'Commercial security system install (new construction)', envs: ['commercial'], type: 'original_construction' },
  { q: 'Residential system upgrade / remodel', envs: ['residential'], type: 'remodel' },
  { q: 'Commercial system upgrade / remodel', envs: ['commercial'], type: 'remodel' },
  { q: 'Service call / general repair', envs: ['residential', 'commercial'], type: 'general_installation_repair' },
  { q: 'Monthly maintenance agreement', envs: ['residential', 'commercial'], type: 'maintenance_agreement' },
  { q: 'VIP / Punchlist membership', envs: ['residential', 'commercial'], type: 'membership' },
  { q: 'Recurring security monitoring fee', envs: ['residential', 'commercial'], type: 'security_monitoring' },
  { q: 'Design consulting / site survey fee', envs: ['residential', 'commercial'], type: 'design_services' },
  { q: 'Tax-exempt customer (non-profit, government, etc.)', envs: ['residential', 'commercial'], type: 'exempt_project' },
];

function CommonScenarios({ activeStates }: { activeStates: string[] }) {
  return (
    <div className="space-y-3">
      {SCENARIOS.map(scenario => (
        <div key={`${scenario.type}-${scenario.envs.join()}`} className="border border-gray-200 rounded-lg overflow-hidden print:border-gray-300">
          <div className="bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-800 print:bg-gray-100">
            Q: {scenario.q}
          </div>
          <div className="px-4 py-3 space-y-2">
            {activeStates.map(stateCode => {
              const rule = STATE_TAX_RULES[stateCode];
              if (!rule) return null;
              // Use first env if multiple (result is same)
              const result = rule.getApplicability(scenario.envs[0], scenario.type);
              return (
                <div key={stateCode} className="flex items-start gap-2 text-sm">
                  <span className="font-bold text-gray-600 w-8 shrink-0">{stateCode}:</span>
                  <span className="text-gray-700">
                    <span className={result.partsTaxable ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>
                      Parts — {result.partsTaxable ? 'Taxable' : 'Not Taxable'}
                    </span>
                    {' | '}
                    <span className={result.laborTaxable ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>
                      Labor — {result.laborTaxable ? 'Taxable' : 'Not Taxable'}
                    </span>
                    <span className="text-gray-500 italic ml-1">({result.explanation})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN NOTES — per-state editable notes stored in company_settings
// ─────────────────────────────────────────────────────────────────────────────

interface AdminNotesProps {
  stateCode: string;
  isAdmin: boolean;
  notes: Record<string, string>;
  onSave: (stateCode: string, note: string) => Promise<void>;
}

function AdminNotes({ stateCode, isAdmin, notes, onSave }: AdminNotesProps) {
  const current = notes[stateCode] ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(stateCode, draft);
    setSaving(false);
    setEditing(false);
  };

  if (!current && !isAdmin) return null;

  return (
    <div className="mt-4 border-t border-dashed border-gray-200 pt-4 print:mt-3 print:pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin Notes — {stateCode}</span>
        {isAdmin && !editing && (
          <button
            onClick={() => { setDraft(current); setEditing(true); }}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 print:hidden"
          >
            <Edit2 className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder={`Add notes, exceptions, or reminders specific to ${STATE_TAX_RULES[stateCode]?.stateName ?? stateCode} filings...`}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-3 h-3" /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      ) : current ? (
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 print:bg-white print:border-gray-300">
          {current}
        </p>
      ) : isAdmin ? (
        <p className="text-xs text-gray-400 italic">No notes yet. Click Edit to add notes for this state.</p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function SalesTaxInstructions() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager';
  const printRef = useRef<HTMLDivElement>(null);

  const [nexusStates, setNexusStates] = useState<string[]>([]);
  const [filingDueDay, setFilingDueDay] = useState(25);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('nexus_states, tax_filing_due_day, billing_instructions_notes, updated_at')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setNexusStates(data.nexus_states?.length ? data.nexus_states : ['KS']);
          setFilingDueDay(data.tax_filing_due_day ?? 25);
          setAdminNotes(data.billing_instructions_notes ?? {});
          setLastUpdated(data.updated_at ?? null);
        }
        setLoading(false);
      });
  }, []);

  const activeStates = nexusStates.filter(s => STATE_TAX_RULES[s]);

  const handleSaveNote = async (stateCode: string, note: string) => {
    const updated = { ...adminNotes, [stateCode]: note };
    setAdminNotes(updated);
    await supabase
      .from('company_settings')
      .update({ billing_instructions_notes: updated })
      .not('id', 'is', null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const now = new Date();
  const generatedAt = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6 print:mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-blue-600 print:hidden" />
            <h1 className="text-xl font-bold text-gray-900">Sales Tax Filing Guide</h1>
          </div>
          <p className="text-sm text-gray-500">
            Billing team procedures for sales tax calculation, reporting, and filing.
            {' '}
            <span className="text-blue-600 font-medium">
              This guide is auto-generated from live system rules — it always reflects current tax logic.
            </span>
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">
              Settings last updated: {new Date(lastUpdated).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors shrink-0 print:hidden"
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>

      {/* ── Print header (hidden on screen) ── */}
      <div className="hidden print:block mb-6 pb-4 border-b-2 border-gray-800">
        <h1 className="text-2xl font-bold text-gray-900">Sales Tax Filing Guide — Billing Team Reference</h1>
        <p className="text-sm text-gray-600 mt-1">Generated: {generatedAt} | Active states: {activeStates.join(', ') || 'None configured'}</p>
      </div>

      <div ref={printRef}>
        {/* ── Quick Reference Card ── */}
        <Section
          title="Quick Reference Card"
          icon={<BarChart2 className="w-4 h-4 text-blue-600" />}
          defaultOpen
        >
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
              {activeStates.map(stateCode => {
                const rule = STATE_TAX_RULES[stateCode];
                if (!rule) return null;
                return (
                  <div key={stateCode} className="border border-blue-200 bg-blue-50 rounded-xl p-4 print:bg-white print:border-gray-400">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-blue-800">{rule.stateName}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium print:bg-gray-100 print:text-gray-700">
                        {stateCode}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Filing Form:</span>
                        <span className="font-semibold text-gray-800">{rule.filingFormNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Due Date:</span>
                        <span className="font-semibold text-gray-800">{filingDueDay}th of following month</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Exemption Form:</span>
                        <span className="font-semibold text-gray-800">{rule.exemptionFormNumber}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Revenue Authority:</span>
                        <a
                          href={rule.revenueAuthorityUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1 font-medium print:text-gray-700 print:no-underline"
                        >
                          {rule.revenueAuthorityUrl.replace('https://', '')}
                          <ExternalLink className="w-3 h-3 print:hidden" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
              {activeStates.length === 0 && (
                <div className="col-span-2 text-center py-8 text-gray-400 text-sm">
                  No nexus states configured. Go to Admin → Tax Rate Management to add states.
                </div>
              )}
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 print:bg-white print:border-gray-300">
              <p className="text-xs text-amber-800 font-medium">
                Important: Nexus states are configured in Admin → Tax Rate Management. Only states listed there appear in this guide and in the Sales Tax Reports.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Tax Calculation Rules per State ── */}
        {activeStates.map(stateCode => {
          const rule = STATE_TAX_RULES[stateCode];
          if (!rule) return null;
          return (
            <Section
              key={stateCode}
              title={`Tax Calculation Rules — ${rule.stateName} (${rule.filingFormNumber})`}
              icon={<FileText className="w-4 h-4 text-green-600" />}
              defaultOpen
            >
              <div className="p-5">
                <p className="text-sm text-gray-600 mb-4">
                  The table below shows whether <strong>parts (materials)</strong> and <strong>labor</strong> are taxable for each project type.
                  These rules are applied automatically by the system when calculating tax on proposals and invoices.
                </p>
                <TaxMatrix stateCode={stateCode} />
                <AdminNotes
                  stateCode={stateCode}
                  isAdmin={isAdmin}
                  notes={adminNotes}
                  onSave={handleSaveNote}
                />
              </div>
            </Section>
          );
        })}

        {/* ── Exemption Certificates ── */}
        <Section
          title="Exemption Certificates — How to Handle Tax-Exempt Customers"
          icon={<CheckCircle className="w-4 h-4 text-emerald-600" />}
          defaultOpen={false}
        >
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-700">
              When a customer is tax-exempt, collect a completed exemption certificate <strong>before</strong> the job begins.
              Record it in the customer&apos;s Contact record under <em>Tax Exemption</em>. The system will then mark proposals
              and invoices for that customer as exempt.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">Exemption Type</th>
                    {activeStates.map(s => (
                      <th key={s} className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">
                        {s} Form
                      </th>
                    ))}
                    <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.entries(EXEMPTION_CATEGORY_LABELS) as [string, string][]).map(([key, label]) => (
                    <tr key={key} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">{label}</td>
                      {activeStates.map(s => (
                        <td key={s} className="px-3 py-2 border border-gray-200 text-gray-600">
                          {STATE_EXEMPTION_FORMS[s] ?? '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2 border border-gray-200 text-gray-600 text-xs italic">
                        {key === 'government' && 'Federal/state/local entities. May use a letter in lieu of form.'}
                        {key === 'non_profit' && 'Must have valid 501(c)(3) or equivalent. Verify expiration.'}
                        {key === 'resale' && 'Resale exemptions require buyer resale license number on form.'}
                        {key === 'agricultural' && 'Agricultural use only; does not cover residential living areas.'}
                        {key === 'manufacturer' && 'Items used directly in manufacturing process only.'}
                        {key === 'medical' && 'Verify medical necessity and applicable state statutes.'}
                        {key === 'other' && 'Consult with your CPA or state revenue authority for unusual exemptions.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 print:bg-white print:border-gray-300">
              <p className="text-sm text-red-800 font-medium">
                Audit Risk: Missing or expired exemption certificates can result in back-taxes owed by your company.
                Verify certificate expiration dates annually and flag expired certificates for renewal before the next job.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Step-by-Step Filing Instructions per State ── */}
        {activeStates.map(stateCode => {
          const rule = STATE_TAX_RULES[stateCode];
          if (!rule) return null;
          return (
            <Section
              key={`filing-${stateCode}`}
              title={`Step-by-Step Filing — ${rule.stateName} ${rule.filingFormNumber}`}
              icon={<FileText className="w-4 h-4 text-blue-600" />}
              defaultOpen={false}
            >
              <div className="p-5">
                <FilingSteps stateCode={stateCode} filingDueDay={filingDueDay} />
              </div>
            </Section>
          );
        })}

        {/* ── Common Scenarios ── */}
        <Section
          title="Common Scenarios — Quick Tax Answers"
          icon={<Info className="w-4 h-4 text-amber-600" />}
          defaultOpen={false}
        >
          <div className="p-5">
            <p className="text-sm text-gray-600 mb-4">
              Answers below are generated live from the system tax rules for all active nexus states ({activeStates.join(', ') || 'none'}).
            </p>
            {activeStates.length > 0 ? (
              <CommonScenarios activeStates={activeStates} />
            ) : (
              <p className="text-sm text-gray-400 italic">No nexus states configured.</p>
            )}
          </div>
        </Section>

        {/* ── Daily Collections Guide ── */}
        <Section
          title="Daily Collections Report — How to Use It"
          icon={<BarChart2 className="w-4 h-4 text-gray-600" />}
          defaultOpen={false}
        >
          <div className="p-5 text-sm text-gray-700 space-y-4">
            <p>
              The Daily Collections report shows all payments received on a specific date, with a breakdown of
              taxable vs. non-taxable amounts. Use it to:
            </p>
            <ul className="list-disc list-inside space-y-1.5 leading-relaxed">
              <li>Verify that tax was collected correctly on each payment.</li>
              <li>Identify any payments where tax overrides were applied and confirm they are documented.</li>
              <li>Provide a daily audit trail for your accounting team.</li>
            </ul>
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">How to generate:</h4>
              <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                <li>Go to <strong>Finance → Sales Tax Reports</strong>.</li>
                <li>The <strong>Daily Collections</strong> tab is selected by default. Choose the date.</li>
                <li>Review the columns: Customer, Invoice #, Method, Project Type, Env, State, Jurisdiction, Subtotal, Tax Rate, Tax, Total.</li>
                <li>Export or print as needed for your records.</li>
              </ol>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 print:border-gray-300">
              <p className="text-xs text-gray-600">
                Tip: If a payment shows an unexpected tax override, check the proposal or invoice to confirm the project type is set correctly.
                Most errors stem from incorrect project type selection at the proposal stage.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Print footer ── */}
        <div className="hidden print:block mt-8 pt-4 border-t border-gray-300 text-xs text-gray-500">
          <p>Sales Tax Filing Guide — {generatedAt} — Generated from live system tax rules. Rules reflect current system configuration.</p>
          <p className="mt-1">For questions, contact your CPA or state revenue authority: {activeStates.map(s => `${s}: ${STATE_TAX_RULES[s]?.revenueAuthorityUrl}`).join(' | ')}</p>
        </div>
      </div>
    </div>
  );
}
