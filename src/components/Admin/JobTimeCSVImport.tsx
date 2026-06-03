import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Upload, FileText, AlertCircle, CheckCircle, X, Download, Save,
  ArrowRight, Edit2, Undo2, History, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
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
}

interface ValidationResult {
  valid: boolean;
  row: Record<string, string>;
  rowNumber: number;
  errors: string[];
  warnings: string[];
  matchedEmployee?: { id: string; name: string };
  matchedWorkOrder?: { id: string; number: string; title: string };
  calculatedHours?: number;
  skipped?: boolean;
  suggestions?: {
    employees?: Array<{ id: string; name: string; similarity: number }>;
    workOrders?: Array<{ id: string; number: string; title: string }>;
  };
}

type ImportStep = 'upload' | 'mapping' | 'validation' | 'complete';

export function JobTimeCSVImport() {
  const { profile } = useAuth();
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<SmartColumnMap | null>(null);
  const [editableData, setEditableData] = useState<Record<string, string>[]>([]);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState({ success: 0, failed: 0, batchId: '' });

  const [profiles, setProfiles] = useState<ImportProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const [editingRow, setEditingRow] = useState<{ index: number; data: Record<string, string> } | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; error: string }>>([]);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmRollbackBatchId, setConfirmRollbackBatchId] = useState<string | null>(null);

  // Load import profiles and history
  useEffect(() => {
    loadProfiles();
    loadHistory();
  }, []);

  const loadProfiles = async () => {
    const { data } = await supabase
      .from('time_entry_import_profiles')
      .select('*')
      .order('last_used_at', { ascending: false, nullsFirst: false });

    if (data) setProfiles(data);
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('time_entry_import_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) setHistory(data);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    setFile(selectedFile);

    try {
      const text = await selectedFile.text();
      const parsedData = parseCSV(text);
      setParsed(parsedData);

      // Auto-detect column mapping
      const detectedMapping = detectColumnMapping(parsedData);
      setMapping(detectedMapping);

      setStep('mapping');
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('Error parsing CSV file. Please check the format.');
    }
  };

  const applyProfile = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile && parsed) {
      setMapping(profile.column_mapping);
      setSelectedProfile(profileId);
    }
  };

  const saveProfile = async () => {
    if (!newProfileName.trim() || !mapping) return;

    const { error } = await supabase
      .from('time_entry_import_profiles')
      .insert({
        name: newProfileName.trim(),
        column_mapping: mapping,
        created_by: profile?.id,
        file_format_hint: file?.name || null
      });

    if (!error) {
      setShowSaveProfile(false);
      setNewProfileName('');
      loadProfiles();
      alert('Profile saved successfully!');
    } else {
      alert('Error saving profile');
    }
  };

  const updateMapping = (field: keyof SmartColumnMap, sourceColumn: string | null) => {
    if (!mapping || !parsed) return;

    const newMapping = { ...mapping };

    if (sourceColumn === null) {
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

    // Update unmapped columns — a column is "unmapped" only if no field references it.
    // The same source column CAN be mapped to multiple fields (e.g. date AND clockIn
    // from a combined date-time cell), so we just track which headers have at least one mapping.
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

    const validation = validateMapping(mapping);
    if (!validation.isValid) {
      alert(`Missing required fields: ${validation.missing.join(', ')}`);
      return;
    }

    // Apply mapping to get row data (applyMapping accepts ParsedCSV directly)
    const mappedData = applyMapping(parsed, mapping);
    setEditableData(mappedData);

    // Validate rows
    await validateRows(mappedData);

    setStep('validation');
  };

  const calculateSimilarity = (str1: string, str2: string): number => {
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();

    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
    for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
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

    const maxLength = Math.max(str1.length, str2.length);
    return 1 - matrix[str2.length][str1.length] / maxLength;
  };

  const validateRows = async (data: Record<string, string>[]) => {
    const { data: employees, error: empError } = await supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, email')
      .eq('is_active', true);

    if (empError) {
      console.error('Failed to load employees:', empError);
    }

    const { data: workOrders } = await supabase
      .from('work_orders')
      .select('id, work_order_number, title, status');

    const validationResults: ValidationResult[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const errors: string[] = [];
      const warnings: string[] = [];
      let matchedEmployee;
      let matchedWorkOrder;
      let calculatedHours = 0;
      const suggestions: { employees?: any[]; workOrders?: any[] } = {};

      // Validate employee with suggestions
      const empValue = (row.employee || '').trim();
      if (!empValue) {
        errors.push('Employee name is required');
      } else {
        const empLower = empValue.toLowerCase();
        matchedEmployee = employees?.find(e => {
          const fullName = (e.full_name || '').toLowerCase().trim();
          const firstLast = `${(e.first_name || '').trim()} ${(e.last_name || '').trim()}`.toLowerCase().trim();
          const lastFirst = `${(e.last_name || '').trim()} ${(e.first_name || '').trim()}`.toLowerCase().trim();
          return (
            fullName === empLower ||
            firstLast === empLower ||
            lastFirst === empLower ||
            fullName.includes(empLower) ||
            empLower.includes(fullName)
          );
        });

        if (matchedEmployee) {
          matchedEmployee = { id: matchedEmployee.id, name: matchedEmployee.full_name || empValue };
        } else {
          const similarEmployees = employees
            ?.map(e => ({
              id: e.id,
              name: e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
              similarity: Math.max(
                calculateSimilarity(empValue, e.full_name || ''),
                calculateSimilarity(empValue, `${e.first_name || ''} ${e.last_name || ''}`.trim())
              )
            }))
            .filter(e => e.similarity > 0.4)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3);

          if (similarEmployees && similarEmployees.length > 0) {
            suggestions.employees = similarEmployees;
            errors.push(`Employee "${empValue}" not found. Did you mean: ${similarEmployees[0].name}?`);
          } else {
            const allNames = employees?.map(e => e.full_name).filter(Boolean).join(', ') || 'none';
            errors.push(`Employee "${empValue}" not found (available: ${allNames})`);
          }
        }
      }

      // Validate date
      if (!row.date) {
        errors.push('Date is required');
      } else {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/;
        if (!dateRegex.test(row.date)) {
          errors.push(`Invalid date format: "${row.date}"`);
        }
      }

      // Work order is optional — if provided, try to match; if not found, warn (not error)
      const woValue = row.workOrder || '';
      if (woValue) {
        matchedWorkOrder = workOrders?.find(wo =>
          wo.work_order_number.toLowerCase() === woValue.toLowerCase()
        );

        if (!matchedWorkOrder) {
          const similarWorkOrders = workOrders
            ?.filter(wo =>
              wo.work_order_number.toLowerCase().includes(woValue.toLowerCase()) ||
              calculateSimilarity(woValue, wo.work_order_number) > 0.7
            )
            .slice(0, 3)
            .map(wo => ({ id: wo.id, number: wo.work_order_number, title: wo.title }));

          if (similarWorkOrders && similarWorkOrders.length > 0) {
            suggestions.workOrders = similarWorkOrders;
            warnings.push(`Work Order "${woValue}" not found. Similar: ${similarWorkOrders.map(w => w.number).join(', ')}`);
          } else {
            warnings.push(`Work Order "${woValue}" not found — will import without work order link`);
          }
        } else if (!['assigned', 'in_progress', 'pending', 'completed'].includes(matchedWorkOrder.status)) {
          warnings.push(`Work Order status is "${matchedWorkOrder.status}"`);
        }
      }

      // Validate hours
      if (row.hours) {
        calculatedHours = parseFloat(row.hours);
        if (calculatedHours === 0) {
          validationResults.push({
            valid: true,
            row,
            rowNumber: i + 1,
            errors: [],
            warnings: ['Row skipped: 0 hours worked'],
            matchedEmployee,
            matchedWorkOrder,
            calculatedHours: 0,
            skipped: true
          });
          continue;
        }
        if (isNaN(calculatedHours) || calculatedHours < 0) {
          errors.push('Hours must be a positive number');
        } else if (calculatedHours > 24) {
          warnings.push('Hours exceed 24 in a single day');
        }
      } else if (row.clockIn && row.clockOut) {
        const breakMins = parseInt(row.breakMinutes || '0');
        calculatedHours = calculateHours(row.clockIn, row.clockOut, breakMins);

        if (calculatedHours === 0) {
          validationResults.push({
            valid: true,
            row,
            rowNumber: i + 1,
            errors: [],
            warnings: ['Row skipped: 0 hours worked'],
            matchedEmployee,
            matchedWorkOrder,
            calculatedHours: 0,
            skipped: true
          });
          continue;
        }
        if (calculatedHours < 0) {
          errors.push('Clock out must be after clock in');
        } else if (calculatedHours > 24) {
          warnings.push('Calculated hours exceed 24');
        }
      } else {
        errors.push('Either Hours or Clock In/Out required');
      }

      validationResults.push({
        valid: errors.length === 0,
        row,
        rowNumber: i + 1,
        errors,
        warnings,
        matchedEmployee,
        matchedWorkOrder,
        calculatedHours,
        suggestions: Object.keys(suggestions).length > 0 ? suggestions : undefined
      });
    }

    setResults(validationResults);
  };

  const applyAutoFix = (rowIndex: number, field: 'employee' | 'workOrder', value: string) => {
    const newData = [...editableData];
    newData[rowIndex] = { ...newData[rowIndex], [field]: value };
    setEditableData(newData);
    validateRows(newData);
  };

  const applyBulkAutoFix = async () => {
    setAutoFixing(true);
    const newData = [...editableData];
    let fixCount = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result.valid && result.suggestions) {
        // Auto-fix employee if there's a high-confidence suggestion
        if (result.suggestions.employees && result.suggestions.employees[0]?.similarity > 0.8) {
          newData[i].employee = result.suggestions.employees[0].name;
          fixCount++;
        }
        // Auto-fix work order if there's only one suggestion
        if (result.suggestions.workOrders && result.suggestions.workOrders.length === 1) {
          newData[i].workOrder = result.suggestions.workOrders[0].number;
          fixCount++;
        }
      }
    }

    setEditableData(newData);
    await validateRows(newData);
    setAutoFixing(false);

    if (fixCount > 0) {
      alert(`Auto-fixed ${fixCount} fields. Please review before importing.`);
    } else {
      alert('No high-confidence auto-fixes available.');
    }
  };

  const calculateHours = (clockIn: string, clockOut: string, breakMinutes: number = 0): number => {
    try {
      const inTime = new Date(`2000-01-01T${clockIn}`);
      const outTime = new Date(`2000-01-01T${clockOut}`);
      const diffMs = outTime.getTime() - inTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const breakHours = breakMinutes / 60;
      return Math.max(0, diffHours - breakHours);
    } catch {
      return 0;
    }
  };

  const editCell = (rowIndex: number, field: string, value: string) => {
    const newData = [...editableData];
    newData[rowIndex] = { ...newData[rowIndex], [field]: value };
    setEditableData(newData);

    // Re-validate
    validateRows(newData);
  };

  const handleImport = async () => {
    const validRows = results.filter(r => r.valid && !r.skipped);

    if (validRows.length === 0) {
      alert('No valid rows to import');
      return;
    }

    setImporting(true);
    setImportErrors([]);
    const startTime = Date.now();
    const batchId = crypto.randomUUID();

    // Create import history record — but don't block the import if this fails
    const { data: historyRecord, error: historyError } = await supabase
      .from('time_entry_import_history')
      .insert({
        imported_by: profile?.id,
        batch_id: batchId,
        file_name: file?.name,
        profile_id: selectedProfile || null,
        total_rows: results.length,
        status: 'processing'
      })
      .select()
      .single();

    if (historyError) {
      console.error('History record insert failed:', historyError);
    }

    // Only use import_batch_id if the history record was actually created
    const importBatchId = historyRecord ? batchId : null;

    let successCount = 0;
    let failedCount = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];

    try {
      for (const result of validRows) {
        try {
          if (!result.matchedEmployee?.id) {
            throw new Error(`No matched employee — employee ID is missing for "${result.row.employee}"`);
          }

          const dateStr = result.row.date.includes('/')
            ? new Date(result.row.date).toISOString().split('T')[0]
            : result.row.date;

          let clockInTimestamp, clockOutTimestamp;

          if (result.row.clockIn && result.row.clockOut) {
            clockInTimestamp = new Date(`${dateStr}T${result.row.clockIn}`).toISOString();
            clockOutTimestamp = new Date(`${dateStr}T${result.row.clockOut}`).toISOString();
          } else {
            const startOfDay = new Date(`${dateStr}T08:00:00`);
            clockInTimestamp = startOfDay.toISOString();

            const endTime = new Date(startOfDay);
            endTime.setHours(startOfDay.getHours() + Math.floor(result.calculatedHours!));
            endTime.setMinutes(Math.round((result.calculatedHours! % 1) * 60));
            clockOutTimestamp = endTime.toISOString();
          }

          const insertPayload: Record<string, unknown> = {
            technician_id: result.matchedEmployee.id,
            work_order_id: result.matchedWorkOrder?.id ?? null,
            entry_date: dateStr,
            clock_in: clockInTimestamp,
            clock_out: clockOutTimestamp,
            total_hours: result.calculatedHours,
            break_minutes: parseInt(result.row.breakMinutes || '0'),
            notes: result.row.notes || 'Imported from CSV',
            status: 'approved',
            approved_by: profile?.id,
            approved_at: new Date().toISOString(),
          };

          if (importBatchId) {
            insertPayload.import_batch_id = importBatchId;
          }

          const { error: insertError } = await supabase
            .from('time_entries')
            .insert(insertPayload);

          if (insertError) throw insertError;
          successCount++;
        } catch (error: any) {
          console.error('Error importing row:', result.rowNumber, error);
          failedCount++;
          errorDetails.push({
            row: result.rowNumber,
            error: error.message || String(error)
          });
        }
      }

      const processingTime = Date.now() - startTime;

      if (historyRecord) {
        await supabase
          .from('time_entry_import_history')
          .update({
            successful_rows: successCount,
            failed_rows: failedCount,
            skipped_rows: results.length - validRows.length,
            processing_time_ms: processingTime,
            error_details: errorDetails.length > 0 ? errorDetails : null,
            status: 'completed'
          })
          .eq('id', historyRecord.id);
      }

      if (selectedProfile) {
        await supabase
          .from('time_entry_import_profiles')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', selectedProfile);
      }

      setImportErrors(errorDetails);
      setImportStats({ success: successCount, failed: failedCount, batchId: importBatchId || '' });
      setStep('complete');
      loadHistory();

    } catch (error: any) {
      console.error('Error during import:', error);
      alert('Import failed: ' + (error.message || String(error)));

      if (historyRecord) {
        await supabase
          .from('time_entry_import_history')
          .update({ status: 'failed' })
          .eq('id', historyRecord.id);
      }
    } finally {
      setImporting(false);
    }
  };

  const rollbackImport = async (batchId: string) => {
    const { data, error } = await supabase.rpc('rollback_time_entry_import', {
      p_batch_id: batchId
    });

    if (error) {
      alert('Error rolling back import: ' + error.message);
    } else if (data.success) {
      alert(`Rollback successful! Deleted ${data.deleted_count} entries.`);
      loadHistory();
    } else {
      alert('Rollback failed: ' + data.error);
    }
  };

  const resetImport = () => {
    setFile(null);
    setParsed(null);
    setMapping(null);
    setEditableData([]);
    setResults([]);
    setStep('upload');
    setSelectedProfile('');
    setImportErrors([]);
  };

  const downloadTemplate = () => {
    const template = [
      'Employee Name,Date,Work Order Number,Hours,Clock In,Clock Out,Break Minutes,Notes',
      'John Doe,2024-02-10,WO-2024-001,8.5,,,,Worked on installation',
      'Jane Smith,2024-02-10,WO-2024-002,,08:00,16:30,30,Service call'
    ].join('\n');

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'job_time_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const toggleError = (rowNumber: number) => {
    const newExpanded = new Set(expandedErrors);
    if (newExpanded.has(rowNumber)) {
      newExpanded.delete(rowNumber);
    } else {
      newExpanded.add(rowNumber);
    }
    setExpandedErrors(newExpanded);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-900">Smart CSV Time Entry Import</h2>
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Upload any CSV format - we'll automatically detect and map your columns
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <History className="w-4 h-4" />
              Import History
            </button>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mt-6">
          {['upload', 'mapping', 'validation', 'complete'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
                step === s
                  ? 'bg-blue-100 text-blue-700'
                  : ['upload', 'mapping', 'validation', 'complete'].indexOf(step) > i
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
              {i < 3 && <ArrowRight className="w-4 h-4 mx-2 text-gray-400" />}
            </div>
          ))}
        </div>
      </div>

      {/* Import History */}
      {showHistory && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Imports</h3>
          <div className="space-y-3">
            {history.map(h => (
              <div key={h.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{h.file_name}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        h.status === 'completed' ? 'bg-green-100 text-green-700' :
                        h.status === 'rolled_back' ? 'bg-gray-100 text-gray-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {h.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {new Date(h.created_at).toLocaleString()} • {h.successful_rows} successful, {h.failed_rows} failed
                    </div>
                  </div>
                  {h.status === 'completed' && !h.rollback_at && (
                    <button
                      onClick={() => setConfirmRollbackBatchId(h.batch_id)}
                      className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Undo2 className="w-4 h-4" />
                      Rollback
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload CSV File</h3>

          <div className="space-y-4">
            <div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none p-2"
              />
            </div>

            {profiles.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Quick Start with Saved Profile:</h4>
                <div className="grid grid-cols-2 gap-2">
                  {profiles.slice(0, 4).map(p => (
                    <button
                      key={p.id}
                      onClick={() => document.getElementById('csv-file-input')?.click()}
                      className="text-left px-3 py-2 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 text-sm"
                    >
                      <div className="font-medium text-blue-900">{p.name}</div>
                      <div className="text-xs text-blue-600">Used {p.use_count} times</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && parsed && mapping && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Map Columns</h3>
            <button
              onClick={() => setShowSaveProfile(!showSaveProfile)}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Save className="w-4 h-4" />
              Save Mapping
            </button>
          </div>

          {showSaveProfile && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Profile name..."
                className="px-3 py-2 border rounded-lg mr-2"
              />
              <button
                onClick={saveProfile}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          )}

          {profiles.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or load a saved profile:
              </label>
              <select
                value={selectedProfile}
                onChange={(e) => applyProfile(e.target.value)}
                className="px-3 py-2 border rounded-lg"
              >
                <option value="">Select a profile...</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-4">
            {(['employee', 'date', 'workOrder', 'hours', 'clockIn', 'clockOut', 'breakMinutes', 'notes'] as const).map(field => {
              const cm = mapping[field] as ColumnMapping | undefined;
              const isRequired = ['employee', 'date'].includes(field);

              return (
                <div key={field} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-gray-900">
                          {field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                        </span>
                        {isRequired && <span className="text-red-500 text-sm">*</span>}
                        {cm && (
                          <span className={`px-2 py-1 text-xs rounded-full ${
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
                        className="px-3 py-2 border rounded-lg w-full"
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
                          Tip: If your CSV has date &amp; time in the same cell, you can map that column here — the system will extract the {field === 'date' ? 'date' : 'time'} portion automatically.
                        </div>
                      )}
                      {field === 'workOrder' && (
                        <div className="mt-1 text-xs text-gray-500">
                          Optional — rows without a matched work order will still import.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {mapping.unmapped.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Ignored columns</strong> (not mapped to any field — this is fine):&nbsp;
                {mapping.unmapped.join(', ')}
              </p>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={resetImport}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={proceedToValidation}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Next: Validate Data
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validation */}
      {step === 'validation' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Validation Results</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-600 font-medium">
                  {results.filter(r => r.valid).length} Valid
                </span>
                <span className="text-red-600 font-medium">
                  {results.filter(r => !r.valid).length} Invalid
                </span>
              </div>
              {results.some(r => !r.valid && r.suggestions) && (
                <button
                  onClick={applyBulkAutoFix}
                  disabled={autoFixing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  {autoFixing ? 'Auto-Fixing...' : 'Auto-Fix All'}
                </button>
              )}
            </div>
          </div>

          {/* Employee match summary */}
          {results.length > 0 && (() => {
            const matchedEmployees = results
              .filter(r => r.matchedEmployee)
              .reduce((acc, r) => {
                const key = r.matchedEmployee!.id;
                if (!acc[key]) acc[key] = { name: r.matchedEmployee!.name, count: 0 };
                acc[key].count++;
                return acc;
              }, {} as Record<string, { name: string; count: number }>);
            const unmatchedCount = results.filter(r => !r.matchedEmployee).length;
            const entries = Object.values(matchedEmployees);
            return (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-800 mb-2">Employees being linked:</p>
                <div className="flex flex-wrap gap-2">
                  {entries.map((emp, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 bg-white border border-blue-200 rounded-full text-xs font-medium text-blue-900">
                      <CheckCircle className="w-3 h-3 text-green-600" />
                      {emp.name}
                      <span className="text-blue-500">({emp.count} {emp.count === 1 ? 'entry' : 'entries'})</span>
                    </span>
                  ))}
                  {unmatchedCount > 0 && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-medium text-red-700">
                      <AlertCircle className="w-3 h-3" />
                      {unmatchedCount} unmatched
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={index}
                className={`border rounded-lg ${
                  result.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <div
                  className="p-3 cursor-pointer"
                  onClick={() => !result.valid && toggleError(result.rowNumber)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {result.valid ? (
                        <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                      )}
                      <span className="font-medium text-sm text-gray-700">Row {result.rowNumber}</span>
                      <span className="text-xs text-gray-400">•</span>
                      {result.matchedEmployee ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-800">
                          <CheckCircle className="w-3 h-3" />
                          {result.matchedEmployee.name}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-xs font-medium text-red-700">
                          <AlertCircle className="w-3 h-3" />
                          {result.row.employee || '(no employee)'}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-600">{result.row.date}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs font-medium text-gray-700">{result.calculatedHours?.toFixed(2)}h</span>
                      {result.matchedWorkOrder && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-600">WO #{result.matchedWorkOrder.number}</span>
                        </>
                      )}
                    </div>
                    {!result.valid && (
                      expandedErrors.has(result.rowNumber) ?
                        <ChevronUp className="w-4 h-4" /> :
                        <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {!result.valid && expandedErrors.has(result.rowNumber) && (
                  <div className="px-3 pb-3 space-y-3">
                    {result.errors.map((error, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    ))}

                    {/* Auto-fix suggestions */}
                    {result.suggestions?.employees && result.suggestions.employees.length > 0 && (
                      <div className="pt-2 border-t border-red-200">
                        <p className="text-xs font-medium text-gray-700 mb-2">Quick Fix - Employee Name:</p>
                        <div className="flex flex-wrap gap-2">
                          {result.suggestions.employees.map((emp, i) => (
                            <button
                              key={i}
                              onClick={() => applyAutoFix(index, 'employee', emp.name)}
                              className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200"
                            >
                              {emp.name} ({Math.round(emp.similarity * 100)}%)
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.suggestions?.workOrders && result.suggestions.workOrders.length > 0 && (
                      <div className="pt-2 border-t border-red-200">
                        <p className="text-xs font-medium text-gray-700 mb-2">Quick Fix - Work Order:</p>
                        <div className="flex flex-wrap gap-2">
                          {result.suggestions.workOrders.map((wo, i) => (
                            <button
                              key={i}
                              onClick={() => applyAutoFix(index, 'workOrder', wo.number)}
                              className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200"
                              title={wo.title}
                            >
                              {wo.number}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-red-200">
                      <button
                        onClick={() => setEditingRow({ index, data: result.row })}
                        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-700"
                      >
                        <Edit2 className="w-3 h-3" />
                        Manual Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {results.filter(r => !r.valid).length > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> You can import {results.filter(r => r.valid).length} valid rows now and fix the invalid rows later, or use auto-fix/manual edit to fix all rows before importing.
              </p>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep('mapping')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back to Mapping
            </button>
            <button
              onClick={() => setConfirmImport(true)}
              disabled={importing || results.filter(r => r.valid).length === 0}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <Upload className="w-5 h-5" />
              {importing ? 'Importing...' : `Import ${results.filter(r => r.valid).length} Valid ${results.filter(r => r.valid).length === 1 ? 'Entry' : 'Entries'}`}
            </button>
          </div>
        </div>
      )}

      {/* Edit Row Modal */}
      {editingRow && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Row {results[editingRow.index]?.rowNumber}
              </h3>
              <button
                onClick={() => setEditingRow(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee Name *
                </label>
                <input
                  type="text"
                  value={editingRow.data.employee || ''}
                  onChange={(e) => setEditingRow({
                    ...editingRow,
                    data: { ...editingRow.data, employee: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={editingRow.data.date || ''}
                  onChange={(e) => setEditingRow({
                    ...editingRow,
                    data: { ...editingRow.data, date: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Order Number *
                </label>
                <input
                  type="text"
                  value={editingRow.data.workOrder || ''}
                  onChange={(e) => setEditingRow({
                    ...editingRow,
                    data: { ...editingRow.data, workOrder: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hours
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRow.data.hours || ''}
                  onChange={(e) => setEditingRow({
                    ...editingRow,
                    data: { ...editingRow.data, hours: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={editingRow.data.notes || ''}
                  onChange={(e) => setEditingRow({
                    ...editingRow,
                    data: { ...editingRow.data, notes: e.target.value }
                  })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingRow(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  editCell(editingRow.index, 'employee', editingRow.data.employee);
                  editCell(editingRow.index, 'date', editingRow.data.date);
                  editCell(editingRow.index, 'workOrder', editingRow.data.workOrder);
                  editCell(editingRow.index, 'hours', editingRow.data.hours);
                  editCell(editingRow.index, 'notes', editingRow.data.notes);
                  setEditingRow(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-8">
            {importStats.success > 0 ? (
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            ) : (
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            )}
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">
              {importStats.success > 0 ? 'Import Complete!' : 'Import Failed'}
            </h3>
            <p className="text-gray-600 mb-2">
              {importStats.success > 0
                ? `Successfully imported ${importStats.success} time entries`
                : 'No entries were imported'}
              {importStats.failed > 0 && ` — ${importStats.failed} failed`}
            </p>
          </div>

          {importErrors.length > 0 && (
            <div className="mt-2 mb-6 border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-4 py-3 border-b border-red-200">
                <p className="text-sm font-semibold text-red-800">
                  {importErrors.length} row{importErrors.length !== 1 ? 's' : ''} failed — error details:
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-red-100">
                {importErrors.map((e, i) => (
                  <div key={i} className="px-4 py-2 flex items-start gap-3 bg-white">
                    <span className="text-xs font-medium text-gray-500 mt-0.5 w-14 shrink-0">Row {e.row}</span>
                    <span className="text-sm text-red-700 break-all">{e.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button
              onClick={resetImport}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Import Another File
            </button>
            {importStats.batchId && importStats.success > 0 && (
              <button
                onClick={() => setConfirmRollbackBatchId(importStats.batchId)}
                className="flex items-center gap-2 px-6 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
              >
                <Undo2 className="w-4 h-4" />
                Undo This Import
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmImport}
        title="Import Time Entries"
        message={`Import ${results.filter(r => r.valid && !r.skipped).length} time entries? This will add them to the system.`}
        variant="warning"
        confirmLabel="Import"
        onConfirm={() => {
          setConfirmImport(false);
          handleImport();
        }}
        onCancel={() => setConfirmImport(false)}
      />

      <ConfirmModal
        isOpen={confirmRollbackBatchId !== null}
        title="Rollback Import"
        message="Are you sure you want to rollback this import? This will delete all imported entries."
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
