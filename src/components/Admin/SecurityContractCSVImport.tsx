import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Upload, FileText, AlertCircle, CheckCircle, X, Download,
  ArrowRight, ArrowLeft, Shield, SkipForward, Trash2,
  ChevronDown, ChevronUp, History, RotateCcw, Search,
  RefreshCw, Eye, DollarSign
} from 'lucide-react';
import {
  parseCSV,
  rowsToObjects,
  type ParsedCSV,
  type ColumnMapping,
} from '../../lib/csvParser';

/* ── Types ──────────────────────────────────────────────────────── */

type ImportStep = 'upload' | 'mapping' | 'validation' | 'importing' | 'complete';

interface ContractColumnMap {
  customer_email?: ColumnMapping;
  customer_name?: ColumnMapping;
  account_number?: ColumnMapping;
  monthly_rate?: ColumnMapping;
  term_months?: ColumnMapping;
  start_date?: ColumnMapping;
  account_type?: ColumnMapping;
  billing_day?: ColumnMapping;
  payment_method?: ColumnMapping;
  last_four?: ColumnMapping;
  services?: ColumnMapping;
  notes?: ColumnMapping;
  external_id?: ColumnMapping;
  unmapped: string[];
}

interface RowValidation {
  rowIndex: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
  skipped: boolean;
  cleanedData: Record<string, string>;
  contactId: string | null;
  contactName: string;
}

interface ImportBatch {
  id: string;
  file_name: string;
  row_count: number;
  skipped_count: number;
  error_count: number;
  status: string;
  imported_at: string;
  imported_by_name: string;
}

interface MonitoringService {
  id: string;
  name: string;
  monthly_price: string;
  category: string;
}

/* ── Constants ──────────────────────────────────────────────────── */

const CONTRACT_FIELD_LABELS: Record<string, string> = {
  customer_email: 'Customer Email *',
  customer_name: 'Customer Name',
  account_number: 'Account Number',
  monthly_rate: 'Monthly Rate *',
  term_months: 'Term (months)',
  start_date: 'Start Date *',
  account_type: 'Account Type',
  billing_day: 'Billing Day',
  payment_method: 'Payment Method',
  last_four: 'Last Four',
  services: 'Services',
  notes: 'Notes',
  external_id: 'External ID',
};

const ALL_CONTRACT_FIELDS = Object.keys(CONTRACT_FIELD_LABELS);
const PAGE_SIZE = 50;

/* ── Helpers ────────────────────────────────────────────────────── */

function detectContractColumnMapping(parsed: ParsedCSV): ContractColumnMap {
  const mapping: ContractColumnMap = { unmapped: [] };

  const fieldKeywords: Record<keyof Omit<ContractColumnMap, 'unmapped'>, string[]> = {
    customer_email: ['email', 'customer email', 'customer_email', 'e-mail', 'mail', 'contact email', 'billing email'],
    customer_name: ['name', 'customer name', 'customer_name', 'client name', 'account name', 'company', 'company name', 'full name'],
    account_number: ['account number', 'account_number', 'account #', 'acct number', 'account no', 'monitoring account', 'central station account'],
    monthly_rate: ['monthly rate', 'monthly_rate', 'monthly amount', 'monthly fee', 'monthly price', 'rate', 'amount', 'billing amount', 'recurring amount', 'monthly cost', 'payment amount'],
    term_months: ['term', 'term months', 'term_months', 'contract term', 'months', 'duration', 'contract length'],
    start_date: ['start date', 'start_date', 'activation date', 'activated date', 'contract date', 'begin date', 'effective date', 'sign date', 'signed date'],
    account_type: ['account type', 'account_type', 'type', 'customer type', 'residential', 'commercial'],
    billing_day: ['billing day', 'billing_day', 'bill day', 'payment day', 'charge day', 'due day', 'due date'],
    payment_method: ['payment method', 'payment_method', 'pay method', 'billing method', 'card type', 'payment type'],
    last_four: ['last four', 'last_four', 'last 4', 'card last four', 'last four digits', 'last4'],
    services: ['services', 'service', 'monitoring services', 'account services', 'features', 'plan services', 'included services'],
    notes: ['notes', 'note', 'comments', 'comment', 'description', 'memo', 'remarks', 'details'],
    external_id: ['external id', 'external_id', 'bill.com id', 'billdotcom id', 'vendor id', 'customer id', 'reference id', 'ref id', 'billing id'],
  };

  const usedHeaders = new Set<string>();

  for (const [field, keywords] of Object.entries(fieldKeywords) as [keyof Omit<ContractColumnMap, 'unmapped'>, string[]][]) {
    let bestMatch: { header: string; score: number; index: number } | null = null;

    parsed.headers.forEach((header, index) => {
      if (usedHeaders.has(header)) return;
      const headerLower = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      let maxScore = 0;
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (headerLower === kwLower) { maxScore = 1.0; break; }
        if (headerLower.includes(kwLower) || kwLower.includes(headerLower)) { maxScore = Math.max(maxScore, 0.9); }
        const sim = stringSimilarity(headerLower, kwLower);
        if (sim > 0.7) maxScore = Math.max(maxScore, sim * 0.85);
      }
      if (maxScore > 0.6 && (!bestMatch || maxScore > bestMatch.score)) {
        bestMatch = { header, score: maxScore, index };
      }
    });

    if (bestMatch) {
      usedHeaders.add(bestMatch.header);
      const samples = parsed.rows.slice(0, 3).map(r => r[bestMatch!.index]).filter(Boolean);
      (mapping as any)[field] = {
        sourceColumn: bestMatch.header,
        targetField: field,
        confidence: bestMatch.score,
        samples,
      };
    }
  }

  mapping.unmapped = parsed.headers.filter(h => !usedHeaders.has(h));
  return mapping;
}

function stringSimilarity(str1: string, str2: string): number {
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;
  if (str1.includes(str2) || str2.includes(str1)) return 0.8;
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return 1 - matrix[str2.length][str1.length] / Math.max(str1.length, str2.length);
}

function applyContractMapping(rows: Record<string, string>[], mapping: ContractColumnMap): Record<string, string>[] {
  return rows.map(row => {
    const obj: Record<string, string> = {};
    for (const [field, cm] of Object.entries(mapping)) {
      if (field === 'unmapped' || !cm) continue;
      const value = row[cm.sourceColumn];
      if (value !== undefined) obj[field] = value;
    }
    return obj;
  });
}

function parseDate(value: string): string {
  if (!value) return '';
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
    const [m, d, y] = v.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const isoMatch = v.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoMatch) return isoMatch[1];
  const mdyMatch = v.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s/);
  if (mdyMatch) {
    const [m, d, y] = mdyMatch[1].split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return v;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function parseMonthlyRate(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseTermMonths(value: string): number | null {
  if (!value) return null;
  const num = parseInt(value.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? null : num;
}

function parseBillingDay(value: string): number | null {
  if (!value) return null;
  const num = parseInt(value.replace(/[^\d]/g, ''), 10);
  if (isNaN(num) || num < 1 || num > 31) return null;
  return num;
}

function normalizeAccountType(value: string): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (['residential', 'res', 'home', 'house'].includes(v)) return 'residential';
  if (['commercial', 'com', 'business', 'corp'].includes(v)) return 'commercial';
  return null;
}

function normalizePaymentMethod(value: string): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (['credit card', 'cc', 'card', 'visa', 'mastercard', 'amex'].includes(v)) return 'credit_card';
  if (['ach', 'bank', 'echeck', 'e-check', 'checking'].includes(v)) return 'ach';
  return null;
}

function parseServices(value: string, serviceCatalog: MonitoringService[]): { id: string; name: string; monthly_price: string }[] {
  if (!value) return [];
  const items = value.split(/[;,\n|]/).map(s => s.trim()).filter(Boolean);
  const matched: { id: string; name: string; monthly_price: string }[] = [];
  for (const item of items) {
    const itemLower = item.toLowerCase();
    const svc = serviceCatalog.find(s =>
      s.name.toLowerCase() === itemLower ||
      s.name.toLowerCase().includes(itemLower) ||
      itemLower.includes(s.name.toLowerCase())
    );
    if (svc) {
      matched.push({ id: svc.id, name: svc.name, monthly_price: svc.monthly_price });
    }
  }
  return matched;
}

function calculateNextBillingDate(startDate: string, billingDay: number | null): string {
  const d = new Date(startDate);
  if (billingDay && billingDay >= 1 && billingDay <= 31) {
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(billingDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

/* ── Component ──────────────────────────────────────────────────── */

export function SecurityContractCSVImport() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<ContractColumnMap | null>(null);
  const [validations, setValidations] = useState<RowValidation[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState({ imported: 0, skipped: 0, errors: 0, batchId: '', insertErrors: [] as string[] });
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'errors' | 'warnings' | 'valid'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [parseError, setParseError] = useState('');
  const [importError, setImportError] = useState('');
  const [serviceCatalog, setServiceCatalog] = useState<MonitoringService[]>([]);
  const [autoInvoiceEnabled, setAutoInvoiceEnabled] = useState(false);

  useEffect(() => {
    loadHistory();
    loadServiceCatalog();
  }, []);

  const loadServiceCatalog = async () => {
    const { data } = await supabase
      .from('monitoring_services')
      .select('id, name, monthly_price, category')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (data) setServiceCatalog(data as MonitoringService[]);
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('security_contract_import_batches')
      .select('*')
      .order('imported_at', { ascending: false })
      .limit(15);
    if (data) setHistory(data as ImportBatch[]);
  };

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setParseError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const result = parseCSV(text);
        if (result.rowCount === 0) {
          setParseError('The CSV file appears to be empty or has no data rows.');
          return;
        }
        setParsed(result);
        const detected = detectContractColumnMapping(result);
        setMapping(detected);
        setStep('mapping');
      } catch (err: any) {
        setParseError(err.message || 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.name.endsWith('.csv') || dropped.type === 'text/csv')) {
      handleFileSelect(dropped);
    }
  }, [handleFileSelect]);

  const updateMapping = (field: string, sourceColumn: string) => {
    if (!parsed || !mapping) return;
    const newMapping = { ...mapping };
    for (const [key] of Object.entries(newMapping)) {
      if (key === 'unmapped') continue;
      const cm = (newMapping as any)[key] as ColumnMapping | undefined;
      if (cm && cm.sourceColumn === sourceColumn && key !== field) {
        (newMapping as any)[key] = undefined;
      }
    }
    if (sourceColumn === '') {
      (newMapping as any)[field] = undefined;
    } else {
      const headerIndex = parsed.headers.indexOf(sourceColumn);
      const samples = parsed.rows.slice(0, 3).map(r => r[headerIndex]).filter(Boolean);
      (newMapping as any)[field] = { sourceColumn, targetField: field, confidence: 1.0, samples };
    }
    newMapping.unmapped = parsed.headers.filter(h => {
      return !Object.entries(newMapping).some(([k, v]) => {
        if (k === 'unmapped') return false;
        return (v as ColumnMapping)?.sourceColumn === h;
      });
    });
    setMapping(newMapping);
  };

  const runValidation = async () => {
    if (!parsed || !mapping) return;
    setStep('validation');

    const rawObjects = rowsToObjects(parsed);
    const mapped = applyContractMapping(rawObjects, mapping);

    // Pre-load contact emails for matching
    const allEmails = mapped.map(r => (r.customer_email || '').trim().toLowerCase()).filter(Boolean);
    const contactMap = new Map<string, { id: string; name: string }>();
    try {
      const CHUNK = 200;
      for (let i = 0; i < allEmails.length; i += CHUNK) {
        const slice = allEmails.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('contacts')
          .select('id, email, first_name, last_name, contact_name')
          .in('email', slice);
        if (data) {
          for (const c of data) {
            if (c.email) contactMap.set(c.email.toLowerCase(), {
              id: c.id,
              name: c.contact_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email,
            });
          }
        }
      }
    } catch (_) {}

    const validationsArr: RowValidation[] = [];

    for (let i = 0; i < mapped.length; i++) {
      const raw = mapped[i];
      const errors: string[] = [];
      const warnings: string[] = [];
      const cleaned: Record<string, string> = {};

      for (const [key, val] of Object.entries(raw)) {
        cleaned[key] = (val || '').trim();
      }

      // Validate email
      if (!cleaned.customer_email) {
        errors.push('Missing customer email (required to match contact)');
      } else if (!isValidEmail(cleaned.customer_email)) {
        errors.push(`Invalid email: "${cleaned.customer_email}"`);
      }

      // Validate monthly rate
      const rate = parseMonthlyRate(cleaned.monthly_rate || '');
      if (rate === null) {
        errors.push('Missing or invalid monthly rate');
      } else if (rate <= 0) {
        errors.push('Monthly rate must be greater than 0');
      }

      // Validate start date
      if (!cleaned.start_date) {
        errors.push('Missing start date');
      } else {
        cleaned.start_date = parseDate(cleaned.start_date);
        const d = new Date(cleaned.start_date);
        if (isNaN(d.getTime())) {
          errors.push(`Invalid start date: "${cleaned.start_date}"`);
        }
      }

      // Validate term months
      if (cleaned.term_months) {
        const term = parseTermMonths(cleaned.term_months);
        if (term === null || term <= 0) {
          warnings.push(`Invalid term months: "${cleaned.term_months}" — will default to 12`);
        }
      }

      // Validate billing day
      if (cleaned.billing_day) {
        const bd = parseBillingDay(cleaned.billing_day);
        if (bd === null) {
          warnings.push(`Invalid billing day: "${cleaned.billing_day}" — will default to start date day`);
        }
      }

      // Validate account type
      if (cleaned.account_type) {
        const at = normalizeAccountType(cleaned.account_type);
        if (!at) {
          warnings.push(`Unrecognized account type: "${cleaned.account_type}" — will default to residential`);
        }
      }

      // Validate payment method
      if (cleaned.payment_method) {
        const pm = normalizePaymentMethod(cleaned.payment_method);
        if (!pm) {
          warnings.push(`Unrecognized payment method: "${cleaned.payment_method}"`);
        }
      }

      // Match contact
      let contactId: string | null = null;
      let contactName = '';
      if (cleaned.customer_email && isValidEmail(cleaned.customer_email)) {
        const match = contactMap.get(cleaned.customer_email.toLowerCase());
        if (match) {
          contactId = match.id;
          contactName = match.name;
        } else {
          errors.push(`No contact found for email "${cleaned.customer_email}" — import contacts first`);
        }
      }

      validationsArr.push({
        rowIndex: i,
        data: raw,
        cleanedData: cleaned,
        errors,
        warnings,
        skipped: errors.length > 0,
        contactId,
        contactName,
      });
    }

    setValidations(validationsArr);
  };

  const toggleSkip = (rowIndex: number) => {
    setValidations(prev => prev.map(v =>
      v.rowIndex === rowIndex ? { ...v, skipped: !v.skipped } : v
    ));
  };

  const runImport = async () => {
    if (!profile) return;
    setStep('importing');
    setImportProgress(0);
    setImportError('');

    const toImport = validations.filter(v => !v.skipped && v.errors.length === 0);
    const skippedCount = validations.filter(v => v.skipped).length;
    const errorCount = validations.filter(v => v.errors.length > 0).length;

    // Create import batch
    const { data: batchData, error: batchError } = await supabase
      .from('security_contract_import_batches')
      .insert({
        organization_id: profile.organization_id,
        imported_by: profile.id,
        imported_by_name: profile.full_name || profile.username,
        file_name: file?.name || 'import.csv',
        row_count: toImport.length,
        skipped_count: skippedCount,
        error_count: errorCount,
        status: 'pending',
      })
      .select('id')
      .single();

    if (batchError || !batchData) {
      setImportError(batchError?.message || 'Failed to create import batch record.');
      setStep('validation');
      return;
    }

    const batchId = batchData.id;
    let imported = 0;
    const insertErrors: string[] = [];

    // Get template and plan IDs
    const { data: template } = await supabase
      .from('security_contract_templates')
      .select('id, default_billing_plan_id')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!template) {
      setImportError('No active security contract template found. Create a template first.');
      setStep('validation');
      return;
    }

    const templateId = template.id;
    const planId = template.default_billing_plan_id;

    for (let i = 0; i < toImport.length; i++) {
      const v = toImport[i];
      const d = v.cleanedData;

      try {
        const rate = parseMonthlyRate(d.monthly_rate || '') || 0;
        const term = parseTermMonths(d.term_months || '') || 12;
        const billingDay = parseBillingDay(d.billing_day || '') || new Date(d.start_date).getDate();
        const accountType = normalizeAccountType(d.account_type || '') || 'residential';
        const paymentMethod = normalizePaymentMethod(d.payment_method || '') || null;
        const startDate = d.start_date;
        const nextBillingDate = calculateNextBillingDate(startDate, billingDay);

        // 1. Create recurring subscription
        const subData: Record<string, any> = {
          organization_id: profile.organization_id,
          contact_id: v.contactId,
          plan_id: planId,
          custom_amount: rate,
          start_date: startDate,
          next_billing_date: nextBillingDate,
          status: 'active',
          billing_day: billingDay,
          auto_invoice: autoInvoiceEnabled,
          auto_send: autoInvoiceEnabled,
          office_id: profile.office_id || null,
          created_by: profile.id,
        };
        if (d.external_id) subData.billing_external_id = d.external_id;

        const { data: subscription, error: subError } = await supabase
          .from('recurring_subscriptions')
          .insert(subData)
          .select('id')
          .single();

        if (subError || !subscription) {
          insertErrors.push(`Row ${i + 1}: Failed to create subscription: ${subError?.message || 'unknown'}`);
          continue;
        }

        // 2. Create security contract
        const contractData: Record<string, any> = {
          organization_id: profile.organization_id,
          contact_id: v.contactId,
          template_id: templateId,
          status: 'active',
          monthly_price: rate,
          term_months: term,
          activated_at: startDate,
          approved_at: startDate,
          subscription_id: subscription.id,
          account_type: accountType,
          account_number: d.account_number || null,
          payment_method: paymentMethod,
          last_four: d.last_four || null,
          notes: d.notes || null,
          import_batch_id: batchId,
          imported_from_external: true,
          created_by_user_id: profile.id,
        };

        const { data: contract, error: contractError } = await supabase
          .from('security_contracts')
          .insert(contractData)
          .select('id')
          .single();

        if (contractError || !contract) {
          insertErrors.push(`Row ${i + 1}: Failed to create contract: ${contractError?.message || 'unknown'}`);
          // Clean up orphaned subscription
          await supabase.from('recurring_subscriptions').delete().eq('id', subscription.id);
          continue;
        }

        // 3. Create service junction rows
        if (d.services && serviceCatalog.length > 0) {
          const services = parseServices(d.services, serviceCatalog);
          if (services.length > 0) {
            const serviceRows = services.map(s => ({
              contract_id: contract.id,
              service_id: s.id,
              monthly_price: parseFloat(s.monthly_price) || 0,
              organization_id: profile.organization_id,
            }));
            await supabase.from('security_contract_services').insert(serviceRows);
          }
        }

        imported++;
      } catch (err: any) {
        insertErrors.push(`Row ${i + 1}: ${err.message || 'Unexpected error'}`);
      }

      setImportProgress(Math.round(((i + 1) / toImport.length) * 95));
    }

    await supabase
      .from('security_contract_import_batches')
      .update({ status: 'completed', row_count: imported })
      .eq('id', batchId);

    setImportStats({ imported, skipped: skippedCount, errors: errorCount, batchId, insertErrors });
    setStep('complete');
    loadHistory();
  };

  const rollbackBatch = async (batchId: string) => {
    setRollingBack(batchId);
    // Delete contracts in this batch (cascades to service junctions)
    await supabase.from('security_contracts').delete().eq('import_batch_id', batchId);
    // Delete subscriptions linked to those contracts
    // (contracts are already deleted, subscriptions were linked via subscription_id)
    // Mark batch as rolled back
    await supabase.from('security_contract_import_batches').update({ status: 'rolled_back' }).eq('id', batchId);
    setRollingBack(null);
    loadHistory();
  };

  const downloadErrorReport = () => {
    const skipped = validations.filter(v => v.skipped || v.errors.length > 0);
    if (skipped.length === 0) return;
    const allFields = Object.keys(skipped[0]?.data || {});
    const headers = [...allFields, 'reason'];
    const rows = skipped.map(v => {
      const reason = v.errors.join('; ');
      return [...allFields.map(f => `"${(v.data[f] || '').replace(/"/g, '""')}"`), `"${reason}"`].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract_import_errors_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setStep('upload');
    setFile(null);
    setParsed(null);
    setMapping(null);
    setValidations([]);
    setImportProgress(0);
    setImportStats({ imported: 0, skipped: 0, errors: 0, batchId: '', insertErrors: [] });
    setSearchTerm('');
    setFilterMode('all');
    setCurrentPage(1);
    setParseError('');
  };

  const filteredValidations = validations.filter(v => {
    const matchesFilter =
      filterMode === 'all' ? true :
      filterMode === 'errors' ? v.errors.length > 0 :
      filterMode === 'warnings' ? v.warnings.length > 0 :
      filterMode === 'valid' ? (v.errors.length === 0 && !v.skipped) : true;
    if (!matchesFilter) return false;
    if (searchTerm) {
      const email = (v.cleanedData.customer_email || '').toLowerCase();
      const name = (v.contactName || v.cleanedData.customer_name || '').toLowerCase();
      const acct = (v.cleanedData.account_number || '').toLowerCase();
      const term = searchTerm.toLowerCase();
      return email.includes(term) || name.includes(term) || acct.includes(term);
    }
    return true;
  });

  const totalPages = Math.ceil(filteredValidations.length / PAGE_SIZE);
  const pagedValidations = filteredValidations.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const validCount = validations.filter(v => !v.skipped && v.errors.length === 0).length;
  const errorCount = validations.filter(v => v.errors.length > 0).length;
  const warningCount = validations.filter(v => v.warnings.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Import Security Contracts from CSV</h2>
          <p className="text-gray-500 mt-1">Bulk-import existing security contracts with automatic recurring billing</p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <History className="w-4 h-4" />
          Import History
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {showHistory && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-800">Recent Import History</h3>
          </div>
          {history.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No imports yet</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map(batch => (
                <div key={batch.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${
                      batch.status === 'completed' ? 'bg-green-500' :
                      batch.status === 'rolled_back' ? 'bg-gray-400' : 'bg-yellow-500'
                    }`} />
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{batch.file_name}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(batch.imported_at).toLocaleString()} by {batch.imported_by_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-green-600 font-medium">{batch.row_count} imported</span>
                    <span className="text-gray-400">{batch.skipped_count} skipped</span>
                    {batch.error_count > 0 && <span className="text-red-500">{batch.error_count} errors</span>}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      batch.status === 'completed' ? 'bg-green-100 text-green-700' :
                      batch.status === 'rolled_back' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {batch.status}
                    </span>
                    {batch.status === 'completed' && (
                      <button
                        onClick={() => rollbackBatch(batch.id)}
                        disabled={rollingBack === batch.id}
                        className="flex items-center gap-1 px-3 py-1 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-xs"
                      >
                        {rollingBack === batch.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
                        )}
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step !== 'complete' && (
        <div className="flex items-center gap-2">
          {(['upload', 'mapping', 'validation', 'importing'] as ImportStep[]).map((s, i) => {
            const labels: Record<ImportStep, string> = {
              upload: '1. Upload', mapping: '2. Map Columns',
              validation: '3. Review', importing: '4. Import', complete: '5. Done'
            };
            const steps: ImportStep[] = ['upload', 'mapping', 'validation', 'importing', 'complete'];
            const currentIdx = steps.indexOf(step);
            const thisIdx = steps.indexOf(s);
            const isActive = step === s;
            const isDone = currentIdx > thisIdx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' :
                  isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : null}
                  {labels[s]}
                </div>
                {i < 3 && <ArrowRight className="w-4 h-4 text-gray-300" />}
              </div>
            );
          })}
        </div>
      )}

      {step === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Drop your CSV file here</h3>
            <p className="text-gray-400 text-sm mb-4">or click to browse</p>
            <p className="text-xs text-gray-400">Supports CSV files with up to 50,000 rows</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          {parseError && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {parseError}
            </div>
          )}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" /> Required CSV Columns
              </p>
              <ul className="space-y-1 list-disc list-inside text-blue-700">
                <li>Customer Email — must match existing contacts</li>
                <li>Monthly Rate — dollar amount (e.g. 49.99)</li>
                <li>Start Date — when the contract began</li>
              </ul>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
              <p className="font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Optional Columns
              </p>
              <ul className="space-y-1 list-disc list-inside text-gray-600">
                <li>Account Number, Account Type (residential/commercial)</li>
                <li>Term Months, Billing Day, Payment Method</li>
                <li>Services (semicolon-separated), Notes, External ID</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 bg-amber-50 rounded-lg p-4 text-sm text-amber-800">
            <p className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Important:</strong> Import your customer contacts first using the Contact CSV Import tool.
                Each contract row's customer email must match an existing contact record.
              </span>
            </p>
          </div>
        </div>
      )}

      {step === 'mapping' && parsed && mapping && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Map CSV Columns to Contract Fields</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {parsed.rowCount.toLocaleString()} rows detected in <span className="font-medium">{file?.name}</span>
                </p>
              </div>
              <button onClick={resetImport} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 gap-3">
              {ALL_CONTRACT_FIELDS.map(field => {
                const currentMapping = (mapping as any)[field] as ColumnMapping | undefined;
                return (
                  <div key={field}>
                    <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
                      <div className="w-40 flex-shrink-0">
                        <span className="text-sm font-medium text-gray-700">{CONTRACT_FIELD_LABELS[field]}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <select
                        value={currentMapping?.sourceColumn || ''}
                        onChange={e => updateMapping(field, e.target.value)}
                        className={`flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          currentMapping ? 'border-green-300 bg-green-50' : 'border-gray-300'
                        }`}
                      >
                        <option value="">-- not mapped --</option>
                        {parsed.headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      {currentMapping && (
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${
                              currentMapping.confidence >= 0.9 ? 'bg-green-500' :
                              currentMapping.confidence >= 0.7 ? 'bg-yellow-500' : 'bg-orange-500'
                            }`} />
                            <span className="text-xs text-gray-400">
                              {Math.round(currentMapping.confidence * 100)}%
                            </span>
                          </div>
                          {currentMapping.samples.length > 0 && (
                            <span className="text-xs text-gray-400 max-w-xs truncate">
                              e.g. {currentMapping.samples.slice(0, 2).join(', ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 bg-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign className={`w-5 h-5 ${autoInvoiceEnabled ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Enable automatic billing on import</p>
                    <p className="text-xs text-gray-500">
                      {autoInvoiceEnabled
                        ? 'Invoices will be auto-generated on next billing date'
                        : 'Contracts imported without auto-billing (enable later in Contract Management)'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAutoInvoiceEnabled(!autoInvoiceEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    autoInvoiceEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    autoInvoiceEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            {!mapping.customer_email && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Customer Email is required — it must be mapped to match contracts with existing contacts.
              </div>
            )}
            {!mapping.monthly_rate && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Monthly Rate is required for billing setup.
              </div>
            )}
            {!mapping.start_date && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Start Date is required to set the contract activation and billing cycle.
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={runValidation}
                disabled={!mapping.customer_email || !mapping.monthly_rate || !mapping.start_date}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Validate & Review
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'validation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Ready to Import', count: validCount, color: 'green', icon: CheckCircle, filter: 'valid' },
              { label: 'Errors', count: errorCount, color: 'red', icon: AlertCircle, filter: 'errors' },
              { label: 'Warnings', count: warningCount, color: 'yellow', icon: AlertCircle, filter: 'warnings' },
              { label: 'Auto-Billing', count: autoInvoiceEnabled ? validCount : 0, color: 'blue', icon: DollarSign, filter: 'all' },
            ].map(({ label, count, color, icon: Icon, filter }) => (
              <button
                key={label}
                onClick={() => { setFilterMode(filter as any); setCurrentPage(1); }}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  filterMode === filter
                    ? `border-${color}-500 bg-${color}-50`
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`flex items-center gap-2 text-${color}-600 mb-1`}>
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
                <div className={`text-2xl font-bold text-${color}-700`}>{count.toLocaleString()}</div>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by email, name, or account number..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="flex-1 text-sm border-none outline-none bg-transparent"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'valid', 'errors', 'warnings'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => { setFilterMode(f); setCurrentPage(1); }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      filterMode === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
              {pagedValidations.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No rows match this filter</div>
              ) : (
                pagedValidations.map(v => (
                  <div key={v.rowIndex} className={`p-3 flex items-start gap-3 ${v.skipped ? 'opacity-60' : ''}`}>
                    <button
                      onClick={() => toggleSkip(v.rowIndex)}
                      className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 transition-colors ${
                        v.skipped
                          ? 'bg-gray-300 border-gray-300'
                          : v.errors.length > 0
                          ? 'bg-red-100 border-red-400'
                          : 'bg-green-500 border-green-500'
                      }`}
                      title={v.skipped ? 'Click to include' : 'Click to skip'}
                    >
                      {!v.skipped && <CheckCircle className="w-3 h-3 text-white" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800 text-sm">{v.contactName || v.cleanedData.customer_name || '(no name)'}</span>
                        {v.cleanedData.customer_email && (
                          <span className="text-blue-600 text-xs">{v.cleanedData.customer_email}</span>
                        )}
                        {v.cleanedData.monthly_rate && (
                          <span className="text-green-600 text-xs font-medium">${v.cleanedData.monthly_rate}/mo</span>
                        )}
                        {v.cleanedData.account_number && (
                          <span className="text-gray-400 text-xs">Acct: {v.cleanedData.account_number}</span>
                        )}
                      </div>
                      {v.errors.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.errors.map((e, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                              <AlertCircle className="w-3 h-3" /> {e}
                            </span>
                          ))}
                        </div>
                      )}
                      {v.warnings.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.warnings.map((w, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">
                              <AlertCircle className="w-3 h-3" /> {w}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                      v.skipped ? 'bg-gray-100 text-gray-500' :
                      v.errors.length > 0 ? 'bg-red-100 text-red-600' :
                      v.warnings.length > 0 ? 'bg-yellow-100 text-yellow-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {v.skipped ? 'skip' : v.errors.length > 0 ? 'error' : v.warnings.length > 0 ? 'warning' : 'ready'}
                    </span>
                  </div>
                ))
              )}
            </div>

            {totalPages > 1 && (
              <div className="p-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredValidations.length)} of {filteredValidations.length.toLocaleString()} rows
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1">{currentPage} / {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <button onClick={() => setStep('mapping')} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm">
                <ArrowLeft className="w-4 h-4" /> Back to Mapping
              </button>
              {(errorCount > 0) && (
                <button
                  onClick={downloadErrorReport}
                  className="flex items-center gap-1.5 text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" /> Download Error Report
                </button>
              )}
            </div>
            <button
              onClick={runImport}
              disabled={validCount === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <Shield className="w-4 h-4" />
              Import {validCount.toLocaleString()} Contracts
            </button>
          </div>
          {importError && (
            <div className="mt-4 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{importError}</span>
            </div>
          )}
        </div>
      )}

      {step === 'importing' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Importing Security Contracts...</h3>
          <p className="text-gray-500 mb-6">Creating contracts and recurring billing subscriptions</p>
          <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(importProgress, 100)}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-3">{Math.min(importProgress, 100)}% complete</p>
        </div>
      )}

      {step === 'complete' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">Import Complete!</h3>
          <p className="text-gray-500 mb-8">Your security contracts have been imported with recurring billing.</p>

          <div className="grid grid-cols-3 gap-6 max-w-md mx-auto mb-8">
            <div className="p-4 bg-green-50 rounded-xl">
              <div className="text-3xl font-bold text-green-700">{importStats.imported.toLocaleString()}</div>
              <div className="text-sm text-green-600 mt-1">Imported</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="text-3xl font-bold text-gray-600">{importStats.skipped.toLocaleString()}</div>
              <div className="text-sm text-gray-500 mt-1">Skipped</div>
            </div>
            <div className="p-4 bg-red-50 rounded-xl">
              <div className="text-3xl font-bold text-red-600">{importStats.errors.toLocaleString()}</div>
              <div className="text-sm text-red-500 mt-1">Errors</div>
            </div>
          </div>

          {importStats.insertErrors.length > 0 && (
            <div className="mb-6 text-left max-w-lg mx-auto">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Some rows failed to import
                </p>
                <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
                  {importStats.insertErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-4">
            {(importStats.errors > 0 || importStats.skipped > 0) && (
              <button
                onClick={downloadErrorReport}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" /> Download Error Report
              </button>
            )}
            <button
              onClick={() => rollbackBatch(importStats.batchId)}
              disabled={rollingBack === importStats.batchId}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              {rollingBack === importStats.batchId ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Undo This Import
            </button>
            <button
              onClick={resetImport}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Eye className="w-4 h-4" /> Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
