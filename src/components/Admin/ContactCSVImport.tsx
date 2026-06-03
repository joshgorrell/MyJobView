import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Upload, FileText, AlertCircle, CheckCircle, X, Download,
  ArrowRight, ArrowLeft, Users, SkipForward, Trash2,
  ChevronDown, ChevronUp, History, RotateCcw, Search,
  RefreshCw, Eye
} from 'lucide-react';
import {
  parseCSV,
  detectContactColumnMapping,
  applyContactMapping,
  rowsToObjects,
  type ParsedCSV,
  type ContactColumnMap,
  type ColumnMapping
} from '../../lib/csvParser';
import { generateUsername } from '../../lib/username';

const US_STATE_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
};

const CONTACT_FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  company_name: 'Company Name',
  email: 'Email',
  phone: 'Phone',
  business_phone: 'Business Phone',
  mobile_phone: 'Mobile Phone',
  street_address: 'Street Address',
  city: 'City',
  state: 'State',
  zip_code: 'Zip Code',
  country: 'Country',
  contact_type: 'Contact Type',
  payment_terms: 'Payment Terms',
  office: 'Office',
  sales_rep: 'Sales Rep',
};

const ALL_CONTACT_FIELDS = Object.keys(CONTACT_FIELD_LABELS);

type ImportStep = 'upload' | 'mapping' | 'validation' | 'importing' | 'complete';

interface RowValidation {
  rowIndex: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  skipped: boolean;
  cleanedData: Record<string, string>;
  officeId: string;
  assignedToId: string;
}

interface SalesRep {
  id: string;
  full_name: string | null;
  username: string;
  first_name: string | null;
  last_name: string | null;
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

interface Office {
  id: string;
  office_name: string;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone.trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && /^[\d\s\-().+x]+$/i.test(value.trim());
}

function extractPhoneFromEmailField(value: string): { phone: string | null; label: string | null } {
  const v = value.trim();
  const digits = v.replace(/\D/g, '');

  if (!v) return { phone: null, label: null };

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (looksLikeEmail) return { phone: null, label: null };

  const phonePattern = /(?:\d[\d\s\-().]{5,}\d)/g;
  const match = v.match(phonePattern);
  const phoneDigits = match ? match[0].replace(/\D/g, '') : '';

  if (phoneDigits.length >= 7) {
    return { phone: match![0].trim(), label: v.replace(match![0], '').trim() || null };
  }

  if (digits.length >= 7) {
    return { phone: v, label: null };
  }

  return { phone: null, label: null };
}

function classifyEmailFieldValue(value: string): 'valid_email' | 'phone' | 'junk' {
  const v = value.trim();
  if (!v) return 'junk';

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'valid_email';

  const multipleEmails = v.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g);
  if (multipleEmails && multipleEmails.length >= 2) return 'valid_email';

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+/.test(v)) return 'valid_email';

  const extracted = extractPhoneFromEmailField(v);
  if (extracted.phone) return 'phone';

  return 'junk';
}

function normalizeState(state: string): string {
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const mapped = US_STATE_MAP[trimmed.toLowerCase()];
  return mapped || trimmed;
}

function normalizeZip(zip: string): string {
  const digits = zip.replace(/\D/g, '');
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits.slice(0, 5) || zip.trim();
}

function toTitleCase(str: string): string {
  return str.trim().replace(/\w\S*/g, txt =>
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

function cleanRow(raw: Record<string, string>): { cleaned: Record<string, string>; errors: string[]; warnings: string[] } {
  const cleaned: Record<string, string> = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [key, val] of Object.entries(raw)) {
    cleaned[key] = (val || '').trim();
  }

  if (cleaned.email) {
    const emailClass = classifyEmailFieldValue(cleaned.email);
    if (emailClass === 'valid_email') {
      const multipleEmails = cleaned.email.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g);
      if (multipleEmails && multipleEmails.length >= 2) {
        cleaned.email = multipleEmails[0].trim();
        warnings.push(`Multiple emails found; using first: "${cleaned.email}"`);
      } else {
        const singleMatch = cleaned.email.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
        if (singleMatch) cleaned.email = singleMatch[0].trim();
      }
    } else if (emailClass === 'phone') {
      const extracted = extractPhoneFromEmailField(cleaned.email);
      const originalEmail = cleaned.email;
      cleaned.email = '';
      if (extracted.phone) {
        const phoneNum = extracted.phone;
        if (!cleaned.phone) {
          cleaned.phone = normalizePhone(phoneNum);
          warnings.push(`Phone number moved from Email field to Phone: "${originalEmail}"`);
        } else {
          warnings.push(`Email field contained a phone number (ignored, phone already set): "${originalEmail}"`);
        }
      }
    } else {
      warnings.push(`Email field contained non-email value (cleared): "${cleaned.email}"`);
      cleaned.email = '';
    }
  }

  const phoneFields = ['phone', 'business_phone', 'mobile_phone'];
  for (const field of phoneFields) {
    if (cleaned[field]) {
      const digits = cleaned[field].replace(/\D/g, '');
      if (digits.length > 0 && digits.length !== 10 && !(digits.length === 11 && digits[0] === '1')) {
        warnings.push(`${CONTACT_FIELD_LABELS[field] || field} may be invalid: "${cleaned[field]}"`);
      } else {
        cleaned[field] = normalizePhone(cleaned[field]);
      }
    }
  }

  if (cleaned.state) cleaned.state = normalizeState(cleaned.state);
  if (cleaned.zip_code) cleaned.zip_code = normalizeZip(cleaned.zip_code);

  if (cleaned.first_name) cleaned.first_name = toTitleCase(cleaned.first_name);
  if (cleaned.last_name) cleaned.last_name = toTitleCase(cleaned.last_name);
  if (cleaned.city) cleaned.city = toTitleCase(cleaned.city);

  if (cleaned.contact_type) {
    const ct = cleaned.contact_type.toLowerCase();
    if (['person', 'individual', 'customer', 'residential'].includes(ct)) {
      cleaned.contact_type = 'person';
    } else if (['business', 'company', 'commercial', 'corporate'].includes(ct)) {
      cleaned.contact_type = 'business';
    } else {
      cleaned.contact_type = 'person';
    }
  } else {
    cleaned.contact_type = 'person';
  }

  const hasPhone = !!(cleaned.phone || cleaned.mobile_phone);
  const hasEmail = !!cleaned.email;
  const hasAddress = !!cleaned.street_address;

  if (!hasAddress) errors.push('Requires a street address');
  if (!hasPhone) errors.push('Requires a phone number');
  if (!hasEmail) errors.push('Requires an email address');

  if (cleaned.contact_type === 'business') {
    if (!cleaned.company_name) {
      errors.push('Requires a company name');
    }
  } else {
    if (!cleaned.first_name) {
      errors.push('Requires a first name');
    }
    if (!cleaned.last_name) {
      errors.push('Requires a last name');
    }
  }

  return { cleaned, errors, warnings };
}

function getContactName(row: Record<string, string>): string {
  if (row.first_name || row.last_name) {
    return [row.first_name, row.last_name].filter(Boolean).join(' ');
  }
  if (row.company_name) return row.company_name;
  return '';
}

export function ContactCSVImport() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<ContactColumnMap | null>(null);
  const [validations, setValidations] = useState<RowValidation[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('');
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState({ imported: 0, skipped: 0, errors: 0, batchId: '', insertErrors: [] as string[] });
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'errors' | 'warnings' | 'duplicates' | 'valid'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [updateDuplicates, setUpdateDuplicates] = useState(false);

  const PAGE_SIZE = 50;

  useEffect(() => {
    loadOffices();
    loadHistory();
    loadSalesReps();
  }, []);

  const loadSalesReps = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, first_name, last_name')
      .in('role', ['sales', 'sales_rep', 'sales_manager', 'service_manager', 'manager', 'admin'])
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    if (data) setSalesReps(data);
  };

  const loadOffices = async () => {
    const { data } = await supabase
      .from('company_offices')
      .select('id, office_name')
      .order('display_order', { ascending: true });
    if (data) {
      setOffices(data);
      if (data.length > 0) setSelectedOfficeId(data[0].id);
    }
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('contact_import_batches')
      .select('*')
      .order('imported_at', { ascending: false })
      .limit(15);
    if (data) setHistory(data);
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
        const detected = detectContactColumnMapping(result);
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

  const getSalesRepName = (rep: SalesRep): string =>
    rep.full_name || [rep.first_name, rep.last_name].filter(Boolean).join(' ') || rep.username;

  const resolveRowSalesRepId = (cleaned: Record<string, string>): string => {
    if (cleaned.sales_rep) {
      const val = cleaned.sales_rep.trim().toLowerCase();
      if (val === 'aaron nickell') {
        return 'f44449cd-5dbf-4a25-9a00-ba9431df5476';
      }
      const match = salesReps.find(r =>
        r.id === cleaned.sales_rep.trim() ||
        getSalesRepName(r).toLowerCase() === val ||
        r.username.toLowerCase() === val
      );
      if (match) return match.id;
    }
    return '';
  };

  const resolveRowOfficeId = (cleaned: Record<string, string>): string => {
    if (cleaned.office) {
      const officeVal = cleaned.office.trim().toLowerCase();
      const match = offices.find(o =>
        o.office_name.toLowerCase() === officeVal ||
        o.id === cleaned.office.trim()
      );
      if (match) return match.id;
    }
    return selectedOfficeId;
  };

  const runValidation = async () => {
    if (!parsed || !mapping) return;
    setStep('validation');

    const rawObjects = rowsToObjects(parsed);
    const mapped = applyContactMapping(rawObjects, mapping);

    const validationsArr: RowValidation[] = [];

    const allMappedEmails = mapped
      .map(r => (r.email || '').trim().toLowerCase())
      .filter(Boolean);

    let existingEmailsInDB = new Set<string>();
    try {
      const DEDUP_CHUNK = 200;
      for (let ei = 0; ei < allMappedEmails.length; ei += DEDUP_CHUNK) {
        const emailSlice = allMappedEmails.slice(ei, ei + DEDUP_CHUNK);
        const { data } = await supabase
          .from('contacts')
          .select('email')
          .in('email', emailSlice);
        if (data) {
          for (const r of data) {
            if (r.email) existingEmailsInDB.add(r.email.toLowerCase());
          }
        }
      }
    } catch (_) {}

    const CHUNK = 200;
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const chunk = mapped.slice(i, i + CHUNK);

      for (const raw of chunk) {
        const { cleaned, errors, warnings } = cleanRow(raw);
        const rowIdx = i + chunk.indexOf(raw);

        let isDuplicate = false;
        const emailLower = (cleaned.email || '').toLowerCase();

        if (emailLower && existingEmailsInDB.has(emailLower)) {
          isDuplicate = true;
        }

        validationsArr.push({
          rowIndex: rowIdx,
          data: raw,
          cleanedData: cleaned,
          errors,
          warnings,
          isDuplicate,
          skipped: isDuplicate || errors.length > 0,
          officeId: resolveRowOfficeId(cleaned),
          assignedToId: resolveRowSalesRepId(cleaned),
        });
      }
    }

    setValidations(validationsArr);
  };

  const toggleSkip = (rowIndex: number) => {
    setValidations(prev => prev.map(v =>
      v.rowIndex === rowIndex ? { ...v, skipped: !v.skipped } : v
    ));
  };

  const updateRowOffice = (rowIndex: number, officeId: string) => {
    setValidations(prev => prev.map(v =>
      v.rowIndex === rowIndex ? { ...v, officeId } : v
    ));
  };

  const updateRowSalesRep = (rowIndex: number, assignedToId: string) => {
    setValidations(prev => prev.map(v =>
      v.rowIndex === rowIndex ? { ...v, assignedToId } : v
    ));
  };

  const handleToggleUpdateDuplicates = (enabled: boolean) => {
    setUpdateDuplicates(enabled);
    setValidations(prev => prev.map(v => {
      if (!v.isDuplicate) return v;
      return { ...v, skipped: !enabled };
    }));
  };

  const runImport = async () => {
    if (!profile) return;
    setStep('importing');
    setImportProgress(0);
    setImportError('');

    const toImport = validations.filter(v => !v.skipped && v.errors.length === 0);
    const toInsert = toImport.filter(v => !v.isDuplicate);
    const toUpdate = toImport.filter(v => v.isDuplicate);
    const skippedCount = validations.filter(v => v.skipped).length;
    const errorCount = validations.filter(v => v.errors.length > 0 && !v.isDuplicate).length;

    const { data: batchData, error: batchError } = await supabase
      .from('contact_import_batches')
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
      setImportError(batchError?.message || 'Failed to create import record. You may not have permission to import contacts.');
      setStep('validation');
      return;
    }

    const batchId = batchData.id;
    let imported = 0;
    const BATCH_SIZE = 100;
    const insertErrors: string[] = [];

    // Pre-load all existing usernames from DB to avoid duplicate key violations across batches
    const usedUsernames = new Set<string>();
    try {
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data: existing } = await supabase
          .from('contacts')
          .select('username')
          .not('username', 'is', null)
          .range(offset, offset + PAGE - 1);
        if (!existing || existing.length === 0) break;
        for (const r of existing) { if (r.username) usedUsernames.add(r.username); }
        if (existing.length < PAGE) break;
        offset += PAGE;
      }
    } catch (_) { /* non-fatal, continue with empty set */ }

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + BATCH_SIZE);
      const contactRows = [];

      for (const v of chunk) {
        const d = v.cleanedData;

        let contactName = getContactName(d);
        if (!contactName) continue;

        const firstName = d.first_name || '';
        const lastName = d.last_name || '';

        const baseUsername = generateUsername(contactName || d.email || `contact${Date.now()}`);
        let username = baseUsername;
        let suffix = 1;
        while (usedUsernames.has(username)) {
          username = `${baseUsername}${suffix++}`;
        }
        usedUsernames.add(username);

        const officeId = v.officeId || selectedOfficeId || null;

        contactRows.push({
          organization_id: profile.organization_id,
          office_id: officeId,
          assigned_to: v.assignedToId || null,
          created_by: profile.id,
          import_batch_id: batchId,
          contact_type: d.contact_type || 'person',
          contact_name: contactName,
          first_name: firstName || null,
          last_name: lastName || null,
          company_name: d.company_name || null,
          email: d.email || null,
          phone: d.phone || null,
          business_phone: d.business_phone || null,
          mobile_phone: d.mobile_phone || null,
          street_address: d.street_address || null,
          city: d.city || null,
          state: d.state || null,
          zip_code: d.zip_code || null,
          country: d.country || null,
          default_payment_terms: d.payment_terms || null,
          username,
        });
      }

      if (contactRows.length > 0) {
        const { data: insertedData, error: insertError } = await supabase.from('contacts').insert(contactRows).select('id');

        if (insertError) {
          insertErrors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`);
        }

        if (insertedData) {
          imported += insertedData.length;
        }
      }

      setImportProgress(Math.round(((i + BATCH_SIZE) / toImport.length) * 90));
    }

    for (let i = 0; i < toUpdate.length; i++) {
      const v = toUpdate[i];
      const d = v.cleanedData;
      if (!d.email) continue;

      const firstName = d.first_name || '';
      const lastName = d.last_name || '';

      const contactName = getContactName(d);
      const officeId = v.officeId || selectedOfficeId || null;

      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          contact_type: d.contact_type || 'person',
          contact_name: contactName,
          first_name: firstName || null,
          last_name: lastName || null,
          company_name: d.company_name || null,
          phone: d.phone || null,
          business_phone: d.business_phone || null,
          mobile_phone: d.mobile_phone || null,
          street_address: d.street_address || null,
          city: d.city || null,
          state: d.state || null,
          zip_code: d.zip_code || null,
          default_payment_terms: d.payment_terms || null,
          ...(officeId ? { office_id: officeId } : {}),
          ...(v.assignedToId ? { assigned_to: v.assignedToId } : {}),
        })
        .eq('email', d.email.toLowerCase());

      if (updateError) {
        insertErrors.push(`Update ${d.email}: ${updateError.message}`);
      } else {
        imported++;
      }

      setImportProgress(90 + Math.round(((i + 1) / toImport.length) * 10));
    }

    await supabase
      .from('contact_import_batches')
      .update({ status: 'completed', row_count: imported })
      .eq('id', batchId);

    setImportStats({ imported, skipped: skippedCount, errors: errorCount, batchId, insertErrors });
    setStep('complete');
    loadHistory();
  };

  const rollbackBatch = async (batchId: string) => {
    setRollingBack(batchId);
    await supabase.from('contacts').delete().eq('import_batch_id', batchId);
    await supabase.from('contact_import_batches').update({ status: 'rolled_back' }).eq('id', batchId);
    setRollingBack(null);
    loadHistory();
  };

  const downloadErrorReport = () => {
    const skipped = validations.filter(v => v.skipped || v.errors.length > 0);
    if (skipped.length === 0) return;

    const allFields = Object.keys(skipped[0]?.data || {});
    const headers = [...allFields, 'reason'];
    const rows = skipped.map(v => {
      const reason = v.isDuplicate ? 'Duplicate' : v.errors.join('; ');
      return [...allFields.map(f => `"${(v.data[f] || '').replace(/"/g, '""')}"`), `"${reason}"`].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${Date.now()}.csv`;
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
      filterMode === 'duplicates' ? v.isDuplicate :
      filterMode === 'valid' ? (v.errors.length === 0 && !v.isDuplicate) : true;

    if (!matchesFilter) return false;

    if (searchTerm) {
      const name = getContactName(v.cleanedData).toLowerCase();
      const email = (v.cleanedData.email || '').toLowerCase();
      const company = (v.cleanedData.company_name || '').toLowerCase();
      const term = searchTerm.toLowerCase();
      return name.includes(term) || email.includes(term) || company.includes(term);
    }

    return true;
  });

  const totalPages = Math.ceil(filteredValidations.length / PAGE_SIZE);
  const pagedValidations = filteredValidations.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const validCount = validations.filter(v => !v.skipped && v.errors.length === 0).length;
  const duplicateCount = validations.filter(v => v.isDuplicate).length;
  const errorCount = validations.filter(v => v.errors.length > 0 && !v.isDuplicate).length;
  const warningCount = validations.filter(v => v.warnings.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Import Customers from CSV</h2>
          <p className="text-gray-500 mt-1">Upload a CSV file to bulk-import customer contacts</p>
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
            <p className="text-xs text-gray-400">Supports CSV files up to 50,000 rows</p>
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
          <div className="mt-6 bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-semibold mb-2">Tips for a successful import:</p>
            <ul className="space-y-1 list-disc list-inside text-blue-700">
              <li>Include a header row with column names</li>
              <li>Each row needs at least a name (first/last or full) or company name</li>
              <li>Duplicates (matched by email or phone) will be automatically skipped</li>
              <li>State names will be auto-converted to 2-letter codes</li>
              <li>Phone numbers will be normalized to (###) ###-#### format</li>
            </ul>
          </div>
        </div>
      )}

      {step === 'mapping' && parsed && mapping && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Map CSV Columns to Contact Fields</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {parsed.rowCount.toLocaleString()} rows detected in <span className="font-medium">{file?.name}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={resetImport} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 gap-3">
              {ALL_CONTACT_FIELDS.map(field => {
                const currentMapping = (mapping as any)[field] as ColumnMapping | undefined;
                const isOfficeField = field === 'office';
                const isSalesRepField = field === 'sales_rep';
                const isPerRowField = isOfficeField || isSalesRepField;
                const unmappedPlaceholder = isOfficeField
                  ? '-- not mapped (use default office) --'
                  : isSalesRepField
                  ? '-- not mapped (no sales rep assigned) --'
                  : '-- not mapped --';
                return (
                  <div key={field}>
                    <div className={`flex items-center gap-4 p-3 rounded-lg ${isPerRowField ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                      <div className="w-40 flex-shrink-0">
                        <span className="text-sm font-medium text-gray-700">{CONTACT_FIELD_LABELS[field]}</span>
                        {field === 'email' && (
                          <span className="ml-1 text-xs text-blue-600">(dedup)</span>
                        )}
                        {isPerRowField && (
                          <span className="ml-1 text-xs text-blue-600">(per-row)</span>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <select
                        value={currentMapping?.sourceColumn || ''}
                        onChange={e => updateMapping(field, e.target.value)}
                        className={`flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          currentMapping ? 'border-green-300 bg-green-50' : 'border-gray-300'
                        }`}
                      >
                        <option value="">{unmappedPlaceholder}</option>
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
                    {isOfficeField && currentMapping && (
                      <p className="text-xs text-blue-600 mt-1 ml-1">
                        Office values in your CSV should match office names exactly. Unrecognized values will use the first office as a fallback.
                      </p>
                    )}
                    {isOfficeField && !currentMapping && (
                      <p className="text-xs text-gray-400 mt-1 ml-1">
                        Map a CSV column here to assign each contact to a specific office per row.
                      </p>
                    )}
                    {isSalesRepField && currentMapping && (
                      <p className="text-xs text-blue-600 mt-1 ml-1">
                        Sales rep values should match a user's full name or username. Unrecognized values will leave the field blank (assignable in the review step).
                      </p>
                    )}
                    {isSalesRepField && !currentMapping && (
                      <p className="text-xs text-gray-400 mt-1 ml-1">
                        Map a CSV column here to assign each contact to a specific sales rep. You can also set this per-row in the review step.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {!mapping.first_name && !mapping.last_name && !mapping.full_name && !mapping.company_name && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                At minimum, map a name field (First Name, Last Name, Full Name, or Company Name) to proceed.
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={runValidation}
                disabled={!mapping.first_name && !mapping.last_name && !mapping.full_name && !mapping.company_name}
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
              { label: updateDuplicates ? 'Duplicates (update)' : 'Duplicates (skip)', count: duplicateCount, color: updateDuplicates ? 'blue' : 'gray', icon: SkipForward, filter: 'duplicates' },
              { label: 'Errors', count: errorCount, color: 'red', icon: AlertCircle, filter: 'errors' },
              { label: 'Warnings', count: warningCount, color: 'yellow', icon: AlertCircle, filter: 'warnings' },
            ].map(({ label, count, color, icon: Icon, filter }) => (
              <button
                key={filter}
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

          {duplicateCount > 0 && (
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <RefreshCw className={`w-4 h-4 ${updateDuplicates ? 'text-blue-600' : 'text-gray-400'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-800">Update existing contacts on duplicate email</p>
                  <p className="text-xs text-gray-500">
                    {updateDuplicates
                      ? `${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} will be updated with data from this file`
                      : `${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} will be skipped`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleToggleUpdateDuplicates(!updateDuplicates)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  updateDuplicates ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  updateDuplicates ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or company..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="flex-1 text-sm border-none outline-none bg-transparent"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'valid', 'errors', 'warnings', 'duplicates'] as const).map(f => (
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
                pagedValidations.map(v => {
                  const name = getContactName(v.cleanedData);
                  const hasIssues = v.errors.length > 0 || v.warnings.length > 0;
                  return (
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
                          <span className="font-medium text-gray-800 text-sm">{name || '(no name)'}</span>
                          {v.cleanedData.company_name && name !== v.cleanedData.company_name && (
                            <span className="text-gray-400 text-xs">{v.cleanedData.company_name}</span>
                          )}
                          {v.cleanedData.email && (
                            <span className="text-blue-600 text-xs">{v.cleanedData.email}</span>
                          )}
                          {v.cleanedData.phone && (
                            <span className="text-gray-500 text-xs">{v.cleanedData.phone}</span>
                          )}
                          {v.cleanedData.city && v.cleanedData.state && (
                            <span className="text-gray-400 text-xs">{v.cleanedData.city}, {v.cleanedData.state}</span>
                          )}
                        </div>

                        {hasIssues && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {v.errors.map((e, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                <AlertCircle className="w-3 h-3" /> {e}
                              </span>
                            ))}
                            {v.warnings.map((w, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">
                                <AlertCircle className="w-3 h-3" /> {w}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {v.isDuplicate && (
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            !v.skipped && updateDuplicates
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {!v.skipped && updateDuplicates ? 'will update' : 'duplicate'}
                          </span>
                        )}
                        <select
                          value={v.officeId}
                          onChange={e => updateRowOffice(v.rowIndex, e.target.value)}
                          disabled={v.skipped}
                          className="border border-gray-200 rounded px-2 py-0.5 text-xs text-gray-600 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-400 disabled:opacity-40"
                          title="Office assignment for this contact"
                        >
                          {offices.map(o => (
                            <option key={o.id} value={o.id}>{o.office_name}</option>
                          ))}
                        </select>
                        {salesReps.length > 0 && (
                          <select
                            value={v.assignedToId}
                            onChange={e => updateRowSalesRep(v.rowIndex, e.target.value)}
                            disabled={v.skipped}
                            className="border border-gray-200 rounded px-2 py-0.5 text-xs text-gray-600 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-400 disabled:opacity-40"
                            title="Sales rep assignment for this contact"
                          >
                            <option value="">-- no sales rep --</option>
                            {salesReps.map(r => (
                              <option key={r.id} value={r.id}>{getSalesRepName(r)}</option>
                            ))}
                          </select>
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          v.skipped ? 'bg-gray-100 text-gray-500' :
                          v.errors.length > 0 ? 'bg-red-100 text-red-600' :
                          v.warnings.length > 0 ? 'bg-yellow-100 text-yellow-600' :
                          'bg-green-100 text-green-600'
                        }`}>
                          {v.skipped ? 'skip' : v.errors.length > 0 ? 'error' : v.warnings.length > 0 ? 'warning' : 'ready'}
                        </span>
                      </div>
                    </div>
                  );
                })
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
              {(errorCount > 0 || duplicateCount > 0) && (
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
              <Users className="w-4 h-4" />
              Import {validCount.toLocaleString()} Contacts
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
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Importing Contacts...</h3>
          <p className="text-gray-500 mb-6">Processing in batches of 100 rows</p>
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
          <p className="text-gray-500 mb-8">Your customer list has been successfully imported.</p>

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
                  <AlertCircle className="w-4 h-4" /> Some rows failed to insert
                </p>
                <ul className="text-xs text-red-600 space-y-1">
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
