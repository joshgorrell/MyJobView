import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Upload, AlertCircle, CheckCircle, X, Clock, Download, Save,
  ArrowRight, Undo2, History, ChevronDown, ChevronUp, Sparkles,
  Timer
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import {
  parseCSV,
  detectColumnMapping,
  validateMapping,
  applyMapping,
  type ParsedCSV,
  type SmartColumnMap,
  type ColumnMapping
} from '../../lib/csvParser';
import {
  getOrganizationTimezone,
  createTimestampInTimezone,
  normalizeDateString
} from '../../lib/timezoneUtils';

interface ImportProfile {
  id: string;
  name: string;
  description?: string;
  column_mapping: SmartColumnMap;
  use_count: number;
  last_used_at: string;
}

interface ImportHistory {
  id: string;
  created_at: string;
  batch_id: string;
  file_name: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  status: string;
  rollback_at?: string;
  import_type?: string;
}

interface ValidationResult {
  valid: boolean;
  row: Record<string, string>;
  rowNumber: number;
  errors: string[];
  warnings: string[];
  matchedEmployee?: { id: string; name: string };
  calculatedHours?: number;
  skipped?: boolean;
  suggestions?: {
    employees?: Array<{ id: string; name: string; similarity: number }>;
  };
}

type ImportStep = 'upload' | 'mapping' | 'validation' | 'complete';

const DAILY_TIME_CONFIG = {
  label: 'Daily Time',
  description: 'Shift clock entries — total hours or clock in/out per day per employee',
  icon: Timer,
  templateHeaders: 'First Name,Last Name,Date,Hours,Clock In,Clock Out,Notes',
  templateRows: [
    'Ryan,Kinney,2024-02-10,8.5,,,Payroll hours only',
    'Jane,Smith,2024-02-10,7.5,08:00,15:30,Clock times provided',
    'Bob,Johnson,2024-02-10,,08:00,16:00,Clock in/out only'
  ],
  templateFilename: 'daily_time_import_template.csv'
};

const MAPPING_FIELDS: Array<keyof SmartColumnMap> = [
  'employee', 'firstName', 'lastName', 'date', 'hours', 'clockIn', 'clockOut', 'breakMinutes', 'notes'
];

const FIELD_LABELS: Record<string, string> = {
  employee: 'Employee (full name)',
  firstName: 'First Name',
  lastName: 'Last Name',
  date: 'Date',
  hours: 'Hours',
  clockIn: 'Clock In',
  clockOut: 'Clock Out',
  breakMinutes: 'Break Minutes',
  notes: 'Notes'
};

export function TimeClockCSVImport({ onClose, onImportComplete }: { onClose: () => void; onImportComplete: () => void }) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<SmartColumnMap | null>(null);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState({ success: 0, failed: 0, batchId: '', errors: [] as Array<{ row: number; error: string }> });
  const [profiles, setProfiles] = useState<ImportProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const [autoFixing, setAutoFixing] = useState(false);
  const [orgTimezone, setOrgTimezone] = useState<string>('America/Chicago');
  const [confirmRollbackBatchId, setConfirmRollbackBatchId] = useState<string | null>(null);

  useEffect(() => {
    loadTimezone();
    loadProfiles();
    loadHistory();
  }, []);

  const loadTimezone = async () => {
    const tz = await getOrganizationTimezone();
    setOrgTimezone(tz);
  };

  const loadProfiles = async () => {
    const { data } = await supabase
      .from('time_entry_import_profiles')
      .select('*')
      .eq('import_type', 'daily_time')
      .order('last_used_at', { ascending: false, nullsFirst: false });
    if (data) setProfiles(data);
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('time_entry_import_history')
      .select('*')
      .eq('import_type', 'daily_time')
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setHistory(data);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setFile(selectedFile);
    const text = await selectedFile.text();
    const parsedCSV = parseCSV(text);
    setParsed(parsedCSV);

    const detectedMapping = detectColumnMapping(parsedCSV, 'daily_time');
    setMapping(detectedMapping);
    setStep('mapping');
  };

  const applyProfile = (profileId: string) => {
    const selected = profiles.find(p => p.id === profileId);
    if (selected && parsed) {
      setMapping(selected.column_mapping);
      setSelectedProfile(profileId);
    }
  };

  const saveAsProfile = async () => {
    if (!mapping || !newProfileName.trim()) return;

    const { error } = await supabase
      .from('time_entry_import_profiles')
      .insert({
        name: newProfileName,
        import_type: 'daily_time',
        column_mapping: mapping,
        use_count: 1,
        created_by: user?.id
      });

    if (!error) {
      await loadProfiles();
      setShowSaveProfile(false);
      setNewProfileName('');
    }
  };

  const updateMapping = (field: keyof SmartColumnMap, sourceColumn: string | null) => {
    if (!mapping || !parsed) return;

    const newMapping = { ...mapping };

    if (sourceColumn === null || sourceColumn === '') {
      delete (newMapping as any)[field];
    } else {
      const columnIndex = parsed.headers.indexOf(sourceColumn);
      const samples = parsed.rows.slice(0, 3).map(row => row[columnIndex]).filter(v => v);
      (newMapping as any)[field] = {
        sourceColumn,
        targetField: field,
        confidence: 1.0,
        samples
      };
    }

    const mappedColumns = new Set(
      Object.values(newMapping)
        .filter((v): v is ColumnMapping => v !== undefined && typeof v === 'object' && 'sourceColumn' in v)
        .map(cm => cm.sourceColumn)
    );
    newMapping.unmapped = parsed.headers.filter(h => !mappedColumns.has(h));

    setMapping(newMapping);
  };

  const proceedToValidation = async () => {
    if (!parsed || !mapping) return;

    const validation = validateMapping(mapping, 'daily_time');
    if (!validation.isValid) {
      alert(`Missing required field mappings:\n\n${validation.errors.join('\n')}\n\nPlease map all required fields before continuing.`);
      return;
    }

    const mappedData = applyMapping(parsed, mapping);
    await validateData(mappedData);
    setStep('validation');
  };

  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;

    const matrix: number[][] = [];
    for (let i = 0; i <= shorter.length; i++) matrix[i] = [i];
    for (let j = 0; j <= longer.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= shorter.length; i++) {
      for (let j = 1; j <= longer.length; j++) {
        if (shorter.charAt(i - 1) === longer.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return (longer.length - matrix[shorter.length][longer.length]) / longer.length;
  };

  const findEmployeeSuggestions = (
    empValue: string,
    employees: Array<{ id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null }>
  ) => {
    const lower = empValue.toLowerCase().trim();

    const fuzzySuggestions = employees
      .map(e => {
        const fullName = e.full_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || e.email || '';
        return {
          id: e.id,
          name: fullName,
          similarity: calculateSimilarity(lower, fullName.toLowerCase())
        };
      })
      .filter(s => s.similarity > 0.4)
      .sort((a, b) => b.similarity - a.similarity);

    const lastNameMatches = employees
      .filter(e => {
        const lastName = e.last_name?.toLowerCase() || e.full_name?.split(' ').pop()?.toLowerCase() || '';
        return lastName === lower && !fuzzySuggestions.find(s => s.id === e.id);
      })
      .map(e => {
        const fullName = e.full_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || e.email || '';
        return { id: e.id, name: fullName, similarity: 0.75 };
      });

    return [...fuzzySuggestions, ...lastNameMatches]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  };

  const normalizeEmployeeName = (e: { full_name: string | null; first_name: string | null; last_name: string | null; email: string | null }) => {
    const fn = e.first_name?.trim() || '';
    const ln = e.last_name?.trim() || '';
    return (e.full_name?.trim() || [fn, ln].filter(Boolean).join(' ') || e.email || '').trim();
  };

  const validateData = async (data: Record<string, string>[]) => {
    const { data: employees } = await supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, email');

    const validationResults: ValidationResult[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const result: ValidationResult = {
        valid: true,
        row,
        rowNumber: i + 1,
        errors: [],
        warnings: []
      };

      let empValue = row.employee?.trim() || '';

      if (empValue.includes(',')) {
        const parts = empValue.split(',').map(p => p.trim());
        if (parts.length === 2) {
          empValue = `${parts[1]} ${parts[0]}`;
        }
      }

      if (!empValue) {
        result.errors.push('Missing employee name');
        result.valid = false;
      } else if (employees) {
        const lower = empValue.toLowerCase();

        const exactMatch = employees.find(e => {
          const fullName = normalizeEmployeeName(e);
          const fn = e.first_name?.trim().toLowerCase() || '';
          const ln = e.last_name?.trim().toLowerCase() || '';
          return (
            fullName.toLowerCase() === lower ||
            e.email?.toLowerCase() === lower ||
            (ln && ln === lower) ||
            (fn && ln && `${fn} ${ln}` === lower)
          );
        });

        if (exactMatch) {
          result.matchedEmployee = { id: exactMatch.id, name: normalizeEmployeeName(exactMatch) };
        } else {
          const suggestions = findEmployeeSuggestions(empValue, employees.map(e => ({
            ...e,
            full_name: normalizeEmployeeName(e),
            first_name: e.first_name?.trim() || null,
            last_name: e.last_name?.trim() || null
          })));

          if (suggestions.length > 0) {
            result.suggestions = { employees: suggestions };
            result.warnings.push(`"${empValue}" not found. Select the correct employee below.`);
          } else {
            result.errors.push(`Employee "${empValue}" not found in system`);
            result.valid = false;
          }
        }
      }

      if (!row.date) {
        result.errors.push('Missing date');
        result.valid = false;
      } else {
        const dateObj = new Date(row.date);
        if (isNaN(dateObj.getTime())) {
          result.errors.push(`Invalid date format: "${row.date}"`);
          result.valid = false;
        }
      }

      const hasHours = row.hours && row.hours.trim() !== '';
      const hasClockIn = row.clockIn && row.clockIn.trim() !== '';
      const hasClockOut = row.clockOut && row.clockOut.trim() !== '';

      if (hasHours) {
        const hours = parseFloat(row.hours);
        if (isNaN(hours) || hours < 0 || hours > 24) {
          result.errors.push('Invalid hours value');
          result.valid = false;
        } else {
          result.calculatedHours = hours;
          if (hours === 0) {
            result.skipped = true;
            result.warnings.push('Zero hours — will be skipped');
          }
        }
      } else if (!hasClockIn) {
        result.errors.push('Missing hours or clock in time');
        result.valid = false;
      } else if (hasClockIn && hasClockOut) {
        try {
          const clockInDate = new Date(`2000-01-01T${row.clockIn}`);
          const clockOutDate = new Date(`2000-01-01T${row.clockOut}`);
          if (!isNaN(clockInDate.getTime()) && !isNaN(clockOutDate.getTime())) {
            let diff = (clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60 * 60);
            if (diff < 0) diff += 24;
            result.calculatedHours = diff;
          }
        } catch {
          // handled during import
        }
      }

      validationResults.push(result);
    }

    setResults(validationResults);
  };

  const autoFixErrors = () => {
    setAutoFixing(true);
    const fixedResults = results.map(result => {
      if (!result.valid && result.suggestions?.employees && result.suggestions.employees.length > 0) {
        const bestMatch = result.suggestions.employees[0];
        return {
          ...result,
          matchedEmployee: { id: bestMatch.id, name: bestMatch.name },
          valid: result.errors.filter(e => !e.includes('not found')).length === 0,
          errors: result.errors.filter(e => !e.includes('not found')),
          warnings: [...result.warnings, `Auto-fixed: "${result.row.employee}" → "${bestMatch.name}"`]
        };
      }
      return result;
    });
    setResults(fixedResults);
    setAutoFixing(false);
  };

  const applySuggestion = (rowNumber: number, employeeId: string, employeeName: string) => {
    setResults(prev => prev.map(r => {
      if (r.rowNumber === rowNumber) {
        return {
          ...r,
          matchedEmployee: { id: employeeId, name: employeeName },
          valid: r.errors.filter(e => !e.includes('not found')).length === 0,
          errors: r.errors.filter(e => !e.includes('not found')),
          warnings: [...r.warnings.filter(w => !w.includes('not found') && !w.includes('Select the correct')), `Matched to: "${employeeName}"`]
        };
      }
      return r;
    }));
  };

  const buildClockTimestamps = (row: Record<string, string>, entryDate: string) => {
    const normalizedDate = normalizeDateString(entryDate);
    const hasHours = row.hours && row.hours.trim() !== '';
    const hasClockIn = row.clockIn && row.clockIn.trim() !== '';
    let clockIn: string;
    let clockOut: string | null = null;
    let totalHours: number;
    let payrollHoursOnly = false;

    if (hasHours && !hasClockIn) {
      clockIn = createTimestampInTimezone(normalizedDate, '12:00', orgTimezone);
      clockOut = null;
      totalHours = parseFloat(row.hours);
      payrollHoursOnly = true;
    } else if (hasHours) {
      clockIn = createTimestampInTimezone(normalizedDate, row.clockIn, orgTimezone);
      totalHours = parseFloat(row.hours);
      if (row.clockOut?.trim()) {
        const clockOutTime = row.clockOut;
        const clockInDate = new Date(clockIn);
        const testSameDay = createTimestampInTimezone(normalizedDate, clockOutTime, orgTimezone);
        if (new Date(testSameDay) <= clockInDate) {
          const nextDay = new Date(normalizedDate);
          nextDay.setDate(nextDay.getDate() + 1);
          clockOut = createTimestampInTimezone(nextDay.toISOString().split('T')[0], clockOutTime, orgTimezone);
        } else {
          clockOut = testSameDay;
        }
      }
    } else {
      clockIn = createTimestampInTimezone(normalizedDate, row.clockIn, orgTimezone);
      if (row.clockOut?.trim()) {
        const clockOutTime = row.clockOut;
        const clockInDate = new Date(clockIn);
        const testSameDay = createTimestampInTimezone(normalizedDate, clockOutTime, orgTimezone);
        if (new Date(testSameDay) <= clockInDate) {
          const nextDay = new Date(normalizedDate);
          nextDay.setDate(nextDay.getDate() + 1);
          clockOut = createTimestampInTimezone(nextDay.toISOString().split('T')[0], clockOutTime, orgTimezone);
        } else {
          clockOut = testSameDay;
        }
        totalHours = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / (1000 * 60 * 60);
      } else {
        clockOut = null;
        totalHours = 0;
      }
    }

    return { clockIn, clockOut, totalHours, payrollHoursOnly };
  };

  const importData = async () => {
    if (!mapping || !user) return;

    const validRows = results.filter(r => r.valid && !r.skipped && r.matchedEmployee);
    if (validRows.length === 0) {
      alert('No valid rows to import');
      return;
    }

    setImporting(true);
    const batchId = crypto.randomUUID();
    let successCount = 0;
    let failCount = 0;
    const importErrors: Array<{ row: number; error: string }> = [];

    try {
      for (const result of validRows) {
        const row = result.row;
        const entryDate = normalizeDateString(row.date);
        const { clockIn, clockOut, totalHours, payrollHoursOnly } = buildClockTimestamps(row, entryDate);

        const { data: techProfile } = await supabase
          .from('profiles')
          .select('office_id, org_id, organization_id')
          .eq('id', result.matchedEmployee!.id)
          .maybeSingle();

        const orgId = techProfile?.org_id || techProfile?.organization_id || profile?.org_id;

        const { error } = await supabase
          .from('daily_clock_entries')
          .insert({
            technician_id: result.matchedEmployee!.id,
            entry_date: entryDate,
            clock_in: clockIn,
            clock_out: clockOut,
            total_hours: totalHours,
            payroll_hours_only: payrollHoursOnly,
            status: 'clocked_out',
            admin_adjusted: true,
            adjusted_by: user.id,
            adjustment_reason: `CSV Import - Batch ${batchId}`,
            notes: row.notes || `Imported from ${file?.name}`,
            break_minutes: parseInt(row.breakMinutes || '0'),
            office_id: techProfile?.office_id || null,
            org_id: orgId
          });

        if (error) {
          importErrors.push({
            row: result.rowNumber,
            error: `${result.matchedEmployee!.name} (${entryDate}): ${error.message}`
          });
          failCount++;
        } else {
          successCount++;
        }
      }

      await supabase.from('time_entry_import_history').insert({
        batch_id: batchId,
        import_type: 'daily_time',
        file_name: file?.name || 'unknown.csv',
        total_rows: results.length,
        successful_rows: successCount,
        failed_rows: failCount,
        status: failCount === 0 ? 'completed' : 'partial',
        imported_by: user.id
      });

      if (selectedProfile) {
        await supabase
          .from('time_entry_import_profiles')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', selectedProfile);
      }

      setImportStats({ success: successCount, failed: failCount, batchId, errors: importErrors });
      setStep('complete');
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = [DAILY_TIME_CONFIG.templateHeaders, ...DAILY_TIME_CONFIG.templateRows].join('\n');
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = DAILY_TIME_CONFIG.templateFilename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const toggleError = (rowNumber: number) => {
    const newExpanded = new Set(expandedErrors);
    if (newExpanded.has(rowNumber)) newExpanded.delete(rowNumber);
    else newExpanded.add(rowNumber);
    setExpandedErrors(newExpanded);
  };

  const rollbackImport = async (batchId: string) => {
    const { error } = await supabase
      .from('daily_clock_entries')
      .delete()
      .eq('adjustment_reason', `CSV Import - Batch ${batchId}`);

    if (!error) {
      await supabase
        .from('time_entry_import_history')
        .update({ rollback_at: new Date().toISOString(), status: 'rolled_back' })
        .eq('batch_id', batchId);

      alert('Import rolled back successfully');
      await loadHistory();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-full sm:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Upload className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Import Time Entries</h3>
              <p className="text-sm text-gray-600">Smart CSV import with auto-fix and profiles</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <History className="w-4 h-4" />
              History
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {(['upload', 'mapping', 'validation', 'complete'] as ImportStep[]).map((s, idx) => {
              const steps: ImportStep[] = ['upload', 'mapping', 'validation', 'complete'];
              const currentIdx = steps.indexOf(step);
              const thisIdx = steps.indexOf(s);
              return (
                <div key={s} className="flex items-center">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                    step === s
                      ? 'bg-blue-600 text-white'
                      : currentIdx > thisIdx ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    <span className="text-sm font-medium capitalize">{s.replace('_', ' ')}</span>
                  </div>
                  {idx < 3 && <ArrowRight className="w-4 h-4 mx-2 text-gray-400" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Import History */}
          {showHistory && (
            <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Recent Imports</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No import history yet</p>
                )}
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{h.file_name}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(h.created_at).toLocaleString()} — {h.successful_rows}/{h.total_rows} successful
                        {h.status === 'rolled_back' && <span className="ml-2 text-red-600">Rolled back</span>}
                      </div>
                    </div>
                    {h.status !== 'rolled_back' && (
                      <button
                        onClick={() => setConfirmRollbackBatchId(h.batch_id)}
                        className="text-xs text-red-600 hover:text-red-700 ml-3"
                        title="Rollback this import"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <label className="block">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer inline-block hover:bg-blue-700 transition-colors">
                    Select CSV File
                  </span>
                </label>
                <p className="text-sm text-gray-500 mt-2">
                  Upload a CSV file with daily time data
                </p>
              </div>

              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 mx-auto"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-2">Smart Import Features:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-800">
                      <li>Supports separate First Name / Last Name columns</li>
                      <li>Fuzzy name matching with last-name-only detection</li>
                      <li>Automatic column detection and mapping</li>
                      <li>Map a combined date+time cell to both Date and Clock In/Out fields</li>
                      <li>Save mapping profiles for reuse</li>
                      <li>Full import history with rollback</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 'mapping' && mapping && parsed && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-4">Column Mapping</h4>

                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <span className="font-medium">Employee name:</span> Map the <strong>Employee</strong> field if your CSV has a single full-name column, OR map <strong>First Name</strong> + <strong>Last Name</strong> separately. Both approaches work.
                </div>

                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <div className="font-medium mb-1">Auto-detected columns:</div>
                      <div className="space-y-1">
                        {Object.entries(mapping)
                          .filter(([field]) => field !== 'unmapped' && mapping[field as keyof SmartColumnMap])
                          .map(([field, cm]) => {
                            const columnMapping = cm as ColumnMapping;
                            return columnMapping ? (
                              <div key={field} className="text-xs">
                                • <span className="font-medium">{columnMapping.sourceColumn}</span> → {FIELD_LABELS[field] || field}
                                {columnMapping.samples.length > 0 && (
                                  <span className="text-blue-600 ml-1">(e.g. "{columnMapping.samples[0]}")</span>
                                )}
                              </div>
                            ) : null;
                          })}
                      </div>
                    </div>
                  </div>
                </div>

                {profiles.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Use Saved Profile</label>
                    <select
                      value={selectedProfile}
                      onChange={(e) => applyProfile(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select a profile --</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} (used {p.use_count} times)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-3">
                  {MAPPING_FIELDS.map((field) => {
                    const cm = mapping[field] as ColumnMapping | undefined;
                    const isRequired = field === 'date';
                    const isNameField = field === 'employee' || field === 'firstName' || field === 'lastName';

                    return (
                      <div key={field} className={`border rounded-lg p-4 ${isNameField ? 'border-amber-200 bg-amber-50' : ''}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900 w-40 text-sm">
                            {FIELD_LABELS[field]}
                          </span>
                          {isRequired && <span className="text-red-500 text-sm">*</span>}
                          {isNameField && <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Name field</span>}
                          {cm && (
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              cm.confidence > 0.9 ? 'bg-green-100 text-green-700' :
                              cm.confidence > 0.7 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {Math.round(cm.confidence * 100)}% match
                            </span>
                          )}
                        </div>

                        <select
                          value={cm?.sourceColumn || ''}
                          onChange={(e) => updateMapping(field, e.target.value || null)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                            isRequired && !cm ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                          }`}
                        >
                          <option value="">Not mapped</option>
                          {parsed.headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>

                        {cm && cm.samples.length > 0 && (
                          <div className="mt-2 text-sm text-gray-600">
                            Sample: {cm.samples.slice(0, 3).join(', ')}
                          </div>
                        )}
                        {(['date', 'clockIn', 'clockOut'] as const).includes(field as any) && (
                          <div className="mt-1 text-xs text-blue-600">
                            Tip: If date &amp; time are in the same cell, map that column here — the {field === 'date' ? 'date' : 'time'} portion is extracted automatically.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-xs text-yellow-800">
                    <span className="font-medium">Time Tracking:</span> Map either <strong>Hours</strong> (total worked) OR <strong>Clock In</strong> (with optional Clock Out). Both are not required.
                  </div>
                </div>

                {mapping.unmapped.length > 0 && (
                  <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Ignored columns</strong> (not mapped — this is fine):&nbsp;
                      {mapping.unmapped.join(', ')}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSaveProfile(!showSaveProfile)}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Save className="w-4 h-4" />
                  Save as Profile
                </button>
              </div>

              {showSaveProfile && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Profile Name</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="e.g., ADP Export Format"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={saveAsProfile}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Validation */}
          {step === 'validation' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="text-green-600 font-medium">{results.filter(r => r.valid && !r.skipped).length} valid</span>
                  {' / '}
                  <span className="text-red-600 font-medium">{results.filter(r => !r.valid).length} errors</span>
                  {' / '}
                  <span className="text-yellow-600 font-medium">{results.filter(r => r.warnings.length > 0 && r.valid).length} warnings</span>
                  {' / '}
                  <span className="text-gray-500">{results.filter(r => r.skipped).length} skipped</span>
                </div>
                {results.some(r => !r.valid && r.suggestions?.employees) && (
                  <button
                    onClick={autoFixErrors}
                    disabled={autoFixing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    Auto-Fix All
                  </button>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">CSV Employee</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Matched To</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fix</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {results.map((result) => (
                        <tr key={result.rowNumber} className={
                          result.skipped ? 'bg-gray-50' :
                          !result.valid ? 'bg-red-50' :
                          result.warnings.length > 0 ? 'bg-yellow-50' : ''
                        }>
                          <td className="px-3 py-2 text-gray-500 text-xs">{result.rowNumber}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900 text-xs">{result.row.employee}</div>
                          </td>
                          <td className="px-3 py-2">
                            {result.matchedEmployee ? (
                              <div className="text-xs text-green-700 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                {result.matchedEmployee.name}
                              </div>
                            ) : (
                              <div className="text-xs text-red-600">No match</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">{result.row.date}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">
                            {result.row.hours || (result.calculatedHours != null ? result.calculatedHours.toFixed(2) : '—')}
                          </td>
                          <td className="px-3 py-2">
                            {result.valid && !result.skipped ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : result.skipped ? (
                              <span className="text-xs text-gray-500">Skipped</span>
                            ) : (
                              <button onClick={() => toggleError(result.rowNumber)}>
                                <AlertCircle className="w-4 h-4 text-red-600" />
                              </button>
                            )}
                            {result.warnings.length > 0 && result.valid && (
                              <button onClick={() => toggleError(result.rowNumber)} className="ml-1">
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                              </button>
                            )}
                            {expandedErrors.has(result.rowNumber) && (
                              <div className="mt-2 text-xs space-y-1 max-w-[200px]">
                                {result.errors.map((err, i) => (
                                  <div key={i} className="text-red-600 flex items-start gap-1">
                                    <ChevronDown className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    {err}
                                  </div>
                                ))}
                                {result.warnings.map((warn, i) => (
                                  <div key={i} className="text-yellow-700 flex items-start gap-1">
                                    <ChevronUp className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    {warn}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {result.suggestions?.employees && result.suggestions.employees.length > 0 && !result.matchedEmployee && (
                              <select
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  const [id, ...nameParts] = e.target.value.split('|');
                                  applySuggestion(result.rowNumber, id, nameParts.join('|'));
                                }}
                                className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
                              >
                                <option value="">Select employee...</option>
                                {result.suggestions.employees.map(s => (
                                  <option key={s.id} value={`${s.id}|${s.name}`}>
                                    {s.name} ({Math.round(s.similarity * 100)}%)
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {results.filter(r => !r.valid).length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  You can import the {results.filter(r => r.valid && !r.skipped).length} valid rows now, or resolve errors first using the dropdown in each row.
                </div>
              )}
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="space-y-4">
              <div className="text-center space-y-4">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
                <h4 className="text-xl font-semibold text-gray-900">Import Complete!</h4>
                <div className="text-gray-600">
                  <p>Successfully imported {importStats.success} daily time entries</p>
                  {importStats.failed > 0 && (
                    <p className="text-red-600 mt-1">{importStats.failed} entries failed</p>
                  )}
                </div>
                <div className="text-xs text-gray-500">Batch ID: {importStats.batchId}</div>
              </div>

              {importStats.errors && importStats.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg bg-red-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <h5 className="font-semibold text-red-900">Import Errors</h5>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {importStats.errors.map((err, i) => (
                      <div key={i} className="text-sm text-red-800 bg-white rounded px-3 py-2 border border-red-200">
                        <span className="font-medium">Row {err.row}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-between flex-shrink-0">
          <button
            onClick={() => {
              if (step === 'upload') onClose();
              else if (step === 'mapping') { setStep('upload'); setMapping(null); setParsed(null); setFile(null); }
              else if (step === 'validation') setStep('mapping');
              else onClose();
            }}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {step === 'complete' ? 'Close' : step === 'upload' ? 'Cancel' : 'Back'}
          </button>
          <div className="flex gap-3">
            {step === 'mapping' && (
              <button
                onClick={proceedToValidation}
                disabled={!mapping}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                Next: Validate Data
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 'validation' && (
              <button
                onClick={importData}
                disabled={importing || results.filter(r => r.valid && !r.skipped).length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50 hover:bg-green-700 transition-colors"
              >
                {importing ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import {results.filter(r => r.valid && !r.skipped).length} Entries
                  </>
                )}
              </button>
            )}
            {step === 'complete' && (
              <button
                onClick={() => { onImportComplete(); onClose(); }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmRollbackBatchId !== null}
        title="Rollback Import"
        message="Are you sure you want to rollback this import? All entries will be deleted."
        variant="danger"
        confirmLabel="Rollback"
        onConfirm={() => {
          if (confirmRollbackBatchId) rollbackImport(confirmRollbackBatchId);
          setConfirmRollbackBatchId(null);
        }}
        onCancel={() => setConfirmRollbackBatchId(null)}
      />
    </div>
  );
}
