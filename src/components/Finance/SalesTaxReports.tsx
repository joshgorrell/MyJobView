import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  FileText, Download, Calendar, DollarSign, TrendingUp,
  Printer, AlertTriangle, ChevronDown, ChevronUp, Info, MapPin, Building2, BookOpen
} from 'lucide-react';
import {
  getTaxApplicability, TaxEnvironment, TaxProjectType,
  EXEMPTION_CATEGORY_LABELS, ExemptionCategory, STATE_TAX_RULES
} from '../../lib/taxCalculations';

// ─────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────
interface PaymentRow {
  payment_id: string;
  payment_date: string;
  payment_amount: number;
  payment_method: string;
  reference_number?: string;
  invoice_id: string;
  invoice_number: string;
  invoice_total: number;
  invoice_subtotal: number;
  invoice_tax_amount: number;
  invoice_amount_paid: number;
  tax_environment: string;
  tax_project_type: string;
  tax_rate: number;
  state_rate: number;
  county_rate: number;
  city_rate: number;
  special_rate: number;
  parts_total: number;
  labor_total: number;
  tax_override: boolean;
  tax_override_reason?: string;
  is_tax_exempt: boolean;
  exemption_category?: ExemptionCategory | null;
  government_entity: boolean;
  non_profit_entity: boolean;
  customer_name: string;
  jurisdiction_name: string;
  jurisdiction_id?: string;
  jurisdiction_state?: string;
  ks_jurisdiction_code?: string;
  mo_jurisdiction_code?: string;
}

interface ST36JurisdictionRow {
  jurisdiction_id: string;
  jurisdiction_name: string;
  ks_jurisdiction_code?: string;
  tax_rate: number;
  gross_sales: number;
  deduction_res_orig_construction_labor: number;
  deduction_res_remodel_labor: number;
  deduction_comm_orig_construction_labor: number;
  deduction_design_services: number;
  deduction_exempt: number;
  deduction_non_profit: number;
  deduction_government: number;
  deduction_security_monitoring: number;
  total_deductions: number;
  net_taxable: number;
  net_tax_due: number;
  override_count: number;
}

interface MO53Row {
  jurisdiction_id: string;
  jurisdiction_name: string;
  mo_jurisdiction_code?: string;
  state_rate: number;
  county_rate: number;
  city_rate: number;
  special_rate: number;
  combined_rate: number;
  gross_receipts: number;
  deduction_non_taxable_labor: number;
  deduction_exempt_sales: number;
  deduction_non_profit: number;
  deduction_government: number;
  deduction_design_services: number;
  deduction_security_monitoring: number;
  total_deductions: number;
  net_taxable: number;
  state_tax_due: number;
  county_tax_due: number;
  city_tax_due: number;
  special_tax_due: number;
  total_tax_due: number;
  override_count: number;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(rate: number) {
  return `${(rate * 100).toFixed(4)}%`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

function lastFullMonthStart() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
}

function lastFullMonthEnd() {
  const d = new Date();
  d.setDate(0);
  return d.toISOString().split('T')[0];
}

function monthLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// ─────────────────────────────────────────────
// Query helper – fetch payments joined to invoices
// ─────────────────────────────────────────────
async function fetchPayments(startDate: string, endDate: string): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      id,
      payment_date,
      amount,
      payment_method,
      reference_number,
      invoice_id,
      invoices (
        invoice_number,
        subtotal,
        tax_amount,
        total,
        amount_paid,
        tax_environment,
        tax_project_type,
        tax_rate,
        tax_override,
        tax_override_reason,
        contacts (
          full_name,
          contact_name,
          is_tax_exempt,
          government_entity,
          non_profit_entity,
          tax_exemption_certificates (
            exemption_category,
            is_active,
            expiration_date
          )
        ),
        tax_jurisdictions (
          id,
          jurisdiction_name,
          state,
          state_rate,
          county_rate,
          city_rate,
          special_rate,
          combined_rate,
          ks_jurisdiction_code,
          mo_jurisdiction_code
        )
      )
    `)
    .gte('payment_date', startDate)
    .lte('payment_date', endDate)
    .order('payment_date', { ascending: true });

  if (error) throw error;

  return (data || []).map((p: any) => {
    const inv = p.invoices || {};
    const contact = inv.contacts || {};
    const jur = inv.tax_jurisdictions || {};

    // Resolve active exemption category from certificates
    const certs: any[] = contact.tax_exemption_certificates || [];
    const activeCert = certs.find((c: any) => {
      if (!c.is_active) return false;
      if (c.expiration_date && new Date(c.expiration_date) <= new Date()) return false;
      return true;
    });

    return {
      payment_id: p.id,
      payment_date: p.payment_date,
      payment_amount: p.amount || 0,
      payment_method: p.payment_method || '',
      reference_number: p.reference_number,
      invoice_id: p.invoice_id,
      invoice_number: inv.invoice_number || 'N/A',
      invoice_total: inv.total || 0,
      invoice_subtotal: inv.subtotal || 0,
      invoice_tax_amount: inv.tax_amount || 0,
      invoice_amount_paid: inv.amount_paid || 0,
      tax_environment: inv.tax_environment || '',
      tax_project_type: inv.tax_project_type || '',
      tax_rate: inv.tax_rate || jur.combined_rate || 0,
      state_rate: jur.state_rate || 0,
      county_rate: jur.county_rate || 0,
      city_rate: jur.city_rate || 0,
      special_rate: jur.special_rate || 0,
      parts_total: 0,
      labor_total: 0,
      tax_override: inv.tax_override || false,
      tax_override_reason: inv.tax_override_reason,
      is_tax_exempt: contact.is_tax_exempt || false,
      exemption_category: activeCert?.exemption_category || null,
      government_entity: contact.government_entity || false,
      non_profit_entity: contact.non_profit_entity || false,
      customer_name: contact.full_name || contact.contact_name || 'Unknown',
      jurisdiction_name: jur.jurisdiction_name || 'Default',
      jurisdiction_id: jur.id,
      jurisdiction_state: jur.state || 'KS',
      ks_jurisdiction_code: jur.ks_jurisdiction_code,
      mo_jurisdiction_code: jur.mo_jurisdiction_code,
    };
  });
}

// For a partial payment, prorate the tax proportionally
function proratedTax(payment: PaymentRow): number {
  if (payment.invoice_total <= 0) return 0;
  const ratio = payment.payment_amount / payment.invoice_total;
  return payment.invoice_tax_amount * ratio;
}

function proratedSubtotal(payment: PaymentRow): number {
  if (payment.invoice_total <= 0) return 0;
  const ratio = payment.payment_amount / payment.invoice_total;
  return payment.invoice_subtotal * ratio;
}

// Determine the deduction reason label for display
function getDeductionLabel(p: PaymentRow): string | null {
  const env = p.tax_environment as TaxEnvironment;
  const pt = p.tax_project_type as TaxProjectType;
  const state = p.jurisdiction_state || 'KS';

  if (p.government_entity) return 'Government Entity';
  if (p.non_profit_entity) return 'Non-Profit Organization';
  if (p.is_tax_exempt) {
    if (p.exemption_category && EXEMPTION_CATEGORY_LABELS[p.exemption_category]) {
      return `Exempt — ${EXEMPTION_CATEGORY_LABELS[p.exemption_category]}`;
    }
    return 'Tax-Exempt Customer';
  }
  if (!env || !pt) return null;

  const { partsTaxable, laborTaxable } = getTaxApplicability(env, pt, state);
  if (!partsTaxable && !laborTaxable) {
    if (pt === 'design_services') return 'Design Services';
    if (pt === 'security_monitoring') return 'Security Monitoring';
    if (pt === 'exempt_project') return 'Exempt Project';
    return 'Other Non-Taxable';
  }
  if (partsTaxable && !laborTaxable) {
    const paidSub = proratedSubtotal(p);
    const paidTax = proratedTax(p);
    const taxableBase = p.tax_rate > 0 ? paidTax / p.tax_rate : 0;
    const laborDed = Math.max(0, paidSub - taxableBase);
    if (laborDed > 0.01) {
      const envLabel = env === 'residential' ? 'Residential' : 'Commercial';
      const ptLabel = pt === 'original_construction' ? 'Original Construction' : 'Remodel';
      return `Labor Deduction — ${envLabel} ${ptLabel}`;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// KS ST-36 builder
// ─────────────────────────────────────────────
function buildST36Rows(payments: PaymentRow[]): ST36JurisdictionRow[] {
  const ksPayments = payments.filter(p => (p.jurisdiction_state || 'KS') === 'KS');
  const map = new Map<string, ST36JurisdictionRow>();

  for (const p of ksPayments) {
    const key = p.jurisdiction_id || 'default';
    if (!map.has(key)) {
      map.set(key, {
        jurisdiction_id: key,
        jurisdiction_name: p.jurisdiction_name,
        ks_jurisdiction_code: p.ks_jurisdiction_code,
        tax_rate: p.tax_rate,
        gross_sales: 0,
        deduction_res_orig_construction_labor: 0,
        deduction_res_remodel_labor: 0,
        deduction_comm_orig_construction_labor: 0,
        deduction_design_services: 0,
        deduction_exempt: 0,
        deduction_non_profit: 0,
        deduction_government: 0,
        deduction_security_monitoring: 0,
        total_deductions: 0,
        net_taxable: 0,
        net_tax_due: 0,
        override_count: 0,
      });
    }

    const row = map.get(key)!;
    const paidSubtotal = proratedSubtotal(p);
    row.gross_sales += paidSubtotal;
    if (p.tax_override) row.override_count++;

    // Government / non-profit deductions (separate lines on filing)
    if (p.government_entity) {
      row.deduction_government += paidSubtotal;
      continue;
    }
    if (p.non_profit_entity) {
      row.deduction_non_profit += paidSubtotal;
      continue;
    }
    if (p.is_tax_exempt) {
      row.deduction_exempt += paidSubtotal;
      continue;
    }

    const env = p.tax_environment as TaxEnvironment;
    const pt = p.tax_project_type as TaxProjectType;
    if (!env || !pt) continue;

    const { partsTaxable, laborTaxable } = getTaxApplicability(env, pt, 'KS');

    if (!partsTaxable && !laborTaxable) {
      if (pt === 'design_services') row.deduction_design_services += paidSubtotal;
      else if (pt === 'security_monitoring') row.deduction_security_monitoring += paidSubtotal;
      else row.deduction_exempt += paidSubtotal;
      continue;
    }

    if (partsTaxable && !laborTaxable) {
      const paidTax = proratedTax(p);
      const taxableBase = p.tax_rate > 0 ? paidTax / p.tax_rate : 0;
      const laborDeduction = Math.max(0, paidSubtotal - taxableBase);
      if (env === 'residential' && pt === 'original_construction') {
        row.deduction_res_orig_construction_labor += laborDeduction;
      } else if (env === 'residential' && pt === 'remodel') {
        row.deduction_res_remodel_labor += laborDeduction;
      } else if (env === 'commercial' && pt === 'original_construction') {
        row.deduction_comm_orig_construction_labor += laborDeduction;
      }
    }
  }

  for (const row of map.values()) {
    row.total_deductions =
      row.deduction_res_orig_construction_labor +
      row.deduction_res_remodel_labor +
      row.deduction_comm_orig_construction_labor +
      row.deduction_design_services +
      row.deduction_exempt +
      row.deduction_non_profit +
      row.deduction_government +
      row.deduction_security_monitoring;
    row.net_taxable = Math.max(0, row.gross_sales - row.total_deductions);
    row.net_tax_due = row.net_taxable * row.tax_rate;
  }

  return Array.from(map.values()).sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

// ─────────────────────────────────────────────
// MO Form 53-1 builder
// ─────────────────────────────────────────────
function buildMO53Rows(payments: PaymentRow[]): MO53Row[] {
  const moPayments = payments.filter(p => p.jurisdiction_state === 'MO');
  const map = new Map<string, MO53Row>();

  for (const p of moPayments) {
    const key = p.jurisdiction_id || 'default';
    if (!map.has(key)) {
      map.set(key, {
        jurisdiction_id: key,
        jurisdiction_name: p.jurisdiction_name,
        mo_jurisdiction_code: p.mo_jurisdiction_code,
        state_rate: p.state_rate,
        county_rate: p.county_rate,
        city_rate: p.city_rate,
        special_rate: p.special_rate,
        combined_rate: p.tax_rate,
        gross_receipts: 0,
        deduction_non_taxable_labor: 0,
        deduction_exempt_sales: 0,
        deduction_non_profit: 0,
        deduction_government: 0,
        deduction_design_services: 0,
        deduction_security_monitoring: 0,
        total_deductions: 0,
        net_taxable: 0,
        state_tax_due: 0,
        county_tax_due: 0,
        city_tax_due: 0,
        special_tax_due: 0,
        total_tax_due: 0,
        override_count: 0,
      });
    }

    const row = map.get(key)!;
    const paidSubtotal = proratedSubtotal(p);
    row.gross_receipts += paidSubtotal;
    if (p.tax_override) row.override_count++;

    if (p.government_entity) {
      row.deduction_government += paidSubtotal;
      continue;
    }
    if (p.non_profit_entity) {
      row.deduction_non_profit += paidSubtotal;
      continue;
    }
    if (p.is_tax_exempt) {
      row.deduction_exempt_sales += paidSubtotal;
      continue;
    }

    const env = p.tax_environment as TaxEnvironment;
    const pt = p.tax_project_type as TaxProjectType;
    if (!env || !pt) continue;

    const { partsTaxable, laborTaxable } = getTaxApplicability(env, pt, 'MO');

    if (!partsTaxable && !laborTaxable) {
      if (pt === 'design_services') row.deduction_design_services += paidSubtotal;
      else if (pt === 'security_monitoring') row.deduction_security_monitoring += paidSubtotal;
      else row.deduction_exempt_sales += paidSubtotal;
      continue;
    }

    // Missouri: parts taxable, labor separately stated is not taxable for construction/remodel
    if (partsTaxable && !laborTaxable) {
      const paidTax = proratedTax(p);
      const taxableBase = p.tax_rate > 0 ? paidTax / p.tax_rate : 0;
      const laborDeduction = Math.max(0, paidSubtotal - taxableBase);
      row.deduction_non_taxable_labor += laborDeduction;
    }
  }

  for (const row of map.values()) {
    row.total_deductions =
      row.deduction_non_taxable_labor +
      row.deduction_exempt_sales +
      row.deduction_non_profit +
      row.deduction_government +
      row.deduction_design_services +
      row.deduction_security_monitoring;
    row.net_taxable = Math.max(0, row.gross_receipts - row.total_deductions);
    row.state_tax_due = row.net_taxable * row.state_rate;
    row.county_tax_due = row.net_taxable * row.county_rate;
    row.city_tax_due = row.net_taxable * row.city_rate;
    row.special_tax_due = row.net_taxable * row.special_rate;
    row.total_tax_due = row.net_taxable * row.combined_rate;
  }

  return Array.from(map.values()).sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
type ReportMode = 'daily' | 'ks_st36' | 'mo_53';

interface SalesTaxReportsProps {
  onNavigateToGuide?: () => void;
}

export default function SalesTaxReports({ onNavigateToGuide }: SalesTaxReportsProps) {
  useAuth();
  const [mode, setMode] = useState<ReportMode>('daily');
  const [nexusStates, setNexusStates] = useState<string[]>(['KS']);

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('nexus_states')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nexus_states?.length) setNexusStates(data.nexus_states);
      });
  }, []);

  const tabs: { key: ReportMode; label: string; stateCode?: string }[] = [
    { key: 'daily', label: 'Daily Collections' },
    ...(nexusStates.includes('KS') ? [{ key: 'ks_st36' as ReportMode, label: 'KS — ST-36 Worksheet', stateCode: 'KS' }] : []),
    ...(nexusStates.includes('MO') ? [{ key: 'mo_53' as ReportMode, label: 'MO — Form 53-1 Worksheet', stateCode: 'MO' }] : []),
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Mode tabs */}
      <div className="flex items-center border-b border-gray-200 bg-gray-50 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              mode === tab.key
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-100'
            }`}
          >
            {tab.stateCode && <MapPin className="w-3.5 h-3.5" />}
            {tab.label}
          </button>
        ))}
        {onNavigateToGuide && (
          <button
            onClick={onNavigateToGuide}
            className="ml-auto mr-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Filing Guide
          </button>
        )}
      </div>

      <div className="p-6">
        {mode === 'daily' && <DailyCollectionsReport />}
        {mode === 'ks_st36' && <ST36Report />}
        {mode === 'mo_53' && <MO53Report />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DAILY COLLECTIONS REPORT (state-agnostic)
// ─────────────────────────────────────────────
function DailyCollectionsReport() {
  const [reportDate, setReportDate] = useState(yesterday);
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expandedOverrides, setExpandedOverrides] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPayments(await fetchPayments(reportDate, reportDate)); }
    catch (err) { console.error('Error loading daily collections:', err); }
    finally { setLoading(false); }
  }, [reportDate]);

  useEffect(() => { load(); }, [load]);

  const totalCollected = payments.reduce((s, p) => s + p.payment_amount, 0);
  const totalTax = payments.reduce((s, p) => s + proratedTax(p), 0);
  const totalSubtotal = payments.reduce((s, p) => s + proratedSubtotal(p), 0);

  const deductionsByType: Record<string, number> = {};
  for (const p of payments) {
    const label = getDeductionLabel(p);
    if (!label) continue;
    deductionsByType[label] = (deductionsByType[label] || 0) + proratedSubtotal(p);
  }
  const totalDeductions = Object.values(deductionsByType).reduce((s, v) => s + v, 0);
  const overridePayments = payments.filter(p => p.tax_override);

  function exportCSV() {
    const headers = [
      'Payment Date', 'Customer', 'Invoice #', 'Payment Method',
      'Reference', 'Payment Amount', 'Invoice Subtotal (Prorated)',
      'Tax Rate', 'Tax Collected (Prorated)', 'Project Type',
      'Environment', 'State', 'Jurisdiction', 'Tax Override', 'Override Reason',
      'Govt Entity', 'Non-Profit', 'Exempt Category'
    ];
    const rows = payments.map(p => [
      p.payment_date,
      p.customer_name,
      p.invoice_number,
      p.payment_method,
      p.reference_number || '',
      p.payment_amount.toFixed(2),
      proratedSubtotal(p).toFixed(2),
      (p.tax_rate * 100).toFixed(4) + '%',
      proratedTax(p).toFixed(2),
      (p.tax_project_type || '').replace(/_/g, ' '),
      p.tax_environment || '',
      p.jurisdiction_state || '',
      p.jurisdiction_name,
      p.tax_override ? 'YES' : '',
      p.tax_override_reason || '',
      p.government_entity ? 'YES' : '',
      p.non_profit_entity ? 'YES' : '',
      p.exemption_category ? EXEMPTION_CATEGORY_LABELS[p.exemption_category] : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-collections-${reportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #daily-print, #daily-print * { visibility: visible !important; }
          #daily-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 0.5in; size: portrait; }
          table { font-size: 8px !important; border-collapse: collapse; }
          th, td { padding: 2px 4px !important; border: 0.5px solid #ccc; }
        }
      `}</style>

      <div id="daily-print" className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daily Collections Report</h1>
            <p className="text-sm text-gray-500 mt-1">
              Payments received — tax amounts follow state sales tax rules matrix
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-3">
            <button onClick={() => setReportDate(yesterday())} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">Yesterday</button>
            <button onClick={() => setReportDate(today())} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">Today</button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => window.print()} disabled={payments.length === 0} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm transition-colors">
              <Printer className="w-4 h-4" />Print
            </button>
            <button onClick={exportCSV} disabled={payments.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
              <Download className="w-4 h-4" />CSV
            </button>
          </div>
        </div>

        <div className="hidden print:block text-center pb-4 border-b border-gray-400">
          <h2 className="text-xl font-bold">Daily Collections Report</h2>
          <p className="text-sm">Report Date: {new Date(reportDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Payments Received', value: payments.length.toString(), sub: reportDate },
            { label: 'Total Collected', value: `$${fmt(totalCollected)}`, sub: 'cash received' },
            { label: 'Taxable Sales (net)', value: `$${fmt(totalSubtotal - totalDeductions)}`, sub: 'after deductions' },
            { label: 'Sales Tax Collected', value: `$${fmt(totalTax)}`, sub: 'prorated to payments' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {Object.keys(deductionsByType).length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Non-Taxable Deductions
            </h3>
            <div className="space-y-2">
              {Object.entries(deductionsByType).map(([label, amount]) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className="text-amber-800">{label}</span>
                  <span className="font-semibold text-amber-900">${fmt(amount)}</span>
                </div>
              ))}
              <div className="border-t border-amber-300 pt-2 flex justify-between items-center text-sm font-bold">
                <span className="text-amber-900">Total Deductions</span>
                <span className="text-amber-900">${fmt(totalDeductions)}</span>
              </div>
            </div>
          </div>
        )}

        {overridePayments.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 no-print">
            <button onClick={() => setExpandedOverrides(v => !v)} className="flex items-center justify-between w-full text-left">
              <span className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <AlertTriangle className="w-4 h-4" />
                {overridePayments.length} payment{overridePayments.length > 1 ? 's' : ''} with manual tax override — review before filing
              </span>
              {expandedOverrides ? <ChevronUp className="w-4 h-4 text-red-600" /> : <ChevronDown className="w-4 h-4 text-red-600" />}
            </button>
            {expandedOverrides && (
              <div className="mt-3 space-y-2">
                {overridePayments.map(p => (
                  <div key={p.payment_id} className="text-xs text-red-700 bg-white border border-red-200 rounded p-2">
                    <span className="font-medium">{p.invoice_number}</span> — {p.customer_name}
                    {p.tax_override_reason && <span className="ml-2 text-red-500">Reason: {p.tax_override_reason}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Transactions — {new Date(reportDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            <span className="text-sm text-gray-500">{payments.length} payment{payments.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Customer', 'Invoice #', 'Method', 'Project Type', 'Env', 'State', 'Jurisdiction', 'Subtotal', 'Tax Rate', 'Tax', 'Total'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-500"><div className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />Loading...</div></td></tr>
                ) : payments.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-12 text-center"><FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" /><p className="text-gray-500">No payments found for {reportDate}</p></td></tr>
                ) : (
                  payments.map(p => {
                    const env = p.tax_environment as TaxEnvironment;
                    const pt = p.tax_project_type as TaxProjectType;
                    const state = p.jurisdiction_state || 'KS';
                    const appl = env && pt ? getTaxApplicability(env, pt, state) : null;
                    const tax = proratedTax(p);
                    const sub = proratedSubtotal(p);
                    return (
                      <tr key={p.payment_id} className={`hover:bg-gray-50 ${p.tax_override ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {p.customer_name}
                          {p.government_entity && <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Govt</span>}
                          {p.non_profit_entity && <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">NPO</span>}
                          {p.is_tax_exempt && !p.government_entity && !p.non_profit_entity && <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Exempt</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-blue-600 font-medium whitespace-nowrap">
                          {p.invoice_number}{p.tax_override && <span className="ml-1 text-red-500" title={p.tax_override_reason}>*</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 capitalize whitespace-nowrap">{p.payment_method.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{pt ? pt.replace(/_/g, ' ') : '—'}</td>
                        <td className="px-4 py-3 text-sm capitalize text-gray-700 whitespace-nowrap">{env || '—'}</td>
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-gray-600 whitespace-nowrap">{state}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{p.jurisdiction_name}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium whitespace-nowrap">${fmt(sub)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700 whitespace-nowrap">
                          {appl && !p.is_tax_exempt && !p.government_entity && !p.non_profit_entity ? (
                            <span title={appl.explanation}>{fmtPct(p.tax_rate)}</span>
                          ) : <span className="text-gray-400">0.00%</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold whitespace-nowrap text-blue-700">${fmt(tax)}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold whitespace-nowrap text-gray-900">${fmt(p.payment_amount)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {payments.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr className="font-bold">
                    <td colSpan={7} className="px-4 py-3 text-sm text-right text-gray-700 uppercase tracking-wide">Totals</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">${fmt(totalSubtotal)}</td>
                    <td></td>
                    <td className="px-4 py-3 text-sm text-right text-blue-800">${fmt(totalTax)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">${fmt(totalCollected)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="hidden print:block text-center text-xs text-gray-500 pt-4 border-t border-gray-300 mt-4">
          <p>Tax amounts prorated to payment amounts for partial payments. Rules applied per state sales tax matrix.</p>
          <p className="mt-1">Printed {new Date().toLocaleString()}</p>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// KANSAS ST-36 MONTHLY WORKSHEET
// ─────────────────────────────────────────────
function ST36Report() {
  const [startDate, setStartDate] = useState(lastFullMonthStart);
  const [endDate, setEndDate] = useState(lastFullMonthEnd);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ST36JurisdictionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [showZeroTax, setShowZeroTax] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchPayments(startDate, endDate);
      setPayments(ps);
      setRows(buildST36Rows(ps));
    } catch (err) { console.error('Error loading ST-36 data:', err); }
    finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce(
    (acc, r) => ({
      gross_sales: acc.gross_sales + r.gross_sales,
      total_deductions: acc.total_deductions + r.total_deductions,
      net_taxable: acc.net_taxable + r.net_taxable,
      net_tax_due: acc.net_tax_due + r.net_tax_due,
    }),
    { gross_sales: 0, total_deductions: 0, net_taxable: 0, net_tax_due: 0 }
  );

  const zeroTaxPayments = payments.filter(p => (p.jurisdiction_state || 'KS') === 'KS' && proratedTax(p) === 0);
  const missingCodeRows = rows.filter(r => !r.ks_jurisdiction_code);

  const deductionColumns: { key: keyof ST36JurisdictionRow; label: string; abbr: string }[] = [
    { key: 'deduction_res_orig_construction_labor', label: 'Residential Original Construction — Labor', abbr: 'Res. Orig. Const. Labor' },
    { key: 'deduction_res_remodel_labor', label: 'Residential Remodel — Labor', abbr: 'Res. Remodel Labor' },
    { key: 'deduction_comm_orig_construction_labor', label: 'Commercial Original Construction — Labor', abbr: 'Comm. Orig. Const. Labor' },
    { key: 'deduction_design_services', label: 'Design Services (non-taxable)', abbr: 'Design Services' },
    { key: 'deduction_non_profit', label: 'Non-Profit Organization Sales', abbr: 'Non-Profit' },
    { key: 'deduction_government', label: 'Government Entity Sales', abbr: 'Government' },
    { key: 'deduction_exempt', label: 'Exempt Projects / Tax-Exempt Customers', abbr: 'Exempt Sales' },
    { key: 'deduction_security_monitoring', label: 'Security Monitoring', abbr: 'Security Mon.' },
  ];

  function exportCSV() {
    const headers = [
      'Jurisdiction', 'KS ST-36 Code', 'Tax Rate',
      'Gross Sales', ...deductionColumns.map(c => `Deduction: ${c.label}`),
      'Total Deductions', 'Net Taxable Sales', 'Net Tax Due'
    ];
    const dataRows = rows.map(r => [
      r.jurisdiction_name,
      r.ks_jurisdiction_code || 'MISSING',
      fmtPct(r.tax_rate),
      r.gross_sales.toFixed(2),
      ...deductionColumns.map(c => (r[c.key] as number).toFixed(2)),
      r.total_deductions.toFixed(2),
      r.net_taxable.toFixed(2),
      r.net_tax_due.toFixed(2),
    ]);
    const csv = [headers, ...dataRows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ks-st36-worksheet-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #st36-print, #st36-print * { visibility: visible !important; }
          #st36-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 0.4in; size: landscape; }
          table { font-size: 7px !important; border-collapse: collapse; }
          th, td { padding: 2px 3px !important; border: 0.5px solid #aaa; white-space: nowrap; }
        }
      `}</style>

      <div id="st36-print" className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Kansas ST-36 Monthly Filing Worksheet</h1>
            </div>
            <p className="text-sm text-gray-600 mt-1">Reference worksheet for completing the Kansas ST-36 online at ksrevenue.gov. Based on payments received.</p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-3">
            <button onClick={() => { setStartDate(lastFullMonthStart()); setEndDate(lastFullMonthEnd()); }} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">Last Month</button>
            <button onClick={() => { setStartDate(firstOfMonth()); setEndDate(today()); }} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">This Month</button>
            <div className="flex items-center gap-2 text-sm">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-500">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => window.print()} disabled={rows.length === 0} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm transition-colors"><Printer className="w-4 h-4" />Print</button>
            <button onClick={exportCSV} disabled={rows.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"><Download className="w-4 h-4" />CSV</button>
          </div>
        </div>

        {missingCodeRows.length > 0 && (
          <div className="no-print bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">{missingCodeRows.length} jurisdiction{missingCodeRows.length > 1 ? 's are' : ' is'} missing a KS ST-36 code</p>
              <p className="text-xs text-amber-700 mt-1">Go to Admin &rarr; Sales Tax &rarr; Tax Rates and add the Kansas DOR jurisdiction code for: {missingCodeRows.map(r => r.jurisdiction_name).join(', ')}.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Gross Sales Collected', value: `$${fmt(totals.gross_sales)}` },
            { label: 'Total Deductions', value: `$${fmt(totals.total_deductions)}` },
            { label: 'Net Taxable Sales', value: `$${fmt(totals.net_taxable)}` },
            { label: 'Total Tax Due', value: `$${fmt(totals.net_tax_due)}` },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 no-print">
          <p className="text-xs font-semibold text-blue-900 mb-2 uppercase tracking-wide">Kansas Deduction Rules Applied (K.S.A. 79-3603)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {deductionColumns.map(col => (
              <div key={col.key as string} className="text-xs text-blue-800">
                <span className="font-medium">{col.abbr}</span> — {col.label}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">ST-36 Jurisdiction Summary — {monthLabel(startDate)}{startDate !== endDate ? ` through ${monthLabel(endDate)}` : ''}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Gross sales = prorated subtotals from payments received in period.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-300">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Jurisdiction</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">KS Code</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Gross Sales</th>
                  {deductionColumns.map(col => (
                    <th key={col.key as string} className="px-3 py-3 text-right text-xs font-semibold text-amber-900 uppercase tracking-wide whitespace-nowrap bg-amber-100">{col.abbr}</th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap border-l border-gray-300">Total Ded.</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Net Taxable</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Rate</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-green-900 uppercase tracking-wide whitespace-nowrap bg-green-100">Net Tax Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={13} className="px-4 py-12 text-center text-gray-500"><div className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />Loading...</div></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-12 text-center"><FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" /><p className="text-gray-500">No Kansas payments found for selected period</p></td></tr>
                ) : (
                  rows.map(r => (
                    <tr key={r.jurisdiction_id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {r.jurisdiction_name}
                        {r.override_count > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">{r.override_count}*</span>}
                      </td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">
                        {r.ks_jurisdiction_code ? <span className="font-mono font-semibold text-gray-900">{r.ks_jurisdiction_code}</span> : <span className="text-amber-600 text-xs font-medium">MISSING</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-900 font-medium whitespace-nowrap">${fmt(r.gross_sales)}</td>
                      {deductionColumns.map(col => (
                        <td key={col.key as string} className="px-3 py-3 text-sm text-right text-amber-900 whitespace-nowrap bg-amber-50">
                          {(r[col.key] as number) > 0 ? `$${fmt(r[col.key] as number)}` : <span className="text-gray-400">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900 whitespace-nowrap border-l border-gray-200">${fmt(r.total_deductions)}</td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900 whitespace-nowrap">${fmt(r.net_taxable)}</td>
                      <td className="px-3 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{fmtPct(r.tax_rate)}</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-green-900 whitespace-nowrap bg-green-100">${fmt(r.net_tax_due)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-400">
                  <tr className="font-bold text-sm">
                    <td colSpan={2} className="px-3 py-3 text-right text-gray-700 uppercase tracking-wide text-xs">TOTALS</td>
                    <td className="px-3 py-3 text-right text-gray-900">${fmt(totals.gross_sales)}</td>
                    {deductionColumns.map(col => {
                      const total = rows.reduce((s, r) => s + (r[col.key] as number), 0);
                      return <td key={col.key as string} className="px-3 py-3 text-right text-amber-900 font-bold bg-amber-100">{total > 0 ? `$${fmt(total)}` : <span className="text-gray-400">—</span>}</td>;
                    })}
                    <td className="px-3 py-3 text-right text-gray-900 border-l border-gray-300">${fmt(totals.total_deductions)}</td>
                    <td className="px-3 py-3 text-right text-gray-900">${fmt(totals.net_taxable)}</td>
                    <td></td>
                    <td className="px-3 py-3 text-right text-green-900 font-bold bg-green-100 text-base">${fmt(totals.net_tax_due)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {zeroTaxPayments.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button onClick={() => setShowZeroTax(v => !v)} className="no-print w-full px-6 py-4 flex items-center justify-between border-b border-gray-200 hover:bg-gray-50">
              <div>
                <h2 className="font-semibold text-gray-900 text-left">Non-Taxable / Zero-Tax Transactions ({zeroTaxPayments.length})</h2>
                <p className="text-xs text-gray-500 mt-0.5 text-left">Audit documentation — payments where no sales tax was collected per Kansas rules matrix</p>
              </div>
              {showZeroTax ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            {showZeroTax && (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>{['Date', 'Customer', 'Invoice #', 'Project Type', 'Environment', 'Reason', 'Payment Amount'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {zeroTaxPayments.map(p => {
                      const pt = p.tax_project_type as TaxProjectType;
                      const env = p.tax_environment as TaxEnvironment;
                      let reason = getDeductionLabel(p) || '';
                      if (!reason) {
                        if (!pt && !env) reason = 'No tax type set';
                        else reason = 'Non-taxable per rules matrix';
                      }
                      return (
                        <tr key={p.payment_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{p.payment_date}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium">{p.customer_name}</td>
                          <td className="px-4 py-3 text-sm text-blue-600 whitespace-nowrap">{p.invoice_number}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{pt ? pt.replace(/_/g, ' ') : '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 capitalize whitespace-nowrap">{env || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 italic">{reason}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 whitespace-nowrap">${fmt(p.payment_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr className="font-bold">
                      <td colSpan={6} className="px-4 py-3 text-sm text-right text-gray-700">Total Non-Taxable Collected</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">${fmt(zeroTaxPayments.reduce((s, p) => s + p.payment_amount, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="hidden print:block text-center text-xs text-gray-500 pt-4 border-t border-gray-300 mt-6">
          <p className="font-semibold">REFERENCE WORKSHEET ONLY — Electronic filing required at ksrevenue.gov</p>
          <p className="mt-1">Deductions calculated per Kansas sales tax rules matrix (K.S.A. 79-3603). Tax amounts prorated for partial payments.</p>
          <p className="mt-1">Printed {new Date().toLocaleString()}</p>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// MISSOURI FORM 53-1 MONTHLY WORKSHEET
// ─────────────────────────────────────────────
function MO53Report() {
  const [startDate, setStartDate] = useState(lastFullMonthStart);
  const [endDate, setEndDate] = useState(lastFullMonthEnd);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MO53Row[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [showZeroTax, setShowZeroTax] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchPayments(startDate, endDate);
      setPayments(ps);
      setRows(buildMO53Rows(ps));
    } catch (err) { console.error('Error loading MO 53-1 data:', err); }
    finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce(
    (acc, r) => ({
      gross_receipts: acc.gross_receipts + r.gross_receipts,
      total_deductions: acc.total_deductions + r.total_deductions,
      net_taxable: acc.net_taxable + r.net_taxable,
      state_tax_due: acc.state_tax_due + r.state_tax_due,
      county_tax_due: acc.county_tax_due + r.county_tax_due,
      city_tax_due: acc.city_tax_due + r.city_tax_due,
      special_tax_due: acc.special_tax_due + r.special_tax_due,
      total_tax_due: acc.total_tax_due + r.total_tax_due,
    }),
    { gross_receipts: 0, total_deductions: 0, net_taxable: 0, state_tax_due: 0, county_tax_due: 0, city_tax_due: 0, special_tax_due: 0, total_tax_due: 0 }
  );

  const moPayments = payments.filter(p => p.jurisdiction_state === 'MO');
  const zeroTaxPayments = moPayments.filter(p => proratedTax(p) === 0);
  const missingCodeRows = rows.filter(r => !r.mo_jurisdiction_code);

  const deductionColumns: { key: keyof MO53Row; label: string; abbr: string }[] = [
    { key: 'deduction_non_taxable_labor', label: 'Separately Stated Non-Taxable Labor', abbr: 'Non-Taxable Labor' },
    { key: 'deduction_government', label: 'Government Entity Sales', abbr: 'Government' },
    { key: 'deduction_non_profit', label: 'Non-Profit Organization Sales', abbr: 'Non-Profit (Form 149)' },
    { key: 'deduction_exempt_sales', label: 'Other Exempt Sales', abbr: 'Exempt Sales' },
    { key: 'deduction_design_services', label: 'Design / Professional Services', abbr: 'Design Services' },
    { key: 'deduction_security_monitoring', label: 'Security Monitoring Services', abbr: 'Security Mon.' },
  ];

  function exportCSV() {
    const headers = [
      'Jurisdiction', 'MO District Code',
      'State Rate', 'County Rate', 'City Rate', 'Special Rate', 'Combined Rate',
      'Gross Receipts', ...deductionColumns.map(c => `Deduction: ${c.label}`),
      'Total Deductions', 'Net Taxable',
      'State Tax Due', 'County Tax Due', 'City Tax Due', 'Special Tax Due', 'Total Tax Due'
    ];
    const dataRows = rows.map(r => [
      r.jurisdiction_name,
      r.mo_jurisdiction_code || 'MISSING',
      fmtPct(r.state_rate),
      fmtPct(r.county_rate),
      fmtPct(r.city_rate),
      fmtPct(r.special_rate),
      fmtPct(r.combined_rate),
      r.gross_receipts.toFixed(2),
      ...deductionColumns.map(c => (r[c.key] as number).toFixed(2)),
      r.total_deductions.toFixed(2),
      r.net_taxable.toFixed(2),
      r.state_tax_due.toFixed(2),
      r.county_tax_due.toFixed(2),
      r.city_tax_due.toFixed(2),
      r.special_tax_due.toFixed(2),
      r.total_tax_due.toFixed(2),
    ]);
    const csv = [headers, ...dataRows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mo-form53-worksheet-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #mo53-print, #mo53-print * { visibility: visible !important; }
          #mo53-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 0.4in; size: landscape; }
          table { font-size: 7px !important; border-collapse: collapse; }
          th, td { padding: 2px 3px !important; border: 0.5px solid #aaa; white-space: nowrap; }
        }
      `}</style>

      <div id="mo53-print" className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Missouri Form 53-1 Monthly Filing Worksheet</h1>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Reference worksheet for completing Missouri Form 53-1 at dor.mo.gov. Based on payments received.
              Missouri rules per Mo. Rev. Stat. §§ 144.020, 144.030, 144.062.
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-3">
            <button onClick={() => { setStartDate(lastFullMonthStart()); setEndDate(lastFullMonthEnd()); }} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">Last Month</button>
            <button onClick={() => { setStartDate(firstOfMonth()); setEndDate(today()); }} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">This Month</button>
            <div className="flex items-center gap-2 text-sm">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-500">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => window.print()} disabled={rows.length === 0} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm transition-colors"><Printer className="w-4 h-4" />Print</button>
            <button onClick={exportCSV} disabled={rows.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"><Download className="w-4 h-4" />CSV</button>
          </div>
        </div>

        {/* Missouri rules summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 no-print">
          <p className="text-xs font-semibold text-blue-900 mb-2 uppercase tracking-wide">Missouri Tax Rules Applied (Mo. Rev. Stat. § 144.062)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-blue-800">
            <div><span className="font-semibold">Original Construction (Res. &amp; Comm.):</span> Materials taxable; separately-stated labor exempt</div>
            <div><span className="font-semibold">Remodel (Res. &amp; Comm.):</span> Materials taxable; separately-stated labor exempt</div>
            <div><span className="font-semibold">General Installation / Repair (lump sum):</span> Both materials and labor taxable</div>
            <div><span className="font-semibold">Maintenance Agreements:</span> Both materials and labor taxable</div>
            <div><span className="font-semibold">Design Services:</span> Non-taxable</div>
            <div><span className="font-semibold">Security Monitoring:</span> Non-taxable</div>
            <div><span className="font-semibold">Government / Non-Profit (Form 149):</span> Exempt with valid certificate</div>
            <div><span className="font-semibold">Exempt Projects:</span> Non-taxable with valid exemption documentation</div>
          </div>
        </div>

        {missingCodeRows.length > 0 && (
          <div className="no-print bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">{missingCodeRows.length} jurisdiction{missingCodeRows.length > 1 ? 's are' : ' is'} missing a Missouri district code</p>
              <p className="text-xs text-amber-700 mt-1">Go to Admin &rarr; Sales Tax &rarr; Tax Rates and add the Missouri district/location code for: {missingCodeRows.map(r => r.jurisdiction_name).join(', ')}.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Gross Receipts', value: `$${fmt(totals.gross_receipts)}` },
            { label: 'Total Deductions', value: `$${fmt(totals.total_deductions)}` },
            { label: 'Net Taxable Sales', value: `$${fmt(totals.net_taxable)}` },
            { label: 'Total Tax Due', value: `$${fmt(totals.total_tax_due)}` },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Tax component breakdown */}
        {totals.net_taxable > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Tax Component Breakdown (Net Taxable ${fmt(totals.net_taxable)})</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'State Tax (4.225%)', value: totals.state_tax_due },
                { label: 'County Tax', value: totals.county_tax_due },
                { label: 'City Tax', value: totals.city_tax_due },
                { label: 'Special District', value: totals.special_tax_due },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className="text-lg font-bold text-gray-900">${fmt(item.value)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Form 53-1 Jurisdiction Summary — {monthLabel(startDate)}{startDate !== endDate ? ` through ${monthLabel(endDate)}` : ''}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Missouri 53-1 requires separate columns for state, county, city, and special district taxes.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-300">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Jurisdiction</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">MO Code</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Gross Receipts</th>
                  {deductionColumns.map(col => (
                    <th key={col.key as string} className="px-3 py-3 text-right text-xs font-semibold text-amber-900 uppercase tracking-wide whitespace-nowrap bg-amber-100">{col.abbr}</th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap border-l border-gray-300">Total Ded.</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Net Taxable</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-blue-900 uppercase tracking-wide whitespace-nowrap bg-blue-100">State Tax</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-blue-900 uppercase tracking-wide whitespace-nowrap bg-blue-100">County Tax</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-blue-900 uppercase tracking-wide whitespace-nowrap bg-blue-100">City Tax</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-green-900 uppercase tracking-wide whitespace-nowrap bg-green-100">Total Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-500"><div className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />Loading...</div></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-12 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No Missouri payments found for selected period</p>
                    <p className="text-xs text-gray-400 mt-1">Make sure your Missouri jurisdictions have state = "MO" in Tax Rate Management</p>
                  </td></tr>
                ) : (
                  rows.map(r => (
                    <tr key={r.jurisdiction_id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {r.jurisdiction_name}
                        {r.override_count > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">{r.override_count}*</span>}
                      </td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">
                        {r.mo_jurisdiction_code ? <span className="font-mono font-semibold text-gray-900">{r.mo_jurisdiction_code}</span> : <span className="text-amber-600 text-xs font-medium">MISSING</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-900 font-medium whitespace-nowrap">${fmt(r.gross_receipts)}</td>
                      {deductionColumns.map(col => (
                        <td key={col.key as string} className="px-3 py-3 text-sm text-right text-amber-900 whitespace-nowrap bg-amber-50">
                          {(r[col.key] as number) > 0 ? `$${fmt(r[col.key] as number)}` : <span className="text-gray-400">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900 whitespace-nowrap border-l border-gray-200">${fmt(r.total_deductions)}</td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900 whitespace-nowrap">${fmt(r.net_taxable)}</td>
                      <td className="px-3 py-3 text-sm text-right text-blue-900 whitespace-nowrap bg-blue-50">${fmt(r.state_tax_due)}</td>
                      <td className="px-3 py-3 text-sm text-right text-blue-900 whitespace-nowrap bg-blue-50">${fmt(r.county_tax_due)}</td>
                      <td className="px-3 py-3 text-sm text-right text-blue-900 whitespace-nowrap bg-blue-50">${fmt(r.city_tax_due)}</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-green-900 whitespace-nowrap bg-green-100">${fmt(r.total_tax_due)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-400">
                  <tr className="font-bold text-sm">
                    <td colSpan={2} className="px-3 py-3 text-right text-gray-700 uppercase tracking-wide text-xs">TOTALS</td>
                    <td className="px-3 py-3 text-right text-gray-900">${fmt(totals.gross_receipts)}</td>
                    {deductionColumns.map(col => {
                      const total = rows.reduce((s, r) => s + (r[col.key] as number), 0);
                      return <td key={col.key as string} className="px-3 py-3 text-right text-amber-900 font-bold bg-amber-100">{total > 0 ? `$${fmt(total)}` : <span className="text-gray-400">—</span>}</td>;
                    })}
                    <td className="px-3 py-3 text-right text-gray-900 border-l border-gray-300">${fmt(totals.total_deductions)}</td>
                    <td className="px-3 py-3 text-right text-gray-900">${fmt(totals.net_taxable)}</td>
                    <td className="px-3 py-3 text-right text-blue-900 font-bold bg-blue-100">${fmt(totals.state_tax_due)}</td>
                    <td className="px-3 py-3 text-right text-blue-900 font-bold bg-blue-100">${fmt(totals.county_tax_due)}</td>
                    <td className="px-3 py-3 text-right text-blue-900 font-bold bg-blue-100">${fmt(totals.city_tax_due)}</td>
                    <td className="px-3 py-3 text-right text-green-900 font-bold bg-green-100 text-base">${fmt(totals.total_tax_due)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {zeroTaxPayments.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button onClick={() => setShowZeroTax(v => !v)} className="no-print w-full px-6 py-4 flex items-center justify-between border-b border-gray-200 hover:bg-gray-50">
              <div>
                <h2 className="font-semibold text-gray-900 text-left">Non-Taxable / Zero-Tax Missouri Transactions ({zeroTaxPayments.length})</h2>
                <p className="text-xs text-gray-500 mt-0.5 text-left">Audit documentation — payments where no Missouri sales tax was collected</p>
              </div>
              {showZeroTax ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            {showZeroTax && (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>{['Date', 'Customer', 'Invoice #', 'Project Type', 'Environment', 'Reason', 'Payment Amount'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {zeroTaxPayments.map(p => {
                      const pt = p.tax_project_type as TaxProjectType;
                      const env = p.tax_environment as TaxEnvironment;
                      const reason = getDeductionLabel(p) || ((!pt && !env) ? 'No tax type set' : 'Non-taxable per MO rules matrix');
                      return (
                        <tr key={p.payment_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{p.payment_date}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium">{p.customer_name}</td>
                          <td className="px-4 py-3 text-sm text-blue-600 whitespace-nowrap">{p.invoice_number}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{pt ? pt.replace(/_/g, ' ') : '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 capitalize whitespace-nowrap">{env || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 italic">{reason}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 whitespace-nowrap">${fmt(p.payment_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="hidden print:block text-center text-xs text-gray-500 pt-4 border-t border-gray-300 mt-6">
          <p className="font-semibold">REFERENCE WORKSHEET ONLY — Electronic filing required at dor.mo.gov</p>
          <p className="mt-1">Deductions calculated per Missouri sales tax rules matrix (Mo. Rev. Stat. §§ 144.020, 144.030, 144.062).</p>
          <p className="mt-1">Printed {new Date().toLocaleString()}</p>
        </div>
      </div>
    </>
  );
}
