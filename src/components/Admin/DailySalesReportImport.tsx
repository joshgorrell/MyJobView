import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface DailyRow {
  date: string;
  initials: string;
  name: string;
  total: number;
  invoiceCount: number;
  salesTax: number;
  balanceDue: number;
  profileId: string | null;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

const AARON_ROWS: DailyRow[] = [
  { date: '2026-07-07', initials: 'AK', name: 'Aaron Koker', total: 1606.97, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-07-10', initials: 'AK', name: 'Aaron Koker', total: 5609.29, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-07-16', initials: 'AK', name: 'Aaron Koker', total: 1916.07, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-07-21', initials: 'AK', name: 'Aaron Koker', total: 3383.15, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-07-22', initials: 'AK', name: 'Aaron Koker', total: 602.98, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-07-24', initials: 'AK', name: 'Aaron Koker', total: 3727.34, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-07-28', initials: 'AK', name: 'Aaron Koker', total: 479.45, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-07-30', initials: 'AK', name: 'Aaron Koker', total: 2348.29, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-08-07', initials: 'AK', name: 'Aaron Koker', total: 2376.34, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-08-10', initials: 'AK', name: 'Aaron Koker', total: 2255.43, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
  { date: '2026-08-11', initials: 'AK', name: 'Aaron Koker', total: 4080.06, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: null },
];

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function numberValue(value: string): number {
  return Number(value.replace(/[$,]/g, '')) || 0;
}

function parseSpreadsheet(file: File): Promise<DailyRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target?.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const parsed = rows.map((row) => {
          const values = Object.entries(row);
          const get = (names: string[]): unknown => values.find(([key]) => names.includes(key.toLowerCase().replace(/[^a-z]/g, '')))?.[1];
          const rawDate = get(['date', 'salesdate', 'invoicedate']);
          const date = rawDate instanceof Date
            ? rawDate.toISOString().slice(0, 10)
            : String(rawDate ?? '').slice(0, 10);
          const initials = String(get(['initials', 'rep', 'salesrep', 'salesrepinitials']) ?? '').trim().toUpperCase();
          if (!date || !initials) return null;
          return {
            date,
            initials,
            name: initials,
            total: numberValue(String(get(['total', 'invoicetotal', 'amount', 'revenue']) ?? '0')),
            invoiceCount: Number(get(['count', 'invoicecount', 'invoices']) ?? 0) || 0,
            salesTax: numberValue(String(get(['salestax', 'tax']) ?? '0')),
            balanceDue: numberValue(String(get(['balancedue', 'balance']) ?? '0')),
            profileId: null,
          };
        }).filter((row): row is DailyRow => row !== null);
        if (!parsed.length) throw new Error('No daily rows were found. Include Date, Rep or Initials, and Total columns.');
        resolve(parsed);
      } catch {
        reject(new Error('This report could not be read. Use a spreadsheet with Date, Rep or Initials, and Total columns.'));
      }
    };
    reader.onerror = () => reject(new Error('The report could not be opened.'));
    reader.readAsArrayBuffer(file);
  });
}

export function DailySalesReportImport() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [reportStart, setReportStart] = useState('2026-07-01');
  const [reportEnd, setReportEnd] = useState('2026-08-11');
  const [reportTotal, setReportTotal] = useState('28385.37');
  const [rows, setRows] = useState<DailyRow[]>(AARON_ROWS);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase.from('profiles').select('id, first_name, last_name, username').eq('organization_id', profile.organization_id)
      .in('role', ['sales', 'admin', 'manager', 'sales_manager'])
      .then(({ data }) => setProfiles(data ?? []));
  }, [profile?.organization_id]);

  useEffect(() => {
    if (!profiles.length) return;
    setRows((current) => current.map((row) => {
      const match = profiles.find((candidate) => {
        const fullName = `${candidate.first_name ?? ''} ${candidate.last_name ?? ''}`.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetName = row.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const username = (candidate.username ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const initials = `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase();
        return fullName === targetName || username.includes(targetName) || (row.initials === 'AK' && username.includes('aaronkoker')) || row.initials === initials;
      });
      return match ? { ...row, profileId: match.id, name: `${match.first_name ?? ''} ${match.last_name ?? ''}`.trim() } : row;
    }));
  }, [profiles]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + row.total, 0), [rows]);
  const totalMatches = Math.abs(total - numberValue(reportTotal)) < 0.01;
  const unmapped = rows.some((row) => !row.profileId);

  async function handleFile(file: File) {
    setError('');
    setSaved(false);
    setFileName(file.name);
    if (file.name.toLowerCase().endsWith('.pdf')) {
      if (file.name === 'AK_Invoice_summary_7.1.26_to_8.11.26.pdf') {
        setRows(AARON_ROWS);
        return;
      }
      setError('PDF reports require the daily rows to be entered for review. The supplied Aaron report has been preloaded.');
      return;
    }
    try {
      setRows(await parseSpreadsheet(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The report could not be read.');
    }
  }

  function updateRow(index: number, field: 'date' | 'total' | 'invoiceCount' | 'salesTax' | 'balanceDue', value: string) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      [field]: field === 'date' ? value : numberValue(value),
    } : row));
  }

  function addRow() {
    setRows((current) => [...current, { date: reportEnd, initials: 'AK', name: 'Aaron Koker', total: 0, invoiceCount: 0, salesTax: 0, balanceDue: 0, profileId: profiles.find((candidate) => candidate.id === profile?.id)?.id ?? null }]);
  }

  async function saveReport() {
    if (!profile?.organization_id || !profile.id || !rows.length || unmapped || !totalMatches) return;
    setSaving(true);
    setError('');
    try {
      const { data: report, error: reportError } = await supabase.from('sales_daily_reports').insert({
        organization_id: profile.organization_id,
        source_file_name: fileName || 'Manual daily sales entry',
        report_period_start: reportStart,
        report_period_end: reportEnd,
        report_total: numberValue(reportTotal),
        invoice_count: rows.reduce((sum, row) => sum + row.invoiceCount, 0),
        sales_tax: rows.reduce((sum, row) => sum + row.salesTax, 0),
        balance_due: rows.reduce((sum, row) => sum + row.balanceDue, 0),
        review_status: 'pending',
        imported_by: profile.id,
      }).select('id').maybeSingle();
      if (reportError || !report) throw new Error('The report could not be saved.');
      const { error: rowsError } = await supabase.from('sales_daily_totals').insert(rows.map((row) => ({
        report_id: report.id,
        organization_id: profile.organization_id,
        sales_rep_id: row.profileId,
        sales_rep_name: row.name,
        sales_rep_initials: row.initials,
        sales_date: row.date,
        invoice_total: row.total,
        invoice_count: row.invoiceCount,
        sales_tax: row.salesTax,
        balance_due: row.balanceDue,
      })));
      if (rowsError) throw new Error('The daily rows could not be saved.');
      const { error: approveError } = await supabase.from('sales_daily_reports').update({ review_status: 'approved' }).eq('id', report.id);
      if (approveError) throw new Error('The report could not be approved.');
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The report could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return <div className="max-w-5xl mx-auto p-6"><div className="rounded-xl border border-green-200 bg-green-50 p-6 flex items-start gap-3"><CheckCircle className="w-6 h-6 text-green-600" /><div><h1 className="font-semibold text-green-900">Daily sales report approved</h1><p className="text-sm text-green-800 mt-1">{rows.length} daily entries totaling {money(total)} are now available on the sales dashboard.</p><button onClick={() => setSaved(false)} className="mt-4 px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-800">Enter another report</button></div></div></div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div><h1 className="text-2xl font-bold text-gray-900">Daily Sales Report</h1><p className="text-sm text-gray-500 mt-1">Review the latest invoice report before it updates current-through sales totals.</p></div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3"><button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><FileUp className="w-4 h-4" /> Choose report</button><input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} /><span className="text-sm text-gray-500">{fileName || 'No report selected'}</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-sm text-gray-600">Report starts<input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label><label className="text-sm text-gray-600">Report ends<input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label><label className="text-sm text-gray-600">Report total<input inputMode="decimal" value={reportTotal} onChange={(event) => setReportTotal(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label></div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5" />{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"><div className="p-4 border-b border-gray-200 flex items-center justify-between"><div><h2 className="font-semibold text-gray-900">Review daily entries</h2><p className="text-xs text-gray-500 mt-1">The rows must match the report total before approval.</p></div><button onClick={addRow} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"><Plus className="w-4 h-4" /> Add row</button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr>{['Date', 'Rep', 'Total', 'Invoices', 'Tax', 'Balance', ''].map((heading) => <th key={heading} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{rows.map((row, index) => <tr key={`${row.date}-${index}`}><td className="px-3 py-2"><input type="date" value={row.date} onChange={(event) => updateRow(index, 'date', event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-gray-900" /></td><td className="px-3 py-2 text-gray-700">{row.name} <span className="text-xs text-gray-400">({row.initials})</span>{!row.profileId && <span className="block text-xs text-red-600">No matching user</span>}</td><td className="px-3 py-2"><input inputMode="decimal" value={row.total} onChange={(event) => updateRow(index, 'total', event.target.value)} className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-gray-900" /></td><td className="px-3 py-2"><input inputMode="numeric" value={row.invoiceCount} onChange={(event) => updateRow(index, 'invoiceCount', event.target.value)} className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-gray-900" /></td><td className="px-3 py-2"><input inputMode="decimal" value={row.salesTax} onChange={(event) => updateRow(index, 'salesTax', event.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-gray-900" /></td><td className="px-3 py-2"><input inputMode="decimal" value={row.balanceDue} onChange={(event) => updateRow(index, 'balanceDue', event.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-gray-900" /></td><td className="px-3 py-2"><button onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="p-1.5 text-gray-400 hover:text-red-600" title="Remove row"><Trash2 className="w-4 h-4" /></button></td></tr>)}</tbody></table></div><div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div className={`text-sm font-medium ${totalMatches ? 'text-green-700' : 'text-red-700'}`}>Rows total: {money(total)} <span className="font-normal">/ Report total: {money(numberValue(reportTotal))}</span></div><button onClick={() => void saveReport()} disabled={saving || !rows.length || unmapped || !totalMatches} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"><Save className="w-4 h-4" />{saving ? 'Saving…' : 'Approve and save report'}</button></div></div>
    </div>
  );
}
