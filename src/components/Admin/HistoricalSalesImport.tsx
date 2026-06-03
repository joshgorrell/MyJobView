import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Upload, FileSpreadsheet, AlertCircle, CheckCircle, X,
  ArrowRight, ArrowLeft, Trash2, RefreshCw, RotateCcw,
  TrendingUp, Users, Calendar, DollarSign, Info, Eye
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  year: number;
  month: number;
  repInitials: string;
  invoiceTotal: number;
  invoiceCount: number;
}

interface RepMapping {
  initials: string;
  profileId: string | null;
  fullName: string;
}

interface PreviewRow extends ParsedRow {
  repName: string;
  profileId: string | null;
  unmapped: boolean;
  monthLabel: string;
}

interface ImportResult {
  totalRows: number;
  totalAmount: number;
  repSummary: { initials: string; name: string; rows: number; total: number }[];
  batchId: string;
  deletedCount: number;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const EXPECTED_REP_INITIALS = ['JG', 'BH', 'AK', 'MC', 'JN'];
const BATCH_SIZE = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function parseSheet(workbook: XLSX.WorkBook): ParsedRow[] {
  // Try tab names in priority order
  const tabNames = ['Monthly_Invoice_Stats', 'Monthly Invoice Stats', 'Sheet1'];
  let sheet: XLSX.WorkSheet | undefined;
  for (const name of tabNames) {
    if (workbook.Sheets[name]) {
      sheet = workbook.Sheets[name];
      break;
    }
  }
  // Fall back to first sheet
  if (!sheet && workbook.SheetNames.length > 0) {
    sheet = workbook.Sheets[workbook.SheetNames[0]];
  }
  if (!sheet) throw new Error('No usable sheet found in the workbook.');

  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) throw new Error('Sheet appears empty or has no data rows.');

  // Find header row by looking for Year/Month columns
  let headerRowIndex = -1;
  let colYear = -1, colMonth = -1, colInitials = -1, colTotal = -1, colCount = -1;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i].map((c: any) => String(c).toLowerCase().trim());
    const yearIdx = row.findIndex(c => c === 'year');
    const monthIdx = row.findIndex(c => c === 'month' || c === 'month_number' || c === 'month number');
    if (yearIdx >= 0 && monthIdx >= 0) {
      headerRowIndex = i;
      colYear = yearIdx;
      colMonth = monthIdx;
      // Find rep initials column
      colInitials = row.findIndex(c =>
        c === 'rep' || c === 'initials' || c === 'sales_rep' || c === 'sales rep' ||
        c === 'rep_initials' || c === 'rep initials' || c === 'salesperson'
      );
      // Find total column
      colTotal = row.findIndex(c =>
        c === 'invoice_total' || c === 'invoice total' || c === 'total' ||
        c === 'amount' || c === 'revenue' || c === 'sales_total' || c === 'sales total'
      );
      // Find count column
      colCount = row.findIndex(c =>
        c === 'invoice_count' || c === 'invoice count' || c === 'count' ||
        c === 'num_invoices' || c === 'invoices'
      );
      break;
    }
  }

  if (headerRowIndex < 0) throw new Error('Could not find header row with Year and Month columns. Expected columns: Year, Month, Rep/Initials, Invoice Total, Invoice Count.');
  if (colInitials < 0) throw new Error('Could not find sales rep/initials column. Expected a column named Rep, Initials, Sales Rep, or Salesperson.');
  if (colTotal < 0) throw new Error('Could not find invoice total column. Expected a column named Invoice Total, Total, Amount, or Revenue.');

  const parsed: ParsedRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c: any) => c === '' || c === null || c === undefined)) continue;

    const year = parseInt(String(row[colYear]), 10);
    const month = parseInt(String(row[colMonth]), 10);
    const initials = String(row[colInitials] ?? '').trim().toUpperCase();
    const total = parseFloat(String(row[colTotal] ?? '0').replace(/[$,]/g, '')) || 0;
    const count = colCount >= 0 ? parseInt(String(row[colCount] ?? '0'), 10) || 0 : 0;

    if (!year || year < 2000 || year > 2100) continue;
    if (!month || month < 1 || month > 12) continue;
    if (!initials) continue;

    parsed.push({ year, month, repInitials: initials, invoiceTotal: total, invoiceCount: count });
  }

  return parsed;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HistoricalSalesImport() {
  const { profile } = useAuth();

  const [step, setStep] = useState<ImportStep>('upload');
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [repMappings, setRepMappings] = useState<RepMapping[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [priorImportExists, setPriorImportExists] = useState(false);
  const [priorImportBatchId, setPriorImportBatchId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  // Check for prior imports on mount
  useEffect(() => {
    checkPriorImport();
  }, [profile?.organization_id]);

  async function checkPriorImport() {
    if (!profile?.organization_id) return;
    const { data } = await supabase
      .from('sales_history_monthly')
      .select('import_batch_id, imported_at')
      .eq('organization_id', profile.organization_id)
      .eq('source_type', 'historical_import')
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setPriorImportExists(true);
      setPriorImportBatchId(data.import_batch_id);
    } else {
      setPriorImportExists(false);
      setPriorImportBatchId(null);
    }
  }

  // Load rep profiles for mapping
  async function loadRepMappings(initials: string[]): Promise<RepMapping[]> {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, username')
      .eq('organization_id', profile!.organization_id)
      .in('role', ['sales', 'admin', 'manager', 'sales_manager']);

    const knownMappings: Record<string, string> = {
      JG: 'Josh Gorrell',
      BH: 'Bobbi Holthaus',
      AK: 'Aaron Koker',
      MC: 'Michael Colley',
      JN: 'Jon Nester',
    };

    return initials.map(init => {
      const expectedName = knownMappings[init];
      let match = null;
      if (expectedName && profiles) {
        const [first, last] = expectedName.toLowerCase().split(' ');
        match = profiles.find(p => {
          const pFirst = (p.first_name || '').toLowerCase();
          const pLast = (p.last_name || '').toLowerCase();
          const uname = (p.username || '').toLowerCase();
          return (pFirst === first && pLast === last) ||
            uname.includes(first) ||
            uname.includes(last);
        });
      }
      return {
        initials: init,
        profileId: match?.id ?? null,
        fullName: expectedName ?? init,
      };
    });
  }

  function processFile(file: File) {
    setParseError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const rows = parseSheet(workbook);
        if (rows.length === 0) throw new Error('No valid data rows found in the file.');

        // Collect unique initials
        const initialsSet = new Set(rows.map(r => r.repInitials));
        const mappings = await loadRepMappings(Array.from(initialsSet));
        setRepMappings(mappings);

        // Build mapping lookup
        const mappingLookup = new Map(mappings.map(m => [m.initials, m]));

        // Build preview rows
        const preview: PreviewRow[] = rows.map(row => {
          const mapping = mappingLookup.get(row.repInitials);
          return {
            ...row,
            repName: mapping?.fullName ?? row.repInitials,
            profileId: mapping?.profileId ?? null,
            unmapped: !mapping?.profileId,
            monthLabel: `${MONTH_NAMES[row.month - 1]} ${row.year}`,
          };
        });

        // Validate
        const issues: ValidationIssue[] = [];
        const unmappedInitials = mappings.filter(m => !m.profileId).map(m => m.initials);
        if (unmappedInitials.length > 0) {
          issues.push({
            type: 'error',
            message: `Could not match these rep initials to user accounts: ${unmappedInitials.join(', ')}. The import cannot proceed until all reps are mapped.`
          });
        }

        // Check for duplicate months per rep in the file itself
        const seen = new Set<string>();
        let dupCount = 0;
        rows.forEach(r => {
          const key = `${r.repInitials}-${r.year}-${r.month}`;
          if (seen.has(key)) dupCount++;
          seen.add(key);
        });
        if (dupCount > 0) {
          issues.push({ type: 'error', message: `${dupCount} duplicate month rows found within the file for the same rep. Each rep should have one row per month.` });
        }

        // Warn about years outside expected range
        const years = [...new Set(rows.map(r => r.year))].sort();
        if (years[0] > 2020) {
          issues.push({ type: 'warning', message: `Earliest year in file is ${years[0]}. If you expected data back to 2020, some years may be missing.` });
        }

        setParsedRows(rows);
        setPreviewRows(preview);
        setValidationIssues(issues);
        setStep('preview');
        setPreviewPage(0);
      } catch (err: any) {
        setParseError(err.message ?? 'Failed to parse file.');
      }
    };
    reader.onerror = () => setParseError('Could not read the file.');
    reader.readAsArrayBuffer(file);
  }

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [profile?.organization_id]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  async function runImport() {
    if (!profile?.organization_id || parsedRows.length === 0) return;
    const mappingLookup = new Map(repMappings.map(m => [m.initials, m]));
    const hasErrors = validationIssues.some(i => i.type === 'error');
    if (hasErrors) return;

    setImporting(true);
    setStep('importing');
    setImportProgress(0);

    try {
      const batchId = crypto.randomUUID();

      // Step 1: DELETE all prior historical imports for this org
      const { count: deletedCount } = await supabase
        .from('sales_history_monthly')
        .delete({ count: 'exact' })
        .eq('organization_id', profile.organization_id)
        .eq('source_type', 'historical_import');

      setImportProgress(5);

      // Step 2: Prepare all rows
      const now = new Date().toISOString();
      const allInsertRows = parsedRows.map(row => {
        const mapping = mappingLookup.get(row.repInitials)!;
        const monthStr = String(row.month).padStart(2, '0');
        return {
          organization_id: profile.organization_id,
          sales_rep_id: mapping.profileId,
          sales_rep_name: mapping.fullName,
          sales_rep_initials: row.repInitials,
          stat_year: row.year,
          stat_month: row.month,
          month_start_date: `${row.year}-${monthStr}-01`,
          invoice_total: row.invoiceTotal,
          invoice_count: row.invoiceCount,
          import_batch_id: batchId,
          source_type: 'historical_import' as const,
          imported_at: now,
        };
      });

      // Step 3: Batch insert with progress
      const totalBatches = Math.ceil(allInsertRows.length / BATCH_SIZE);
      for (let i = 0; i < totalBatches; i++) {
        const batch = allInsertRows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const { error } = await supabase.from('sales_history_monthly').insert(batch);
        if (error) throw new Error(`Insert failed on batch ${i + 1}: ${error.message}`);
        setImportProgress(Math.round(5 + ((i + 1) / totalBatches) * 90));
      }

      setImportProgress(100);

      // Build result summary
      const repSummary = repMappings.map(m => {
        const repRows = parsedRows.filter(r => r.repInitials === m.initials);
        return {
          initials: m.initials,
          name: m.fullName,
          rows: repRows.length,
          total: repRows.reduce((s, r) => s + r.invoiceTotal, 0),
        };
      });

      setImportResult({
        totalRows: parsedRows.length,
        totalAmount: parsedRows.reduce((s, r) => s + r.invoiceTotal, 0),
        repSummary,
        batchId,
        deletedCount: deletedCount ?? 0,
      });

      setPriorImportExists(true);
      setPriorImportBatchId(batchId);
      setStep('complete');
    } catch (err: any) {
      setParseError(err.message ?? 'Import failed.');
      setStep('preview');
    } finally {
      setImporting(false);
    }
  }

  async function rollbackLastImport() {
    if (!priorImportBatchId || !profile?.organization_id) return;
    setRollbackLoading(true);
    try {
      await supabase
        .from('sales_history_monthly')
        .delete()
        .eq('organization_id', profile.organization_id)
        .eq('import_batch_id', priorImportBatchId);
      setPriorImportExists(false);
      setPriorImportBatchId(null);
      setImportResult(null);
      if (step === 'complete') resetToUpload();
    } finally {
      setRollbackLoading(false);
    }
  }

  function resetToUpload() {
    setStep('upload');
    setFileName('');
    setParseError('');
    setParsedRows([]);
    setPreviewRows([]);
    setValidationIssues([]);
    setRepMappings([]);
    setImportResult(null);
    setImportProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    checkPriorImport();
  }

  const hasBlockingErrors = validationIssues.some(i => i.type === 'error');
  const previewPageRows = previewRows.slice(previewPage * PAGE_SIZE, (previewPage + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(previewRows.length / PAGE_SIZE);
  const grandTotal = parsedRows.reduce((s, r) => s + r.invoiceTotal, 0);
  const yearRange = parsedRows.length > 0
    ? `${Math.min(...parsedRows.map(r => r.year))}–${Math.max(...parsedRows.map(r => r.year))}`
    : '';

  // ─── Steps indicator ──────────────────────────────────────────────────────

  const steps = [
    { key: 'upload', label: 'Upload File' },
    { key: 'preview', label: 'Preview & Validate' },
    { key: 'importing', label: 'Importing' },
    { key: 'complete', label: 'Complete' },
  ];
  const stepIndex = steps.findIndex(s => s.key === step);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Historical Sales Import</h1>
        </div>
        <p className="text-gray-500 text-sm">
          Import pre-aggregated monthly sales stats from an Excel file to enable multi-year dashboard reporting.
        </p>
      </div>

      {/* Prior import badge + rollback */}
      {priorImportExists && step !== 'complete' && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-amber-800 text-sm">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>A previous historical import exists. Importing a new file will replace all prior imported data.</span>
          </div>
          <button
            onClick={rollbackLastImport}
            disabled={rollbackLoading}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 border border-amber-300 rounded px-3 py-1.5 hover:bg-amber-100 transition-colors ml-4 flex-shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {rollbackLoading ? 'Rolling back...' : 'Rollback Last Import'}
          </button>
        </div>
      )}

      {/* Steps */}
      <div className="flex items-center gap-0 mb-8">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < stepIndex ? 'bg-green-600 text-white' :
                i === stepIndex ? 'bg-blue-600 text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {i < stepIndex ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm font-medium ${i === stepIndex ? 'text-gray-900' : i < stepIndex ? 'text-green-700' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 ${i < stepIndex ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── STEP: Upload ── */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
              dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-700 mb-1">
              {dragging ? 'Drop the file here' : 'Drag & drop your Excel file'}
            </p>
            <p className="text-gray-400 text-sm mb-4">or click to browse</p>
            <p className="text-xs text-gray-400">Accepts .xlsx, .xls files — reads the "Monthly_Invoice_Stats" tab</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileInput}
          />

          {parseError && (
            <div className="mt-4 flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Format guide */}
          <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Expected Format</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-gray-600">
              {['Year', 'Month', 'Rep / Initials', 'Invoice Total', 'Invoice Count'].map(col => (
                <div key={col} className="bg-white border border-gray-200 rounded px-2 py-1 text-center font-mono">{col}</div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Rep initials must be one of: {EXPECTED_REP_INITIALS.join(', ')}. Column header names are flexible.
            </p>
          </div>
        </div>
      )}

      {/* ── STEP: Preview ── */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Warning banner */}
          {priorImportExists && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Data replacement warning</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  This import will permanently delete all previously imported historical data before inserting new rows.
                  This action cannot be undone except by running another import.
                </p>
              </div>
            </div>
          )}

          {/* Validation issues */}
          {validationIssues.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                Validation Results
              </h3>
              {validationIssues.map((issue, i) => (
                <div key={i} className={`flex items-start gap-2 text-sm rounded-lg p-2 ${
                  issue.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  <span className="font-semibold uppercase text-xs mt-0.5 w-12 flex-shrink-0">
                    {issue.type === 'error' ? 'Error' : 'Warn'}
                  </span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500 font-medium">Years</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{yearRange}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-green-500" />
                <span className="text-xs text-gray-500 font-medium">Reps</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{repMappings.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500 font-medium">Rows</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{parsedRows.length.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-gray-500 font-medium">Grand Total</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(grandTotal)}</p>
            </div>
          </div>

          {/* Rep mapping table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Rep Mapping</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Initials</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Matched To</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Rows</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Total</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {repMappings.map(m => {
                  const repRows = parsedRows.filter(r => r.repInitials === m.initials);
                  const repTotal = repRows.reduce((s, r) => s + r.invoiceTotal, 0);
                  return (
                    <tr key={m.initials} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono font-bold text-gray-800">{m.initials}</td>
                      <td className="px-4 py-2 text-gray-700">{m.fullName}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{repRows.length}</td>
                      <td className="px-4 py-2 text-right text-gray-700 font-medium">{formatCurrency(repTotal)}</td>
                      <td className="px-4 py-2 text-center">
                        {m.profileId ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                            <CheckCircle className="w-3 h-3" /> Matched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                            <X className="w-3 h-3" /> Not found
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Data preview table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Eye className="w-4 h-4 text-gray-400" />
                Data Preview
                <span className="text-xs text-gray-400 font-normal">({previewRows.length} rows)</span>
              </h3>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <button
                  onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                  disabled={previewPage === 0}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>
                <span>Page {previewPage + 1} of {Math.max(1, totalPages)}</span>
                <button
                  onClick={() => setPreviewPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={previewPage >= totalPages - 1}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Month</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Rep</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Invoices</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Total</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previewPageRows.map((row, i) => (
                    <tr key={i} className={row.unmapped ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700">{row.monthLabel}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs bg-gray-100 rounded px-1 mr-1">{row.repInitials}</span>
                        <span className="text-gray-600">{row.repName}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{row.invoiceCount || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-800">{formatCurrency(row.invoiceTotal)}</td>
                      <td className="px-3 py-2 text-center">
                        {row.unmapped ? (
                          <span className="text-xs text-red-600">Unmapped</span>
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <button
              onClick={resetToUpload}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Choose Different File
            </button>
            <button
              onClick={runImport}
              disabled={hasBlockingErrors}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Import {parsedRows.length.toLocaleString()} Rows
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Importing ── */}
      {step === 'importing' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Importing Historical Data…</h2>
          <p className="text-gray-500 text-sm mb-6">Please do not close this window.</p>

          <div className="max-w-sm mx-auto">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progress</span>
              <span>{importProgress}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${importProgress}%` }}
              />
            </div>
          </div>

          {parseError && (
            <div className="mt-6 flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm max-w-sm mx-auto">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>
      )}

      {/* ── STEP: Complete ── */}
      {step === 'complete' && importResult && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Import Complete</h2>
                <p className="text-sm text-gray-500">
                  {importResult.deletedCount > 0 && `Replaced ${importResult.deletedCount.toLocaleString()} prior rows. `}
                  Imported {importResult.totalRows.toLocaleString()} rows totaling {formatCurrency(importResult.totalAmount)}.
                </p>
              </div>
            </div>

            {/* Per-rep summary */}
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Rep</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Months</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importResult.repSummary.map(r => (
                    <tr key={r.initials} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs bg-gray-100 rounded px-1 mr-2">{r.initials}</span>
                        {r.name}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{r.rows}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-4 py-2 text-gray-700">Total</td>
                    <td className="px-4 py-2 text-right text-gray-700">{importResult.totalRows}</td>
                    <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(importResult.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-xs text-gray-400 mt-3">
              Batch ID: <span className="font-mono">{importResult.batchId}</span>
            </p>
          </div>

          {/* Post-import actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={resetToUpload}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" /> Import Another File
            </button>
            <button
              onClick={rollbackLastImport}
              disabled={rollbackLoading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              {rollbackLoading ? 'Rolling back…' : 'Rollback This Import'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
